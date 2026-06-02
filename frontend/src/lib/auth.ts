const BASE = "/api";

export interface AuthUser {
  user_id: string;
  name: string;
  email: string;
}

export interface TokenResponse extends AuthUser {
  access_token: string;
  token_type: string;
}

// ── 쿠키 헬퍼 ────────────────────────────────────────────────────────────
const COOKIE_NAME = "moneta_token";
const COOKIE_DAYS = 7;

export function setTokenCookie(token: string) {
  const expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString();
  document.cookie = `${COOKIE_NAME}=${token}; path=/; expires=${expires}; SameSite=Lax`;
}

export function getTokenCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearTokenCookie() {
  document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// ── API 호출 ─────────────────────────────────────────────────────────────

export async function apiRegister(
  name: string,
  email: string,
  password: string
): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "회원가입에 실패했습니다.");
  return data as TokenResponse;
}

export async function apiLogin(
  email: string,
  password: string
): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "로그인에 실패했습니다.");
  return data as TokenResponse;
}

export async function apiGetMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "인증에 실패했습니다.");
  return data as AuthUser;
}
