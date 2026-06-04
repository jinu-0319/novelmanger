/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 컨테이너 배포 시 standalone 모드로 최적화된 번들 생성
  output: "standalone",

  async rewrites() {
    const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

    return {
      // beforeFiles: 파일시스템(NextAuth 포함) 보다 먼저 실행
      // → /api/auth/register|login|me 를 NextAuth가 가로채기 전에 백엔드로 보냄
      beforeFiles: [
        {
          source: "/api/auth/register",
          destination: `${BACKEND}/auth/register`,
        },
        {
          source: "/api/auth/login",
          destination: `${BACKEND}/auth/login`,
        },
        {
          source: "/api/auth/me",
          destination: `${BACKEND}/auth/me`,
        },
      ],

      // afterFiles: 나머지 /api/* → 백엔드 (NextAuth 경로 /api/auth/* 는 위에서 처리됐거나 여기서도 제외)
      afterFiles: [
        {
          source: "/api/((?!auth/).*)",
          destination: `${BACKEND}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
