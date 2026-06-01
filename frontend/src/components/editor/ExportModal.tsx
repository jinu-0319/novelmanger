"use client";

import { useState } from "react";
import { exportNovel, type ExportFormat } from "@/lib/api";
import type { Document } from "@/types";

// ── 포맷 정의 ─────────────────────────────────────────────────────────────────

interface FormatOption {
  id: ExportFormat;
  label: string;
  ext: string;
  icon: string;
  description: string;
  color: string;
}

const FORMATS: FormatOption[] = [
  {
    id: "docx",
    label: "Microsoft Word",
    ext: ".docx",
    icon: "📝",
    description: "한/영 문서 편집에 최적. 맑은 고딕 적용",
    color: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:border-blue-400",
  },
  {
    id: "pdf",
    label: "PDF",
    ext: ".pdf",
    icon: "📄",
    description: "인쇄·공유에 적합. 레이아웃 고정",
    color: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:border-red-400",
  },
  {
    id: "epub",
    label: "EPUB",
    ext: ".epub",
    icon: "📚",
    description: "전자책 리더(교보·리디 등) 호환",
    color: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400",
  },
  {
    id: "md",
    label: "Markdown",
    ext: ".md",
    icon: "⬇️",
    description: "GitHub·노션·옵시디언 등에서 사용",
    color: "bg-notion-bg-secondary border-notion-border hover:border-gray-400",
  },
  {
    id: "txt",
    label: "텍스트",
    ext: ".txt",
    icon: "🗒️",
    description: "서식 없는 순수 텍스트",
    color: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 hover:border-yellow-400",
  },
];

// ── 범위 선택 ─────────────────────────────────────────────────────────────────

type ScopeType = "all" | "current" | "range";

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  documents: Document[];
  currentDocId?: string;
  novelTitle: string;
  author?: string;
}

