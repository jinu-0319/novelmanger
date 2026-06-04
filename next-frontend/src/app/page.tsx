"use client";

import { useRouter } from "next/navigation";
import { useStore } from "@/store/useStore";

export default function HomePage() {
  const router = useRouter();
  const { documents } = useStore();

  const lastDocId = documents.at(-1)?.id;

  return (
    <div className="min-h-screen bg-notion-bg flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-moneta flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold">M</span>
          </div>
          <h1 className="text-4xl font-bold text-notion-text tracking-tight">
            Moneta
          </h1>
        </div>
        <p className="text-notion-text-secondary text-lg">
          웹소설 작가를 위한 첫 번째 AI 어시스턴스
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12 w-full max-w-2xl">
        {[
          {
            icon: "✍️",
            label: "집필",
            desc: "AI 자동 저장 + 회차 관리",
          },
          {
            icon: "🔮",
            label: "Story Keeper",
            desc: "설정 충돌 & 개연성 검사",
          },
          {
            icon: "📜",
            label: "Clio",
            desc: "역사적 고증 팩트체크",
          },
        ].map((f) => (
          <div
            key={f.label}
            className="bg-notion-bg-secondary border border-notion-border rounded-xl p-5 text-center"
          >
            <div className="text-3xl mb-2">{f.icon}</div>
            <div className="font-semibold text-notion-text mb-1">{f.label}</div>
            <div className="text-sm text-notion-text-secondary">{f.desc}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            if (lastDocId) router.push(`/editor?doc=${lastDocId}`);
            else router.push("/editor");
          }}
          className="px-8 py-3 bg-moneta text-white font-medium rounded-lg hover:bg-moneta-dark transition-colors shadow-sm"
        >
          집필 시작하기
        </button>
        <button
          onClick={() => router.push("/characters")}
          className="px-8 py-3 bg-notion-bg-secondary text-notion-text border border-notion-border font-medium rounded-lg hover:bg-notion-border transition-colors"
        >
          설정 관리
        </button>
      </div>

      <p className="mt-8 text-xs text-notion-text-secondary">
        NovelBright · Powered by Solar Pro 2
      </p>
    </div>
  );
}
