import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 로그인 없이 접근 가능한 경로
const PUBLIC_PATHS = ["/", "/login", "/signup"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("moneta_token")?.value;
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // 토큰 없이 보호된 경로 접근 → 로그인으로
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 토큰 있는데 로그인/회원가입 접근 → 프로젝트 목록으로
  if (token && isPublic) {
    return NextResponse.redirect(new URL("/projects", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // _next 정적 파일, favicon, api 라우트는 미들웨어 제외
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
