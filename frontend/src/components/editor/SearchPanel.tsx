"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/useStore";

interface Props {
  onClose: () => void;
}

interface SearchResult {
  docId: string;
  episodeNo: number;
  title: string;
  snippet: string;
  matchCount: number;
}

function stripHtml(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? div.innerText ?? "").replace(/\s+/g, " ").trim();
}

function getSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 100) + (text.length > 100 ? "..." : "");
  const start = Math.max(0, idx - 35);
  const end = Math.min(text.length, idx + query.length + 60);
  return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 not-italic">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function SearchPanel({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const getDocuments = useStore((s) => s.getDocuments);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const docs = getDocuments();
    const found: SearchResult[] = [];

    for (const doc of docs) {
      const text = stripHtml(doc.content);
      const lower = text.toLowerCase();
      const ql = q.toLowerCase();

      let count = 0;
      let pos = 0;
      while ((pos = lower.indexOf(ql, pos)) !== -1) {
        count++;
        pos += ql.length;
      }

      if (count > 0) {
        found.push({
          docId: doc.id,
          episodeNo: doc.episode_no,
          title: doc.title,
          snippet: getSnippet(text, q),
          matchCount: count,
        });
      }
    }

    setResults(found.sort((a, b) => a.episodeNo - b.episodeNo));
  }, [query, getDocuments]);

  const totalMatches = results.reduce((s, r) => s + r.matchCount, 0);

  return (
    <div className="absolute top-0 left-0 right-0 z-40 bg-notion-bg border-b-2 border-notion-border shadow-lg">
      {/* 입력 행 */}
      <div className="flex items-center gap-3 px-6 py-3">
        <span className="text-notion-text-secondary flex-shrink-0">🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="소설 전체에서 검색 (2자 이상)..."
          className="flex-1 bg-transparent outline-none text-notion-text placeholder:text-notion-text-secondary text-sm"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        {query.length >= 2 && (
          <span className="text-xs text-notion-text-secondary flex-shrink-0">
            {results.length > 0
              ? `${totalMatches}건 · ${results.length}화`
              : "결과 없음"}
          </span>
        )}
        <button
          onClick={onClose}
          className="text-notion-text-secondary hover:text-notion-text text-xl leading-none flex-shrink-0"
          title="닫기 (Esc)"
        >
          ×
        </button>
      </div>

      {/* 결과 목록 */}
      {results.length > 0 && (
        <div className="border-t border-notion-border max-h-64 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.docId}
              onClick={() => {
                router.push(`/editor?doc=${r.docId}`);
                onClose();
              }}
              className="w-full text-left px-6 py-3 hover:bg-notion-bg-secondary transition-colors border-b border-notion-border/40 last:border-0"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-notion-text">
                  제{r.episodeNo}화 · {r.title}
                </span>
                <span className="text-xs bg-moneta/10 text-moneta px-1.5 py-0.5 rounded-full font-medium">
                  {r.matchCount}건
                </span>
              </div>
              <p className="text-xs text-notion-text-secondary leading-relaxed">
                <HighlightedText text={r.snippet} query={query.trim()} />
              </p>
            </button>
          ))}
        </div>
      )}

      {query.length >= 2 && results.length === 0 && (
        <div className="border-t border-notion-border px-6 py-4 text-sm text-notion-text-secondary text-center">
          &apos;{query}&apos;에 대한 검색 결과가 없습니다
        </div>
      )}
    </div>
  );
}
