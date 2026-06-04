"use client";

import { useState } from "react";
import { analyzeReview, type ReviewResult, type ReviewScores } from "@/lib/api";
import { useStore } from "@/store/useStore";

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? div.innerText ?? "").replace(/\s+/g, " ").trim();
}

// ── 별점 표시 ─────────────────────────────────────────────────────────────────

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

// ── 점수 바 ───────────────────────────────────────────────────────────────────

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
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── 피드백 섹션 ───────────────────────────────────────────────────────────────

function FeedbackSection({ title, content }: { title: string; content?: string }) {
  if (!content?.trim()) return null;

  // 블릿 항목 파싱 (줄바꿈 구분)
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

// ── 인용 블록 ─────────────────────────────────────────────────────────────────

function QuoteBlock({ text }: { text: string }) {
  return (
    <blockquote className="border-l-2 border-violet-400 bg-notion-bg-secondary pl-3 py-1.5 pr-2 rounded-r-lg my-2">
      <p className="text-xs text-notion-text italic leading-relaxed">{text}</p>
    </blockquote>
  );
}

// ── 스피너 ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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

export default function ReviewPanel({
  getContent,
  onClose,
  episodeNo = 1,
  docTitle,
  novelTitle,
  genre,
}: Props) {
  const getWiki = useStore((s) => s.getWiki);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    const html = getContent();
    const text = stripHtml(html);
    if (!text.trim()) {
      setError("원고 내용이 없습니다. 글을 작성한 후 분석해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    const wiki = getWiki();

    try {
      const data = await analyzeReview({
        text,
        title: docTitle ?? novelTitle ?? "",
        episode_no: episodeNo,
        genre: genre ?? "",
        wiki_context: wiki.map((w) => ({ type: w.type, title: w.title, description: w.description })),
      });
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="w-80 flex-shrink-0 flex flex-col border-l border-notion-border bg-notion-bg overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-notion-border">
        <button
          onClick={onClose}
          className="text-notion-text-secondary hover:text-notion-text transition-colors p-0.5"
          title="닫기"
        >
          ←
        </button>
        <span className="font-semibold text-notion-text text-sm">AI 리뷰</span>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        {/* 분석 버튼 */}
        <div className="px-4 pt-4 pb-3">
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-notion-bg-secondary border border-notion-border text-sm font-medium text-notion-text hover:bg-notion-border transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Spinner />
                <span>분석 중...</span>
              </>
            ) : (
              <>
                <span>↻</span>
                <span>{result ? "다시 분석" : "분석 시작"}</span>
              </>
            )}
          </button>
        </div>

        {/* 오류 */}
        {error && (
          <div className="mx-4 mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 leading-relaxed">
            {error}
          </div>
        )}

        {/* 결과 없음 */}
        {!result && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-notion-text-secondary">
            <div className="text-4xl mb-3">⭐</div>
            <p className="text-sm font-medium text-notion-text mb-1">AI가 원고를 리뷰합니다</p>
            <p className="text-xs leading-relaxed">
              스토리, 캐릭터, 문체 등 7가지 항목을 분석하고 상세한 피드백을 제공합니다.
            </p>
          </div>
        )}

        {/* 로딩 스켈레톤 */}
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
            <div className="pt-4 space-y-2">
              <div className="h-4 bg-notion-border rounded w-32" />
              <div className="h-3 bg-notion-border rounded w-full" />
              <div className="h-3 bg-notion-border rounded w-5/6" />
              <div className="h-3 bg-notion-border rounded w-4/5" />
            </div>
          </div>
        )}

        {/* 분석 결과 */}
        {result && !loading && (
          <div className="px-4 pb-6">
            {/* 종합 점수 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-notion-text-secondary uppercase tracking-wider">
                  리뷰 점수
                </span>
                <div className="flex items-center gap-2">
                  <StarRating score={result.overall} />
                  <span className="text-base font-bold text-notion-text tabular-nums">
                    {result.overall.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* 카테고리 점수 바 */}
              <div className="mt-3">
                {SCORE_LABELS.map(({ key, label, icon }) => (
                  <ScoreBar
                    key={key}
                    label={label}
                    icon={icon}
                    score={result.scores[key]}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-notion-border my-4" />

            {/* 전반적인 피드백 */}
            {result.sections.overall_feedback && (
              <div className="mb-5">
                <h3 className="font-bold text-notion-text text-sm mb-2">1. 전반적인 피드백</h3>
                <p className="text-xs text-notion-text-secondary leading-relaxed whitespace-pre-line">
                  {result.sections.overall_feedback}
                </p>
              </div>
            )}

            {/* 좋은 점 */}
            {result.sections.strengths && (
              <>
                <div className="border-t border-notion-border my-4" />
                <FeedbackSection title="2. 좋은 점" content={result.sections.strengths} />
              </>
            )}

            {/* 개선할 점 */}
            {result.sections.improvements && (
              <>
                <div className="border-t border-notion-border my-4" />
                <FeedbackSection title="3. 개선할 점" content={result.sections.improvements} />
              </>
            )}

            {/* 상세 코멘트 */}
            {result.sections.details && (
              <>
                <div className="border-t border-notion-border my-4" />
                <div className="mb-5">
                  <h3 className="font-bold text-notion-text text-sm mb-2">4. 상세 코멘트</h3>
                  <QuoteBlock text={result.sections.details} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
