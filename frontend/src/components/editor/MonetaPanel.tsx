"use client";

import { useState } from "react";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useStore } from "@/store/useStore";
import { checkSpell, type SpellResult, type SpellCorrection, suggestPlot, generatePlot, type PlotSuggestion } from "@/lib/api";
import type { AnalysisItem, WikiItem } from "@/types";
import WikiModal from "./WikiModal";

interface Props {
  getContent: () => string;
  getPlainText?: () => string;
  applyContent?: (html: string) => void;
  episodeNo?: number;
  docTitle?: string;
  novelTitle?: string;
  genre?: string;
}

// ── 공통 유틸 ─────────────────────────────────────────────────────────────

function stripHtmlLocal(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? div.innerText ?? "").replace(/\s+/g, " ").trim();
}

// ── 공통 UI ─────────────────────────────────────────────────────────────

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

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  );
}

// ── Story Keeper 섹션 ────────────────────────────────────────────────────

function StoryKeeperSection({
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
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span>🔮</span>
          <span className="font-semibold text-sm text-notion-text">Story Keeper</span>
          <span className="text-xs text-notion-text-secondary">설정 일관성</span>
        </div>
        {state.result && (
          <button onClick={() => clear("story_keeper")} className="text-xs text-notion-text-secondary hover:text-notion-text transition-colors">
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
            <Spinner />
            <span>{state.progressMessage ?? "분석 중..."}</span>
          </span>
        ) : "분석 시작"}
      </button>
      {state.error && (
        <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">{state.error}</div>
      )}
      {state.result && (
        <div className="mt-3">
          {state.result.items.length === 0 ? (
            <div className="text-center py-4 text-sm text-notion-text-secondary">✓ 설정 충돌 없음</div>
          ) : (
            <>
              <div className="text-xs text-notion-text-secondary mb-2">{state.result.items.length}건 발견</div>
              {state.result.items.map((item, i) => <AnalysisCard key={i} item={item} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Clio 섹션 ────────────────────────────────────────────────────────────

function ClioSection({ getContent, docTitle }: { getContent: () => string; docTitle: string }) {
  const { states, run, clear } = useAnalysis();
  const getWiki = useStore((s) => s.getWiki);
  const state = states.clio;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span>📜</span>
          <span className="font-semibold text-sm text-notion-text">Clio</span>
          <span className="text-xs text-notion-text-secondary">역사 고증</span>
        </div>
        {state.result && (
          <button onClick={() => clear("clio")} className="text-xs text-notion-text-secondary hover:text-notion-text transition-colors">
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
        {state.loading ? <span className="flex items-center justify-center gap-2"><Spinner /> 분석 중...</span> : "분석 시작"}
      </button>
      {state.error && (
        <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">{state.error}</div>
      )}
      {state.result && (
        <div className="mt-3">
          {state.result.items.length === 0 ? (
            <div className="text-center py-4 text-sm text-notion-text-secondary">✓ 고증 오류 없음</div>
          ) : (
            <>
              <div className="text-xs text-notion-text-secondary mb-2">{state.result.items.length}건 발견</div>
              {state.result.items.map((item, i) => <AnalysisCard key={i} item={item} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 맞춤법 섹션 ──────────────────────────────────────────────────────────

function CorrectionItem({
  item,
  onApply,
}: {
  item: SpellCorrection;
  onApply: (c: SpellCorrection) => void;
}) {
  const [applied, setApplied] = useState(false);
  return (
    <div className={`rounded-lg border border-notion-border px-3 py-2 mb-2 flex items-center justify-between gap-2 ${applied ? "opacity-40" : ""}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0 text-xs">
        <span className="text-red-500 line-through truncate">{item.original}</span>
        <span className="text-notion-text-secondary flex-shrink-0">→</span>
        <span className="text-green-600 font-medium truncate">{item.corrected}</span>
      </div>
      {!applied && (
        <button
          onClick={() => { onApply(item); setApplied(true); }}
          className="text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded hover:bg-green-100 transition-colors flex-shrink-0"
        >
          적용
        </button>
      )}
    </div>
  );
}

function SpellSection({
  getContent,
  applyContent,
}: {
  getContent: () => string;
  applyContent?: (html: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpellResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  async function runCheck() {
    const html = getContent();
    const text = stripHtmlLocal(html);
    if (!text.trim()) return;

    setLoading(true);
    setApiError(null);
    setResult(null);
    try {
      const data = await checkSpell(text);
      if (data.error) {
        setApiError(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      setApiError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // 개별 단어 교정 적용
  function applySingle(correction: SpellCorrection) {
    if (!applyContent) return;
    let html = getContent();
    const escaped = correction.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(escaped, "g"), correction.corrected);
    applyContent(html);
  }

  // 전체 교정 적용
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
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span>✍️</span>
          <span className="font-semibold text-sm text-notion-text">맞춤법</span>
          <span className="text-xs text-notion-text-secondary">한국어 교정</span>
        </div>
        {result && (
          <button onClick={() => setResult(null)} className="text-xs text-notion-text-secondary hover:text-notion-text transition-colors">
            지우기
          </button>
        )}
      </div>

      <button
        onClick={runCheck}
        disabled={loading}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
          loading
            ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
            : "bg-moneta text-white hover:opacity-90 shadow-sm"
        }`}
      >
        {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> 검사 중...</span> : "검사 시작"}
      </button>

      {apiError && (
        <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">
          {apiError}
        </div>
      )}

      {result && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-notion-text-secondary">
              {result.error_count === 0
                ? "✓ 맞춤법 오류 없음"
                : `오류 ${result.error_count}건 발견`}
            </span>
            {result.corrections.length > 0 && applyContent && (
              <button
                onClick={applyAll}
                className="text-xs bg-moneta text-white px-2.5 py-1 rounded-lg hover:opacity-90 transition-opacity"
              >
                전체 적용
              </button>
            )}
          </div>

          {result.corrections.length === 0 && (
            <div className="text-center py-3 text-sm text-notion-text-secondary">
              수정할 내용이 없습니다 🎉
            </div>
          )}

          {result.corrections.map((c, i) => (
            <CorrectionItem
              key={i}
              item={c}
              onApply={applySingle}
            />
          ))}

          {!applyContent && result.corrections.length > 0 && (
            <p className="text-xs text-notion-text-secondary mt-2 text-center">
              교정 적용은 에디터에서 직접 수정해주세요
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 플롯 섹션 ────────────────────────────────────────────────────────────

const moodColors: Record<string, string> = {
  "긴장감": "bg-red-50 text-red-600 border-red-200",
  "긴장감 고조": "bg-red-50 text-red-600 border-red-200",
  "로맨스": "bg-pink-50 text-pink-600 border-pink-200",
  "로맨틱": "bg-pink-50 text-pink-600 border-pink-200",
  "로맨스 발전": "bg-pink-50 text-pink-600 border-pink-200",
  "반전": "bg-purple-50 text-purple-600 border-purple-200",
  "갈등 심화": "bg-orange-50 text-orange-600 border-orange-200",
  "감동": "bg-blue-50 text-blue-600 border-blue-200",
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

function PlotSection({
  getContent,
  episodeNo,
  novelTitle,
  genre,
}: {
  getContent: () => string;
  episodeNo: number;
  novelTitle?: string;
  genre?: string;
}) {
  const getWiki = useStore((s) => s.getWiki);
  const deleteWikiItem = useStore((s) => s.deleteWikiItem);
  const clearWiki = useStore((s) => s.clearWiki);
  const wiki = getWiki() as WikiItem[];

  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"recommend" | "generate">("recommend");
  const [suggestions, setSuggestions] = useState<PlotSuggestion[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showWiki, setShowWiki] = useState(false);

  async function run() {
    setLoading(true);
    setApiError(null);
    setSuggestions([]);
    try {
      const html = getContent();
      const text = stripHtmlLocal(html);
      const fn = mode === "recommend" ? suggestPlot : generatePlot;
      const data = await fn({
        content: text,
        title: novelTitle,
        genre,
        episode_no: episodeNo,
        wiki_context: wiki.map((w) => ({ type: w.type, title: w.title, description: w.description })),
      });
      if (data.error) setApiError(data.error);
      else setSuggestions(data.suggestions);
    } catch (e) {
      setApiError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span>📖</span>
          <span className="font-semibold text-sm text-notion-text">플롯</span>
          <span className="text-xs text-notion-text-secondary">GPT-4o</span>
        </div>
        {wiki.length > 0 && (
          <button
            onClick={() => setShowWiki(true)}
            className="flex items-center gap-1 text-xs text-moneta hover:opacity-75 transition-opacity"
            title="참고 중인 설정 보기"
          >
            <span>🧠</span>
            <span>{wiki.length}개 참고</span>
          </button>
        )}
      </div>

      {/* 모드 선택 */}
      <div className="flex rounded-lg border border-notion-border overflow-hidden mb-3">
        <button
          onClick={() => setMode("recommend")}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            mode === "recommend" ? "bg-moneta text-white" : "text-notion-text-secondary hover:bg-notion-bg-secondary"
          }`}
        >
          🔮 다음 전개 추천
        </button>
        <button
          onClick={() => setMode("generate")}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            mode === "generate" ? "bg-moneta text-white" : "text-notion-text-secondary hover:bg-notion-bg-secondary"
          }`}
        >
          ✨ 새 플롯 생성
        </button>
      </div>

      <p className="text-xs text-notion-text-secondary mb-3">
        {mode === "recommend"
          ? "현재 회차 내용을 바탕으로 자연스러운 다음 전개를 제안합니다."
          : "장르와 소설 분위기에 맞는 새로운 플롯 아이디어를 생성합니다."}
      </p>

      <button
        onClick={run}
        disabled={loading}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
          loading
            ? "opacity-60 cursor-not-allowed bg-notion-bg-secondary text-notion-text-secondary"
            : "bg-moneta text-white hover:opacity-90 shadow-sm"
        }`}
      >
        {loading
          ? <span className="flex items-center justify-center gap-2"><Spinner /> 생성 중...</span>
          : mode === "recommend" ? "전개 추천 받기" : "플롯 아이디어 생성"}
      </button>

      {apiError && (
        <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">
          {apiError}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-3">
          {/* 참고한 설정 뱃지 */}
          {wiki.length > 0 && (
            <button
              onClick={() => setShowWiki(true)}
              className="flex items-center gap-1.5 text-xs text-notion-text-secondary bg-notion-bg-secondary border border-notion-border rounded-lg px-3 py-1.5 hover:bg-notion-border transition-colors mb-3 w-full"
            >
              <span>🧠</span>
              <span>참고한 설정 {wiki.length}개</span>
              <span className="ml-auto opacity-50">▸</span>
            </button>
          )}
          <div className="text-xs text-notion-text-secondary mb-2">{suggestions.length}가지 아이디어</div>
          {suggestions.map((s, i) => <PlotCard key={i} item={s} />)}
        </div>
      )}

      {/* 위키 모달 */}
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

// ── 패널 루트 ────────────────────────────────────────────────────────────

// ── 위키 미니 섹션 ────────────────────────────────────────────────────────

function WikiMiniSection() {
  const getWiki = useStore((s) => s.getWiki);
  const deleteWikiItem = useStore((s) => s.deleteWikiItem);
  const clearWiki = useStore((s) => s.clearWiki);
  const wiki = getWiki() as WikiItem[];
  const [showWiki, setShowWiki] = useState(false);

  return (
    <div className="mb-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>🧠</span>
          <span className="font-semibold text-sm text-notion-text">소설 기억</span>
          <span className="text-xs text-notion-text-secondary">자동 추출</span>
        </div>
        {wiki.length > 0 && (
          <button
            onClick={() => setShowWiki(true)}
            className="text-xs text-moneta hover:opacity-75 transition-opacity"
          >
            {wiki.length}개 보기
          </button>
        )}
      </div>

      {wiki.length === 0 ? (
        <p className="text-xs text-notion-text-secondary leading-relaxed">
          글을 저장하면 AI가 등장인물·세계관·설정을 자동으로 추출하고 기억합니다.
        </p>
      ) : (
        <button
          onClick={() => setShowWiki(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-notion-bg-secondary border border-notion-border hover:bg-notion-border transition-colors text-left"
        >
          <span className="text-base">🧠</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-notion-text">
              {wiki.length}개 설정 기억됨
            </p>
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

// ── 탭 타입 ───────────────────────────────────────────────────────────────

type TabId = "ai" | "spell" | "plot";

export default function MonetaPanel({
  getContent,
  applyContent,
  episodeNo = 1,
  docTitle = "원고",
  novelTitle,
  genre,
}: Props) {
  const toggleMonetaPanel = useStore((s) => s.toggleMonetaPanel);
  const [activeTab, setActiveTab] = useState<TabId>("ai");

  return (
    <aside className="w-80 border-l border-notion-border bg-notion-bg flex flex-col flex-shrink-0 animate-slide-in">
      {/* 헤더 */}
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

      {/* 탭 */}
      <div className="flex border-b border-notion-border">
        {(["ai", "spell", "plot"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? "text-moneta border-b-2 border-moneta"
                : "text-notion-text-secondary hover:text-notion-text"
            }`}
          >
            {tab === "ai" ? "🔮 AI 분석" : tab === "spell" ? "✍️ 맞춤법" : "📖 플롯"}
          </button>
        ))}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === "ai" && (
          <>
            <StoryKeeperSection getContent={getContent} episodeNo={episodeNo} genre={genre} />
            <div className="border-t border-notion-border my-4" />
            <ClioSection getContent={getContent} docTitle={docTitle} />
            <div className="border-t border-notion-border my-4" />
            <WikiMiniSection />
          </>
        )}
        {activeTab === "spell" && (
          <SpellSection getContent={getContent} applyContent={applyContent} />
        )}
        {activeTab === "plot" && (
          <PlotSection
            getContent={getContent}
            episodeNo={episodeNo}
            novelTitle={novelTitle}
            genre={genre}
          />
        )}
      </div>

      <div className="border-t border-notion-border px-5 py-3">
        <p className="text-xs text-notion-text-secondary text-center">
          제{episodeNo}화 기준으로 분석합니다
        </p>
      </div>
    </aside>
  );
}