export default function ExportModal({
  onClose,
  documents,
  currentDocId,
  novelTitle,
  author = "",
}: Props) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [scope, setScope] = useState<ScopeType>("all");
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(documents.length);
  const [authorInput, setAuthorInput] = useState(author);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const sorted = [...documents].sort((a, b) => a.episode_no - b.episode_no);
  const maxEp = sorted.length > 0 ? sorted[sorted.length - 1].episode_no : 1;

  function getEpisodes(): { episode_no: number; title: string; content_html: string }[] {
    if (scope === "current") {
      const doc = documents.find((d) => d.id === currentDocId);
      return doc ? [{ episode_no: doc.episode_no, title: doc.title, content_html: doc.content }] : [];
    }
    if (scope === "range") {
      return sorted
        .filter((d) => d.episode_no >= rangeFrom && d.episode_no <= rangeTo)
        .map((d) => ({ episode_no: d.episode_no, title: d.title, content_html: d.content }));
    }
    return sorted.map((d) => ({
      episode_no: d.episode_no,
      title: d.title,
      content_html: d.content,
    }));
  }

  async function handleExport() {
    if (!selectedFormat) return;
    const episodes = getEpisodes();
    if (episodes.length === 0) {
      setError("내보낼 회차가 없습니다.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await exportNovel({
        format: selectedFormat,
        novel_title: novelTitle,
        author: authorInput.trim() || undefined,
        episodes,
      });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const episodeCount = getEpisodes().length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-[560px] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-notion-border">
          <div>
            <h2 className="font-bold text-notion-text text-lg">내보내기</h2>
            <p className="text-xs text-notion-text-secondary mt-0.5 truncate max-w-[340px]">{novelTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-notion-text-secondary hover:text-notion-text transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── 포맷 선택 ── */}
          <section>
            <h3 className="text-xs font-semibold text-notion-text-secondary uppercase tracking-wider mb-3">
              파일 형식
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={`relative flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all text-left ${
                    selectedFormat === fmt.id
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20 ring-2 ring-violet-200 dark:ring-violet-800"
                      : fmt.color
                  }`}
                >
                  {selectedFormat === fmt.id && (
                    <span className="absolute top-2 right-2 text-violet-500 text-xs font-bold">✓</span>
                  )}
                  <span className="text-2xl">{fmt.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-notion-text">{fmt.label}</div>
                    <div className="text-[10px] text-notion-text-secondary font-mono">{fmt.ext}</div>
                  </div>
                  <p className="text-[10px] text-notion-text-secondary leading-snug">{fmt.description}</p>
                </button>
              ))}

              {/* HWP — 미지원 */}
              <div className="flex flex-col items-start gap-1 p-3 rounded-xl border-2 border-dashed border-notion-border bg-notion-bg-secondary opacity-50 cursor-not-allowed">
                <span className="text-2xl">🇰🇷</span>
                <div>
                  <div className="text-sm font-semibold text-notion-text-secondary">한글 (HWP)</div>
                  <div className="text-[10px] text-notion-text-secondary font-mono">.hwp</div>
                </div>
                <p className="text-[10px] text-notion-text-secondary leading-snug">준비 중</p>
              </div>
            </div>
          </section>

          {/* ── 범위 선택 ── */}
          <section>
            <h3 className="text-xs font-semibold text-notion-text-secondary uppercase tracking-wider mb-3">
              내보낼 범위
            </h3>
            <div className="space-y-2">
              {[
                { value: "all" as ScopeType, label: `전체 회차 (${sorted.length}화)` },
                {
                  value: "current" as ScopeType,
                  label: `현재 회차만 (${documents.find((d) => d.id === currentDocId)?.title ?? "?"})`,
                  disabled: !currentDocId,
                },
                { value: "range" as ScopeType, label: "회차 범위 직접 지정" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                    scope === opt.value
                      ? "border-violet-300 bg-violet-50 dark:bg-violet-900/20"
                      : "border-notion-border hover:border-notion-text-secondary"
                  } ${opt.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={opt.value}
                    checked={scope === opt.value}
                    onChange={() => !opt.disabled && setScope(opt.value)}
                    disabled={opt.disabled}
                    className="accent-violet-600"
                  />
                  <span className="text-sm text-notion-text">{opt.label}</span>
                </label>
              ))}

              {scope === "range" && (
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-notion-bg-secondary border border-notion-border">
                  <span className="text-xs text-notion-text-secondary">제</span>
                  <input
                    type="number"
                    min={1}
                    max={maxEp}
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 text-center border border-notion-border bg-notion-bg rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 text-notion-text"
                  />
                  <span className="text-xs text-notion-text-secondary">화 ~</span>
                  <input
                    type="number"
                    min={rangeFrom}
                    max={maxEp}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(Math.min(maxEp, parseInt(e.target.value) || maxEp))}
                    className="w-16 text-center border border-notion-border bg-notion-bg rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 text-notion-text"
                  />
                  <span className="text-xs text-notion-text-secondary">화</span>
                </div>
              )}
            </div>
          </section>

          {/* ── 저자명 ── */}
          <section>
            <h3 className="text-xs font-semibold text-notion-text-secondary uppercase tracking-wider mb-3">
              저자명 (선택)
            </h3>
            <input
              value={authorInput}
              onChange={(e) => setAuthorInput(e.target.value)}
              placeholder="파일에 표시될 저자명"
              className="w-full border border-notion-border bg-notion-bg text-notion-text rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-notion-text-secondary"
            />
          </section>

          {/* 오류 */}
          {error && (
            <div className="px-3 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* 완료 */}
          {done && (
            <div className="px-3 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-400 font-medium text-center">
              ✓ 다운로드가 시작되었습니다
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-notion-border bg-notion-bg-secondary rounded-b-2xl">
          <span className="text-xs text-notion-text-secondary">
            {selectedFormat
              ? `${episodeCount}개 회차 · ${FORMATS.find((f) => f.id === selectedFormat)?.label}`
              : "형식을 선택하세요"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-notion-text-secondary hover:text-notion-text transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleExport}
              disabled={!selectedFormat || loading || episodeCount === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>생성 중...</span>
                </>
              ) : (
                <>
                  <span>⬇</span>
                  <span>다운로드</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
