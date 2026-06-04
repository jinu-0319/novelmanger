import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from passlib.context import CryptContext
from jose import JWTError, jwt

# ── 설정 ──────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "moneta-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS_FILE = os.path.join(
    os.path.dirname(__file__), "..", "data", "users.json"
)


# ── 유저 DB (JSON 파일) ────────────────────────────────────────────────────

def _load_users() -> list:
    path = os.path.abspath(USERS_FILE)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_users(users: list) -> None:
    path = os.path.abspath(USERS_FILE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


# ── 비밀번호 ──────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────

def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


# ── 비즈니스 로직 ─────────────────────────────────────────────────────────

def register_user(name: str, email: str, password: str) -> Dict[str, Any]:
    users = _load_users()
    if any(u["email"] == email for u in users):
        raise ValueError("이미 사용 중인 이메일입니다.")
    if len(password) < 6:
        raise ValueError("비밀번호는 6자 이상이어야 합니다.")

    user = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "hashed_password": hash_password(password),
        "created_at": datetime.utcnow().isoformat(),
    }
    users.append(user)
    _save_users(users)
    return user


def login_user(email: str, password: str) -> Dict[str, Any]:
    users = _load_users()
    user = next((u for u in users if u["email"] == email), None)
    if not user or not verify_password(password, user["hashed_password"]):
        raise ValueError("이메일 또는 비밀번호가 올바르지 않습니다.")
    return user


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    return next((u for u in _load_users() if u["id"] == user_id), None)


def social_login_upsert(
    provider: str,
    provider_id: str,
    email: str,
    name: str,
    avatar_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    소셜 로그인: provider+provider_id로 기존 유저를 찾거나 새로 생성합니다.
    이메일이 이미 일반 계정으로 존재하면 해당 계정과 연결합니다.
    """
    users = _load_users()
    social_key = f"{provider}:{provider_id}"

    # 1) 동일 소셜 계정이 이미 있으면 반환
    existing = next((u for u in users if u.get("social_key") == social_key), None)
    if existing:
        # 이름 업데이트 (선택)
        if existing.get("name") != name:
            existing["name"] = name
            _save_users(users)
        return existing

    # 2) 같은 이메일의 기존 계정에 소셜 연결
    by_email = next((u for u in users if u["email"] == email), None)
    if by_email:
        by_email["social_key"] = social_key
        if avatar_url:
            by_email["avatar_url"] = avatar_url
        _save_users(users)
        return by_email

    # 3) 새 소셜 계정 생성 (비밀번호 없음)
    user: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "hashed_password": None,      # 소셜 전용 계정
        "social_key": social_key,
        "provider": provider,
        "avatar_url": avatar_url,
        "created_at": datetime.utcnow().isoformat(),
    }
    users.append(user)
    _save_users(users)
    return user
