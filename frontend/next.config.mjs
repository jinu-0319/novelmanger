/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 컨테이너 배포 시 standalone 모드로 최적화된 번들 생성
  output: "standalone",

  async rewrites() {
    return [
      {
        // NextAuth 자체 경로(/api/auth/*)는 프록시에서 제외
        source: "/api/((?!auth/).*)",
        destination: `${process.env.BACKEND_URL ?? "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
