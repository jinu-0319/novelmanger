"use client";

/**
 * /auth/callback
 * OAuth 완료 후 NextAuth 세션을 읽어 백엔드 JWT를 발급받고
 * Zustand 스토어에 저장한 뒤 /projects로 이동합니다.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

const BASE = "/api";

async function fetchBackendToken(params: {
  provider: string;
  provider_id: string;
  email: string;
  name: string;
  avatar_url?: string;
}) {
  const res = await fetch(`${BASE}/auth/social`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "소셜 로그인 실패");
  }
  return res.json() as Promise<{
    access_token: string;
    user_id: string;
    name: string;
    email: string;
  }>;
}

export default function AuthCallbackPage() {
  const { data: session, status } = useSession();
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session?.user) {
      router.replace("/login");
      return;
    }

    const s = session as unknown as Record<string, unknown>;
    const provider = s.provider as string | undefined;
    const provider_id = s.provider_id as string | undefined;

    if (!provider || !provider_id) {
      setError("소셜 로그인 정보를 찾을 수 없습니다.");
      return;
    }

    fetchBackendToken({
      provider,
      provider_id,
      email: session.user.email ?? `${provider}_${provider_id}@social.local`,
      name: session.user.name ?? "사용자",
      avatar_url: session.user.image ?? undefined,
    })
      .then((data) => {
        setAuth(
          { user_id: data.user_id, name: data.name, email: data.email },
          data.access_token
        );
        router.replace("/projects");
      })
      .catch((e: Error) => setError(e.message));
  }, [status, session, setAuth, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-notion-bg-secondary flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-sm w-full text-center shadow-lg">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="font-bold text-gray-800 mb-2">로그인 실패</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => router.replace("/login")}
            className="w-full py-2.5 bg-moneta text-white rounded-xl text-sm font-medium hover:bg-moneta-dark transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-notion-bg-secondary flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-4 border-moneta/30 border-t-moneta rounded-full animate-spin mb-4" />
        <p className="text-sm text-notion-text-secondary">로그인 처리 중...</p>
      </div>
    </div>
  );
}
