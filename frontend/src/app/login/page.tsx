"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { apiLogin } from "@/lib/auth";
import { useAuthStore } from "@/store/useAuthStore";

// ── SNS 제공자 목록 ────────────────────────────────────────────────────────

interface SnsProvider {
  id: "google" | "kakao" | "naver";
  label: string;
  bg: string;
  text: string;
  border: string;
  logo: React.ReactNode;
}

const SNS_PROVIDERS: SnsProvider[] = [
  {
    id: "google",
    label: "Google로 계속하기",
    bg: "bg-white hover:bg-gray-50",
    text: "text-gray-700",
    border: "border border-gray-300",
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: "kakao",
    label: "카카오로 계속하기",
    bg: "bg-[#FEE500] hover:bg-[#f0d900]",
    text: "text-[#191919]",
    border: "border border-[#FEE500]",
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="#191919">
        <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.747 1.688 5.158 4.24 6.605l-1.08 3.968c-.095.347.31.623.612.418L9.88 19.34A11.3 11.3 0 0 0 12 19.6c5.523 0 10-3.477 10-7.8S17.523 3 12 3z"/>
      </svg>
    ),
  },
  {
    id: "naver",
    label: "네이버로 계속하기",
    bg: "bg-[#03C75A] hover:bg-[#02b350]",
    text: "text-white",
    border: "border border-[#03C75A]",
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="white">
        <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/>
      </svg>
    ),
  },
];

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [snsLoading, setSnsLoading] = useState<string | null>(null);

  // ── 이메일 로그인 ──────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiLogin(email, password);
      setAuth({ user_id: res.user_id, name: res.name, email: res.email }, res.access_token);
      router.push("/projects");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── SNS 로그인 ─────────────────────────────────────────────────────────────
  async function handleSnsLogin(providerId: string) {
    setSnsLoading(providerId);
    try {
      await signIn(providerId, { callbackUrl: "/auth/callback" });
      // signIn은 리다이렉트하므로 이 아래 코드는 실행되지 않음
    } catch {
      setError("소셜 로그인 중 오류가 발생했습니다.");
      setSnsLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-notion-bg-secondary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-moneta shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">M</span>
          </div>
          <h1 className="text-2xl font-bold text-notion-text">Moneta</h1>
          <p className="text-notion-text-secondary text-sm mt-1">웹소설 AI 어시스턴스</p>
        </div>

        {/* 카드 */}
        <div className="bg-notion-bg rounded-2xl border border-notion-border shadow-sm p-8">
          <h2 className="text-lg font-semibold text-notion-text mb-6">로그인</h2>

          {/* SNS 로그인 버튼 */}
          <div className="space-y-2.5 mb-5">
            {SNS_PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSnsLogin(p.id)}
                disabled={!!snsLoading}
                className={`w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${p.bg} ${p.text} ${p.border} disabled:opacity-60`}
              >
                {snsLoading === p.id ? (
                  <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  p.logo
                )}
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          {/* 구분선 */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-notion-border" />
            <span className="text-xs text-notion-text-secondary">또는 이메일로 로그인</span>
            <div className="flex-1 h-px bg-notion-border" />
          </div>

          {/* 이메일 로그인 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-notion-text-secondary mb-1.5">이메일</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.com"
                className="w-full px-3 py-2.5 text-sm border border-notion-border rounded-lg outline-none focus:border-moneta focus:ring-1 focus:ring-moneta/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-notion-text-secondary mb-1.5">비밀번호</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm border border-notion-border rounded-lg outline-none focus:border-moneta focus:ring-1 focus:ring-moneta/20 transition-all"
              />
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-moneta text-white text-sm font-medium rounded-lg hover:bg-moneta-dark transition-colors disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : (
                "로그인"
              )}
            </button>
          </form>
        </div>

        {/* 회원가입 링크 */}
        <p className="text-center text-sm text-notion-text-secondary mt-5">
          계정이 없으신가요?{" "}
          <Link href="/signup" className="text-moneta font-medium hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
