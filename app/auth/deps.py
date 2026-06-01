"""
app/auth/deps.py — JWT FastAPI 의존성 (가벼운 단독 모듈)

다른 heavy import 없이 토큰만 검증합니다.
"""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth.service import decode_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    """Bearer 토큰에서 user_id 추출. 없거나 유효하지 않으면 401."""
    token = credentials.credentials if credentials else None
    if not token:
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    return user_id
