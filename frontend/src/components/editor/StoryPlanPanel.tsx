"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { suggestPlot, generatePlot, type PlotSuggestion } from "@/lib/api";
import type { WikiItem } from "@/types";
import WikiModal from "./WikiModal";

type Mode = "short" | "long";

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? div.innerText ?? "").replace(/\s+/g, " ").trim();
}

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  );
}

// ── 플롯 카드 ─────────────────────────────────────────────────────────────────

const moodColors: Record<string, string> = {
  "긴장감":      "bg-red-50 text-red-600 border-red-200",
  "긴장감 고조": "bg-red-50 text-red-600 border-red-200",
  "로맨스":      "bg-pink-50 text-pink-600 border-pink-200",
  "로맨틱":      "bg-pink-50 text-pink-600 border-pink-200",
  "로맨스 발전": "bg-pink-50 text-pink-600 border-pink-200",
  "반전":        "bg-purple-50 text-purple-600 border-purple-200",
  "갈등 심화":   "bg-orange-50 text-orange-600 border-orange-200",
  "감동":        "bg-blue-50 text-blue-600 border-blue-200",
};

function moodStyle(mood: string): string {
  for (const [key, cls] of Object.entries(moodColors)) {
    if (mood.includes(key)) return cls;
  }
  return "bg-notion-bg-secondary text-notion-text-secondary border-notion-border";
}

function PlotCard({ item }: { item: PlotSuggestion }) {
  return (
    <div className="rounded-lg border border-notion-border bg-notion-bg p-3 mb-2 animate-fade-in hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-notion-text leading-tight">{item.title}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0 ${moodStyle(item.mood)}`}>
          {item.mood}
        </span>
      </div>
      <p className="text-xs text-moneta font-medium mb-1">{item.summary}</p>
      <p className="text-xs text-notion-text-secondary leading-relaxed">{item.detail}</p>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface Props {
  getContent: () => string;
  onClose: () => void;
  episodeNo?: number;
  novelTitle?: string;
  genre?: string;
}

export default function StoryPlanPanel({
  getContent,
  onClose,
  episodeNo = 1,
  novelTitle,
  genre,
}: Props) {
  const getWiki = useStore((s) => s.getWiki);
  const deleteWikiItem = useStore((s) => s.deleteWikiItem);
  const clearWiki = useStore((s) => s.clearWiki);
  const wiki = getWiki() as WikiItem[];

  const [mode, setMode] = useState<Mode>("short");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlotSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showWiki, setShowWiki] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const text = stripHtml(getContent());
      const fn = mode === "short" ? suggestPlot : generatePlot;
      const data = await fn({
        content: text,
        title: novelTitle,
        genre,
        episode_no: episodeNo,
        wiki_context: wiki.map((w) => ({ type: w.type, title: w.title, description: w.description })),
      });
      if (data.error) setError(data.error);
      else setSuggestions(data.suggestions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="w-80 border-l border-notion-border bg-notion-bg flex flex-col flex-shrink-0 animate-slide-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <span className="font-semibold text-notion-text text-sm">스토리 제안받기</span>
        </div>
        <button
          onClick={onClose}
          className="text-notion-text-secondary hover:text-notion-text transition-colors text-lg w-6 h-6 flex items-center justify-center"
          title="닫기"
        >
          ×
        </button>
      </div>

      {/* 모드 선택 */}
      <div className="flex border-b border-notion-border flex-shrink-0">
        <button
          onClick={() => setMode("short")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex flex-col items-center gap-0.5 ${
            mode === "short"
              ? "text-moneta border-b-2 border-moneta"
              : "text-notion-text-secondary hover:text-notion-text"
          }`}
        >
          <span>⚡ 짧은 흐름 생성</span>
          <span className="text-[10px] opacity-60 font-normal">다음 전개 방향 제안</span>
        </button>
        <button
          onClick={() => setMode("long")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex flex-col items-center gap-0.5 ${
            mode === "long"
              ? "text-moneta border-b-2 border-moneta"
              : "text-notion-text-secondary hover:text-notion-text"
          }`}
        >
          <span>📝 긴 플롯 생성</span>
          <span className="text-[10px] opacity-60 font-normal">새로운 플롯 아이디어</span>
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        <p className="text-xs text-notion-text-secondary mb-4 leading-relaxed">
          {mode === "short"
            ? "현재 회차 흐름을 바탕으로 자연스러운 다음 전개를 제안합니다."
            : "장르와 소설 분위기에 맞는 새로운 플롯 아이디어를 생성합니다."}
        </p>

        {/* 위키 참고 뱃지 */}
        {wiki.length > 0 && (
          <button
            onClick={() => setShowWiki(true)}
            className="flex items-center gap-1.5 text-xs text-notion-text-secondary bg-notion-bg-secondary border border-notion-border rounded-lg px-3 py-1.5 hover:bg-notion-border transition-colors mb-4 w-full"
          >
            <span>🧠</span>
            <span>{wiki.length}개 설정 참고 중</span>
            <span className="ml-auto opacity-50">▸</span>
          </button>
        )}

        <button
          onClick={run}
          disabled={loading}
          className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all mb-4 ${
            loading
              ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
              : "bg-moneta text-white hover:opacity-90 shadow-sm"
          }`}
        >
          {loading
            ? <span className="flex items-center justify-center gap-2"><Spinner /><span>생성 중...</span></span>
            : mode === "short" ? "⚡ 흐름 생성하기" : "📝 플롯 생성하기"}
        </button>

        {error && (
          <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">{error}</div>
        )}

        {suggestions.length > 0 && (
          <>
            <p className="text-xs text-notion-text-secondary mb-2">{suggestions.length}가지 아이디어</p>
            {suggestions.map((s, i) => <PlotCard key={i} item={s} />)}
          </>
        )}

        {!loading && suggestions.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-notion-text-secondary">
            <div className="text-4xl mb-3">{mode === "short" ? "⚡" : "📝"}</div>
            <p className="text-sm font-medium text-notion-text mb-1">
              {mode === "short" ? "다음 흐름을 제안받으세요" : "새로운 플롯을 생성하세요"}
            </p>
            <p className="text-xs leading-relaxed">
              {mode === "short"
                ? "현재까지 쓴 내용을 분석해 자연스러운 다음 전개를 제안합니다."
                : "장르와 분위기에 맞는 새로운 플롯 아이디어를 만들어드립니다."}
            </p>
          </div>
        )}
      </div>

      {showWiki && (
        <WikiModal
          items={wiki}
          onClose={() => setShowWiki(false)}
          onDelete={deleteWikiItem}
          onClear={clearWiki}
        />
      )}
    </aside>
  );
}
