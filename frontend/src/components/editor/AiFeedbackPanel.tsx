"use client";

import { useState } from "react";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useStore } from "@/store/useStore";
import { analyzeReview, type ReviewResult, type ReviewScores } from "@/lib/api";
import type { AnalysisItem, WikiItem } from "@/types";
import WikiModal from "./WikiModal";

type TabId = "review" | "story_keeper" | "clio";

// ── 공통 UI ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  );
}

const severityConfig = {
  high:   { label: "높음", bg: "bg-severity-high-bg",   border: "border-red-200",   badge: "bg-red-100 text-red-600" },
  medium: { label: "중간", bg: "bg-severity-medium-bg", border: "border-amber-200", badge: "bg-amber-100 text-amber-600" },
  low:    { label: "낮음", bg: "bg-severity-low-bg",    border: "border-green-200", badge: "bg-green-100 text-green-600" },
};

function AnalysisCard({ item }: { item: AnalysisItem }) {
  const cfg = severityConfig[item.severity];
  return (
    <div className={`rounded-lg border p-3 mb-2 animate-fade-in ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-notion-text leading-tight">{item.title}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>{cfg.label}</span>
      </div>
      <p className="text-xs text-notion-text-secondary leading-relaxed whitespace-pre-line">
        {item.description}
      </p>
    </div>
  );
}

// ── 종합 평가 탭 ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? div.innerText ?? "").replace(/\s+/g, " ").trim();
}

function StarRating({ score, max = 5 }: { score: number; max?: number }) {
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < full;
        const isHalf = !filled && i === full && half;
        return (
          <svg key={i} viewBox="0 0 20 20" className="w-4 h-4 flex-shrink-0">
            <defs>
              <linearGradient id={`half-${i}`}>
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="50%" stopColor="#d1d5db" />
              </linearGradient>
            </defs>
            <polygon
              points="10,1 12.9,7 19.5,7.6 14.8,12 16.2,18.5 10,15 3.8,18.5 5.2,12 0.5,7.6 7.1,7"
              fill={filled ? "#f59e0b" : isHalf ? `url(#half-${i})` : "#d1d5db"}
            />
          </svg>
        );
      })}
    </div>
  );
}

const SCORE_LABELS: { key: keyof ReviewScores; label: string; icon: string }[] = [
  { key: "story",         label: "스토리",  icon: "📖" },
  { key: "character",     label: "캐릭터",  icon: "👤" },
  { key: "tempo",         label: "템포",    icon: "⚡" },
  { key: "style",         label: "문체",    icon: "✏️"  },
  { key: "emotion",       label: "감정선",  icon: "💗" },
  { key: "marketability", label: "시장성",  icon: "📢" },
  { key: "world",         label: "세계관",  icon: "🌐" },
];

