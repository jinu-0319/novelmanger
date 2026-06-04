"use client";

import { useAnalysis } from "@/hooks/useAnalysis";
import { useStore } from "@/store/useStore";
import type { AnalysisItem, AnalysisType } from "@/types";

interface Props {
  getContent: () => string;
}

const severityConfig = {
  high: {
    label: "높음",
    bg: "bg-severity-high-bg",
    border: "border-red-200",
    badge: "bg-red-100 text-red-600",
    dot: "bg-severity-high",
  },
  medium: {
    label: "중간",
    bg: "bg-severity-medium-bg",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-600",
    dot: "bg-severity-medium",
  },
  low: {
    label: "낮음",
    bg: "bg-severity-low-bg",
    border: "border-green-200",
    badge: "bg-green-100 text-green-600",
    dot: "bg-severity-low",
  },
};

function AnalysisCard({ item }: { item: AnalysisItem }) {
  const cfg = severityConfig[item.severity];
  return (
    <div
      className={`rounded-lg border p-3 mb-2 animate-fade-in ${cfg.bg} ${cfg.border}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-notion-text leading-tight">
          {item.title}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}
        >
          {cfg.label}
        </span>
      </div>
      <p className="text-xs text-notion-text-secondary leading-relaxed">
        {item.description}
      </p>
    </div>
  );
}

function AgentSection({
  type,
  label,
  icon,
  accentClass,
  getContent,
}: {
  type: AnalysisType;
  label: string;
  icon: string;
  accentClass: string;
  getContent: () => string;
}) {
  const { states, run, clear } = useAnalysis();

  // Store per-instance state by hoisting to component level
  // (useAnalysis is called per section — each section has independent state)
  const state = states[type];

  const handleRun = () => {
    const html = getContent();
    if (!html.trim() || html === "<p></p>") return;
    run(type, html);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="font-semibold text-sm text-notion-text">{label}</span>
        </div>
        {state.result && (
          <button
            onClick={() => clear(type)}
            className="text-xs text-notion-text-secondary hover:text-notion-text transition-colors"
          >
            지우기
          </button>
        )}
      </div>

      <button
        onClick={handleRun}
        disabled={state.loading}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
          state.loading
            ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
            : `${accentClass} text-white hover:opacity-90 shadow-sm`
        }`}
      >
        {state.loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            분석 중...
          </span>
        ) : (
          "분석 시작"
        )}
      </button>

      {state.error && (
        <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">
          {state.error}
        </div>
      )}

      {state.result && (
        <div className="mt-3">
          {state.result.items.length === 0 ? (
            <div className="text-center py-4 text-sm text-notion-text-secondary">
              ✓ 문제가 발견되지 않았습니다
            </div>
          ) : (
            <>
              <div className="text-xs text-notion-text-secondary mb-2">
                {state.result.items.length}건 발견
              </div>
              {state.result.items.map((item, i) => (
                <AnalysisCard key={i} item={item} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Separate instances for each agent to have independent state
function StoryKeeperSection({ getContent }: { getContent: () => string }) {
  const { states, run, clear } = useAnalysis();
  const state = states["story_keeper"];
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span>🔮</span>
          <span className="font-semibold text-sm text-notion-text">Story Keeper</span>
          <span className="text-xs text-notion-text-secondary">설정 일관성</span>
        </div>
        {state.result && (
          <button onClick={() => clear("story_keeper")} className="text-xs text-notion-text-secondary hover:text-notion-text">
            지우기
          </button>
        )}
      </div>
      <button
        onClick={() => run("story_keeper", getContent())}
        disabled={state.loading}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
          state.loading ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
            : "bg-keeper text-white hover:opacity-90 shadow-sm"
        }`}
      >
        {state.loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            분석 중...
          </span>
        ) : "분석 시작"}
      </button>
      {state.error && <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">{state.error}</div>}
      {state.result && (
        <div className="mt-3">
          {state.result.items.length === 0
            ? <div className="text-center py-4 text-sm text-notion-text-secondary">✓ 설정 충돌 없음</div>
            : <>{state.result.items.map((item, i) => <AnalysisCard key={i} item={item} />)}</>}
        </div>
      )}
    </div>
  );
}

function ClioSection({ getContent }: { getContent: () => string }) {
  const { states, run, clear } = useAnalysis();
  const state = states["clio"];
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span>📜</span>
          <span className="font-semibold text-sm text-notion-text">Clio</span>
          <span className="text-xs text-notion-text-secondary">역사 고증</span>
        </div>
        {state.result && (
          <button onClick={() => clear("clio")} className="text-xs text-notion-text-secondary hover:text-notion-text">
            지우기
          </button>
        )}
      </div>
      <button
        onClick={() => run("clio", getContent())}
        disabled={state.loading}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
          state.loading ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
            : "bg-clio text-white hover:opacity-90 shadow-sm"
        }`}
      >
        {state.loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            분석 중...
          </span>
        ) : "분석 시작"}
      </button>
      {state.error && <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">{state.error}</div>}
      {state.result && (
        <div className="mt-3">
          {state.result.items.length === 0
            ? <div className="text-center py-4 text-sm text-notion-text-secondary">✓ 고증 오류 없음</div>
            : <>{state.result.items.map((item, i) => <AnalysisCard key={i} item={item} />)}</>}
        </div>
      )}
    </div>
  );
}

export default function MonetaPanel({ getContent }: Props) {
  const toggleMonetaPanel = useStore((s) => s.toggleMonetaPanel);

  return (
    <aside className="w-80 border-l border-notion-border bg-notion-bg flex flex-col flex-shrink-0 animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-notion-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-moneta flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <span className="font-semibold text-notion-text">Moneta</span>
        </div>
        <button
          onClick={toggleMonetaPanel}
          className="text-notion-text-secondary hover:text-notion-text transition-colors text-lg"
          title="패널 닫기"
        >
          ×
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-5">
        <StoryKeeperSection getContent={getContent} />
        <div className="border-t border-notion-border my-4" />
        <ClioSection getContent={getContent} />
      </div>

      <div className="border-t border-notion-border px-5 py-3">
        <p className="text-xs text-notion-text-secondary text-center">
          현재 회차를 기준으로 분석합니다
        </p>
      </div>
    </aside>
  );
}
