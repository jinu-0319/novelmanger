from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .schemas import RegisterRequest, LoginRequest, TokenResponse, UserInfo, SocialLoginRequest
from .service import register_user, login_user, create_token, decode_token, get_user_by_id, social_login_upsert

router = APIRouter(prefix="/auth", tags=["Auth"])
security = HTTPBearer()


@router.post("/register", response_model=TokenResponse, summary="회원가입")
def register(req: RegisterRequest):
    try:
        user = register_user(req.name, req.email, req.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    token = create_token(user["id"])
    return TokenResponse(
        access_token=token,
        user_id=user["id"],
        name=user["name"],
        email=user["email"],
    )


@router.post("/login", response_model=TokenResponse, summary="로그인")
def login(req: LoginRequest):
    try:
        user = login_user(req.email, req.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    token = create_token(user["id"])
    return TokenResponse(
        access_token=token,
        user_id=user["id"],
        name=user["name"],
        email=user["email"],
    )


@router.post("/social", response_model=TokenResponse, summary="소셜 로그인 / 자동 회원가입")
def social_login(req: SocialLoginRequest):
    """
    NextAuth OAuth 완료 후 프론트엔드가 호출합니다.
    provider + provider_id 기준으로 유저를 upsert하고 JWT를 발급합니다.
    """
    user = social_login_upsert(
        provider=req.provider,
        provider_id=req.provider_id,
        email=req.email,
        name=req.name,
        avatar_url=req.avatar_url,
    )
    token = create_token(user["id"])
    return TokenResponse(
        access_token=token,
        user_id=user["id"],
        name=user["name"],
        email=user["email"],
    )


@router.get("/me", response_model=UserInfo, summary="내 정보 조회")
def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return UserInfo(user_id=user["id"], name=user["name"], email=user["email"])