function ScoreBar({ label, icon, score }: { label: string; icon: string; score: number }) {
  const pct = (score / 5) * 100;
  const color =
    score >= 4.0 ? "bg-emerald-500" :
    score >= 3.0 ? "bg-violet-500"  :
    score >= 2.0 ? "bg-amber-500"   : "bg-red-400";
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-xs text-notion-text-secondary">
          <span>{icon}</span>
          <span className="font-medium">{label}</span>
        </span>
        <span className="text-xs font-bold text-notion-text tabular-nums">{score.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-notion-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FeedbackSection({ title, content }: { title: string; content?: string }) {
  if (!content?.trim()) return null;
  const lines = content.split(/\n+/).filter(Boolean);
  return (
    <div className="mb-5">
      <h3 className="font-bold text-notion-text text-sm mb-2">{title}</h3>
      {lines.length > 1 ? (
        <ul className="space-y-1.5">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2 text-xs text-notion-text-secondary leading-relaxed">
              <span className="text-violet-400 flex-shrink-0 mt-0.5">•</span>
              <span>{line.replace(/^[-•·*]\s*/, "")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-notion-text-secondary leading-relaxed">{content}</p>
      )}
    </div>
  );
}

function ReviewTab({
  getContent,
  episodeNo,
  docTitle,
  novelTitle,
  genre,
}: {
  getContent: () => string;
  episodeNo: number;
  docTitle?: string;
  novelTitle?: string;
  genre?: string;
}) {
  const getWiki = useStore((s) => s.getWiki);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    const text = stripHtml(getContent());
    if (!text.trim()) { setError("원고 내용이 없습니다."); return; }
    setLoading(true); setError(null);
    try {
      const wiki = getWiki();
      const data = await analyzeReview({
        text,
        title: docTitle ?? novelTitle ?? "",
        episode_no: episodeNo,
        genre: genre ?? "",
        wiki_context: wiki.map((w) => ({ type: w.type, title: w.title, description: w.description })),
      });
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-4 pb-3">
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-notion-bg-secondary border border-notion-border text-sm font-medium text-notion-text hover:bg-notion-border transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <><Spinner /><span>분석 중...</span></> : <><span>↻</span><span>{result ? "다시 분석" : "분석 시작"}</span></>}
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 leading-relaxed">{error}</div>
      )}

      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-notion-text-secondary">
          <div className="text-4xl mb-3">⭐</div>
          <p className="text-sm font-medium text-notion-text mb-1">AI가 원고를 종합 평가합니다</p>
          <p className="text-xs leading-relaxed">스토리·캐릭터·문체 등 7가지 항목을 분석하고 상세한 피드백을 제공합니다.</p>
        </div>
      )}

      {loading && (
        <div className="px-4 animate-pulse space-y-3">
          <div className="h-4 bg-notion-border rounded w-24" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between">
                <div className="h-3 bg-notion-border rounded w-16" />
                <div className="h-3 bg-notion-border rounded w-6" />
              </div>
              <div className="h-1.5 bg-notion-border rounded-full" />
            </div>
          ))}
        </div>
      )}

      {result && !loading && (
        <div className="px-4 pb-6">
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-notion-text-secondary uppercase tracking-wider">리뷰 점수</span>
              <div className="flex items-center gap-2">
                <StarRating score={result.overall} />
                <span className="text-base font-bold text-notion-text tabular-nums">{result.overall.toFixed(1)}</span>
              </div>
            </div>
            <div className="mt-3">
              {SCORE_LABELS.map(({ key, label, icon }) => (
                <ScoreBar key={key} label={label} icon={icon} score={result.scores[key]} />
              ))}
            </div>
          </div>
          <div className="border-t border-notion-border my-4" />
          {result.sections.overall_feedback && (
            <div className="mb-5">
              <h3 className="font-bold text-notion-text text-sm mb-2">1. 전반적인 피드백</h3>
              <p className="text-xs text-notion-text-secondary leading-relaxed whitespace-pre-line">{result.sections.overall_feedback}</p>
            </div>
          )}
          {result.sections.strengths && (
            <><div className="border-t border-notion-border my-4" /><FeedbackSection title="2. 좋은 점" content={result.sections.strengths} /></>
          )}
          {result.sections.improvements && (
            <><div className="border-t border-notion-border my-4" /><FeedbackSection title="3. 개선할 점" content={result.sections.improvements} /></>
          )}
          {result.sections.details && (
            <>
              <div className="border-t border-notion-border my-4" />
              <div className="mb-5">
                <h3 className="font-bold text-notion-text text-sm mb-2">4. 상세 코멘트</h3>
                <blockquote className="border-l-2 border-violet-400 bg-notion-bg-secondary pl-3 py-1.5 pr-2 rounded-r-lg">
                  <p className="text-xs text-notion-text italic leading-relaxed">{result.sections.details}</p>
                </blockquote>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 스토리 일관성 탭 ──────────────────────────────────────────────────────────

function StoryKeeperTab({
  getContent,
  episodeNo,
  genre,
}: {
  getContent: () => string;
  episodeNo: number;
  genre?: string;
}) {
  const { states, run, clear } = useAnalysis();
  const getWiki = useStore((s) => s.getWiki);
  const novelId = useStore((s) => s.activeNovelId) ?? undefined;
  const state = states.story_keeper;

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <p className="text-xs text-notion-text-secondary mb-3 leading-relaxed">
        플롯 설정과 현재 회차 사이의 모순·충돌을 탐지합니다.
      </p>
      <div className="flex items-center justify-between mb-3">
        {state.result && (
          <button onClick={() => clear("story_keeper")} className="text-xs text-notion-text-secondary hover:text-notion-text transition-colors ml-auto">
            지우기
          </button>
        )}
      </div>
      <button
        onClick={() => {
          const html = getContent();
          if (!html.trim() || html === "<p></p>") return;
          const wiki = getWiki();
          run("story_keeper", html, {
            episodeNo,
            novelId,
            genre,
            wikiContext: wiki.map((w) => ({ type: w.type, title: w.title, description: w.description })),
          });
        }}
        disabled={state.loading}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
          state.loading
            ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
            : "bg-keeper text-white hover:opacity-90 shadow-sm"
        }`}
      >
        {state.loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner /><span>{state.progressMessage ?? "분석 중..."}</span>
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

// ── 역사 고증 탭 ──────────────────────────────────────────────────────────────

function ClioTab({
  getContent,
  docTitle,
}: {
  getContent: () => string;
  docTitle: string;
}) {
  const { states, run, clear } = useAnalysis();
  const getWiki = useStore((s) => s.getWiki);
  const novelId = useStore((s) => s.activeNovelId) ?? undefined;
  const state = states.clio;

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <p className="text-xs text-notion-text-secondary mb-3 leading-relaxed">
        역사적 사실, 고증 오류, 시대 착오적 표현을 탐지합니다.
      </p>
      <div className="flex items-center justify-between mb-3">
        {state.result && (
          <button onClick={() => clear("clio")} className="text-xs text-notion-text-secondary hover:text-notion-text transition-colors ml-auto">
            지우기
          </button>
        )}
      </div>
      <button
        onClick={() => {
          const html = getContent();
          if (!html.trim() || html === "<p></p>") return;
          const wiki = getWiki();
          run("clio", html, {
            docTitle,
            novelId,
            wikiContext: wiki.map((w) => ({ type: w.type, title: w.title, description: w.description })),
          });
        }}
        disabled={state.loading}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
          state.loading
            ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
            : "bg-clio text-white hover:opacity-90 shadow-sm"
        }`}
      >
        {state.loading
          ? <span className="flex items-center justify-center gap-2"><Spinner /><span>분석 중...</span></span>
          : "분석 시작"}
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

// ── 소설 기억 (하단 고정) ─────────────────────────────────────────────────────

function WikiFooter() {
  const getWiki = useStore((s) => s.getWiki);
  const deleteWikiItem = useStore((s) => s.deleteWikiItem);
  const clearWiki = useStore((s) => s.clearWiki);
  const wiki = getWiki() as WikiItem[];
  const [showWiki, setShowWiki] = useState(false);

  return (
    <div className="border-t border-notion-border px-4 py-3 flex-shrink-0">
      {wiki.length === 0 ? (
        <p className="text-xs text-notion-text-secondary text-center">
          🧠 글 저장 시 AI가 설정을 자동 추출합니다
        </p>
      ) : (
        <button
          onClick={() => setShowWiki(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-notion-bg-secondary border border-notion-border hover:bg-notion-border transition-colors text-left"
        >
          <span className="text-base">🧠</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-notion-text">{wiki.length}개 설정 기억됨</p>
            <p className="text-[10px] text-notion-text-secondary truncate">
              {wiki.slice(0, 3).map((w) => w.title).join(" · ")}
              {wiki.length > 3 ? ` 외 ${wiki.length - 3}개` : ""}
            </p>
          </div>
          <span className="text-notion-text-secondary text-xs opacity-50">▸</span>
        </button>
      )}
      {showWiki && (
        <WikiModal
          items={wiki}
          onClose={() => setShowWiki(false)}
          onDelete={deleteWikiItem}
          onClear={clearWiki}
        />
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface Props {
  getContent: () => string;
  onClose: () => void;
  episodeNo?: number;
  docTitle?: string;
  novelTitle?: string;
  genre?: string;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "review",       label: "종합 평가",     icon: "⭐" },
  { id: "story_keeper", label: "스토리 일관성", icon: "🔮" },
  { id: "clio",         label: "역사 고증",     icon: "📜" },
];

export default function AiFeedbackPanel({
  getContent,
  onClose,
  episodeNo = 1,
  docTitle = "원고",
  novelTitle,
  genre,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("review");

  return (
    <aside className="w-80 border-l border-notion-border bg-notion-bg flex flex-col flex-shrink-0 animate-slide-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="font-semibold text-notion-text text-sm">AI 피드백</span>
        </div>
        <button
          onClick={onClose}
          className="text-notion-text-secondary hover:text-notion-text transition-colors text-lg w-6 h-6 flex items-center justify-center"
          title="닫기"
        >
          ×
        </button>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-notion-border flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors flex items-center justify-center gap-1 ${
              activeTab === tab.id
                ? "text-moneta border-b-2 border-moneta"
                : "text-notion-text-secondary hover:text-notion-text"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "review" && (
          <ReviewTab
            getContent={getContent}
            episodeNo={episodeNo}
            docTitle={docTitle}
            novelTitle={novelTitle}
            genre={genre}
          />
        )}
        {activeTab === "story_keeper" && (
          <StoryKeeperTab
            getContent={getContent}
            episodeNo={episodeNo}
            genre={genre}
          />
        )}
        {activeTab === "clio" && (
          <ClioTab
            getContent={getContent}
            docTitle={docTitle}
          />
        )}
      </div>

      {/* 소설 기억 푸터 */}
      <WikiFooter />
    </aside>
  );
}
