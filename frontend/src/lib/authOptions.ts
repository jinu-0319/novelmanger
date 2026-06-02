import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// ── Kakao 커스텀 프로바이더 ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const KakaoProvider: any = {
  id: "kakao",
  name: "Kakao",
  type: "oauth",
  authorization: {
    url: "https://kauth.kakao.com/oauth/authorize",
    params: { scope: "profile_nickname profile_image account_email" },
  },
  token: "https://kauth.kakao.com/oauth/token",
  userinfo: "https://kapi.kakao.com/v2/user/me",
  profile(profile: {
    id: number;
    kakao_account?: { email?: string; profile?: { nickname?: string; profile_image_url?: string } };
  }) {
    return {
      id: String(profile.id),
      name: profile.kakao_account?.profile?.nickname ?? "카카오 사용자",
      email: profile.kakao_account?.email ?? `kakao_${profile.id}@kakao.local`,
      image: profile.kakao_account?.profile?.profile_image_url,
    };
  },
  clientId: process.env.KAKAO_CLIENT_ID!,
  clientSecret: process.env.KAKAO_CLIENT_SECRET!,
};

// ── Naver 커스텀 프로바이더 ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NaverProvider: any = {
  id: "naver",
  name: "Naver",
  type: "oauth" as const,
  authorization: "https://nid.naver.com/oauth2.0/authorize",
  token: "https://nid.naver.com/oauth2.0/token",
  userinfo: "https://openapi.naver.com/v1/nid/me",
  profile(profile: { response: { id: string; name?: string; email?: string; profile_image?: string } }) {
    const r = profile.response;
    return {
      id: r.id,
      name: r.name ?? "네이버 사용자",
      email: r.email ?? `naver_${r.id}@naver.local`,
      image: r.profile_image,
    };
  },
  clientId: process.env.NAVER_CLIENT_ID!,
  clientSecret: process.env.NAVER_CLIENT_SECRET!,
};

// ── NextAuth 설정 ─────────────────────────────────────────────────────────────
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    ...(process.env.KAKAO_CLIENT_ID ? [KakaoProvider] : []),
    ...(process.env.NAVER_CLIENT_ID ? [NaverProvider] : []),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.provider = account.provider;
        token.provider_id = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      const s = session as unknown as Record<string, unknown>;
      s.provider = token.provider;
      s.provider_id = token.provider_id;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },
};
