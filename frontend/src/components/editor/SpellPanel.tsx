"use client";

import { useState } from "react";
import { checkSpell, type SpellResult, type SpellCorrection } from "@/lib/api";

interface Props {
  getContent: () => string;
  applyContent?: (html: string) => void;
  onClose: () => void;
}

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

function CorrectionItem({
  item,
  onApply,
}: {
  item: SpellCorrection;
  onApply: (c: SpellCorrection) => void;
}) {
  const [applied, setApplied] = useState(false);
  return (
    <div
      className={`rounded-lg border border-notion-border px-3 py-2 mb-2 flex items-center justify-between gap-2 ${
        applied ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0 text-xs">
        <span className="text-red-500 line-through truncate">{item.original}</span>
        <span className="text-notion-text-secondary flex-shrink-0">→</span>
        <span className="text-green-600 font-medium truncate">{item.corrected}</span>
      </div>
      {!applied && (
        <button
          onClick={() => {
            onApply(item);
            setApplied(true);
          }}
          className="text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded hover:bg-green-100 transition-colors flex-shrink-0"
        >
          적용
        </button>
      )}
    </div>
  );
}

export default function SpellPanel({ getContent, applyContent, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpellResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  async function runCheck() {
    const text = stripHtml(getContent());
    if (!text.trim()) return;
    setLoading(true);
    setApiError(null);
    setResult(null);
    try {
      const data = await checkSpell(text);
      if (data.error) setApiError(data.error);
      else setResult(data);
    } catch (e) {
      setApiError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function applySingle(correction: SpellCorrection) {
    if (!applyContent) return;
    let html = getContent();
    const escaped = correction.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(escaped, "g"), correction.corrected);
    applyContent(html);
  }

  function applyAll() {
    if (!applyContent || !result) return;
    let html = getContent();
    for (const c of result.corrections) {
      const escaped = c.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(escaped, "g"), c.corrected);
    }
    applyContent(html);
    setResult(null);
  }

  return (
    <aside className="w-80 border-l border-notion-border bg-notion-bg flex flex-col flex-shrink-0 animate-slide-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-notion-border">
        <div className="flex items-center gap-2">
          <span className="text-base">✍️</span>
          <span className="font-semibold text-notion-text">맞춤법 검사</span>
        </div>
        <button
          onClick={onClose}
          className="text-notion-text-secondary hover:text-notion-text transition-colors text-lg"
          title="패널 닫기"
        >
          ×
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-xs text-notion-text-secondary mb-4 leading-relaxed">
          현재 회차 원고의 한국어 맞춤법을 검사합니다.
          오류를 발견하면 단어 단위로 교정을 제안합니다.
        </p>

        <button
          onClick={runCheck}
          disabled={loading}
          className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
            loading
              ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
              : "bg-moneta text-white hover:opacity-90 shadow-sm"
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              검사 중...
            </span>
          ) : (
            "검사 시작"
          )}
        </button>

        {apiError && (
          <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">
            {apiError}
          </div>
        )}

        {result && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-notion-text-secondary">
                {result.error_count === 0
                  ? "✓ 맞춤법 오류 없음"
                  : `오류 ${result.error_count}건 발견`}
              </span>
              <div className="flex items-center gap-2">
                {result.corrections.length > 0 && applyContent && (
                  <button
                    onClick={applyAll}
                    className="text-xs bg-moneta text-white px-2.5 py-1 rounded-lg hover:opacity-90 transition-opacity"
                  >
                    전체 적용
                  </button>
                )}
                <button
                  onClick={() => setResult(null)}
                  className="text-xs text-notion-text-secondary hover:text-notion-text transition-colors"
                >
                  지우기
                </button>
              </div>
            </div>

            {result.corrections.length === 0 ? (
              <div className="text-center py-6 text-notion-text-secondary text-sm">
                🎉 오류가 없습니다!
              </div>
            ) : (
              result.corrections.map((c, i) => (
                <CorrectionItem key={i} item={c} onApply={applySingle} />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
