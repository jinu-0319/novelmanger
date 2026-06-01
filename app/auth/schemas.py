from pydantic import BaseModel


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    email: str


class UserInfo(BaseModel):
    user_id: str
    name: str
    email: str


class SocialLoginRequest(BaseModel):
    provider: str          # "google" | "kakao" | "naver"
    provider_id: str       # 각 플랫폼의 고유 ID
    email: str
    name: str
    avatar_url: str | None = None
