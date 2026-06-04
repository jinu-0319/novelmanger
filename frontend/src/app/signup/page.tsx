"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRegister } from "@/lib/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { useStore } from "@/store/useStore";
import { createNovelOnServer } from "@/lib/api";

const SAMPLE_CONTENT = `\t어둠이 짙게 깔린 숲 속, 차가운 달빛만이 그녀의 길을 비추고 있었다.

\t아리아는 낡은 지도를 손에 꼭 쥔 채 발걸음을 멈췄다. 지도에 표시된 '금지된 탑'은 분명 이 숲 깊은 곳 어딘가에 있을 터였다. 수백 년 전 봉인된 마법사의 탑 — 그 안에 그녀가 찾던 진실이 숨겨져 있다고 했다.

\t"겁쟁이처럼 이렇게 서 있을 시간 없어."

\t아리아는 낮게 중얼거리며 다시 발을 내딛었다. 나뭇가지가 발 아래에서 부드러운 소리를 냈다. 그때였다. 등 뒤에서 무언가 움직이는 기척이 느껴졌다.`;

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { addNovel, setActiveNovel, upsertDocument } = useStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRegister(name, email, password);
      setAuth({ user_id: res.user_id, name: res.name, email: res.email }, res.access_token);

      // 예시 소설 자동 생성 (로컬 + 서버)
      const sampleNovel = addNovel({
        title: "나의 첫 소설",
        genre: "판타지",
        description: "Moneta와 함께 시작하는 나만의 이야기. 자유롭게 수정하거나 삭제하세요.",
      });
      setActiveNovel(sampleNovel.id);
      upsertDocument({
        id: `doc-${Date.now()}`,
        episode_no: 1,
        title: "제1화 — 금지된 탑",
        content: SAMPLE_CONTENT,
      });
      // 서버에 소설 등록 (토큰이 방금 set되었으므로 바로 호출 가능)
      await createNovelOnServer({
        id: sampleNovel.id,
        title: sampleNovel.title,
        genre: sampleNovel.genre,
        description: sampleNovel.description,
        cover_color: sampleNovel.cover_color,
      });

      router.push("/projects");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
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
          <p className="text-notion-text-secondary text-sm mt-1">
            웹소설 AI 어시스턴스
          </p>
        </div>

        {/* 카드 */}
        <div className="bg-notion-bg rounded-2xl border border-notion-border shadow-sm p-8">
          <h2 className="text-lg font-semibold text-notion-text mb-6">회원가입</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-notion-text-secondary mb-1.5">
                이름
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full px-3 py-2.5 text-sm border border-notion-border rounded-lg outline-none focus:border-moneta focus:ring-1 focus:ring-moneta/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-notion-text-secondary mb-1.5">
                이메일
              </label>
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
              <label className="block text-sm text-notion-text-secondary mb-1.5">
                비밀번호
                <span className="text-notion-text-secondary font-normal ml-1">(6자 이상)</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm border border-notion-border rounded-lg outline-none focus:border-moneta focus:ring-1 focus:ring-moneta/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-notion-text-secondary mb-1.5">
                비밀번호 확인
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none focus:ring-1 transition-all ${
                  confirm && confirm !== password
                    ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                    : "border-notion-border focus:border-moneta focus:ring-moneta/20"
                }`}
              />
              {confirm && confirm !== password && (
                <p className="text-xs text-red-400 mt-1">비밀번호가 일치하지 않습니다.</p>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (!!confirm && confirm !== password)}
              className="w-full py-2.5 bg-moneta text-white text-sm font-medium rounded-lg hover:bg-moneta-dark transition-colors disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  가입 중...
                </span>
              ) : (
                "시작하기"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-notion-text-secondary mt-5">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-moneta font-medium hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
