"use client";

import { useState } from "react";
import type { ImportedDoc } from "@/lib/importers";

interface ImportModalProps {
  docs: ImportedDoc[];
  warnings: string[];
  onConfirm: (docs: ImportedDoc[]) => void;
  onClose: () => void;
}

export default function ImportModal({
  docs,
  warnings,
  onConfirm,
  onClose,
}: ImportModalProps) {
  // 가져오기 확인 목록 (체크박스로 선택/해제 가능)
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(docs.map((_, i) => i))
  );

  function toggleAll() {
    if (selected.size === docs.length) setSelected(new Set());
    else setSelected(new Set(docs.map((_, i) => i)));
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleConfirm() {
    const chosenDocs = docs.filter((_, i) => selected.has(i));
    if (chosenDocs.length === 0) return;
    onConfirm(chosenDocs);
  }

  // 미리보기용 순수 텍스트
  function plainSnippet(html: string, maxLen = 80): string {
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
  }

  // 폴더 경로별 그룹핑
  const grouped = groupByFolder(docs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 본체 */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              파일 가져오기
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {docs.length}개 문서를 가져옵니다
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* 경고 메시지 */}
        {warnings.length > 0 && (
          <div className="mx-4 mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
              ⚠️ 주의 사항
            </p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-300 leading-relaxed">
                {w}
              </p>
            ))}
          </div>
        )}

        {/* 전체 선택 토글 */}
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <span className="text-xs text-neutral-400">
            {selected.size}/{docs.length}개 선택됨
          </span>
          <button
            onClick={toggleAll}
            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            {selected.size === docs.length ? "전체 해제" : "전체 선택"}
          </button>
        </div>

        {/* 문서 목록 */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {grouped.map(({ folderPath, items }) => (
            <div key={folderPath ?? "__root__"} className="mb-3">
              {/* 폴더 헤더 */}
              {folderPath && (
                <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
                  <span className="text-neutral-300 dark:text-neutral-600 text-xs">📁</span>
                  <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">
                    {folderPath}
                  </span>
                </div>
              )}

              {/* 문서 항목들 */}
              {items.map(({ doc, idx }: { doc: ImportedDoc; idx: number }) => (
                <label
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-1 ${
                    selected.has(idx)
                      ? "bg-indigo-50 dark:bg-indigo-950/40"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(idx)}
                    onChange={() => toggle(idx)}
                    className="mt-0.5 flex-shrink-0 accent-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
                      {doc.title || "제목 없음"}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 line-clamp-2 leading-relaxed">
                      {plainSnippet(doc.content)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          ))}

          {docs.length === 0 && (
            <div className="py-10 text-center text-neutral-400 text-sm">
              가져올 문서가 없습니다
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-100 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="px-5 py-2 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            가져오기 {selected.size > 0 && `(${selected.size}개)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 폴더 경로별 그룹핑 헬퍼 ────────────────────────────────────────────────

function groupByFolder(docs: ImportedDoc[]) {
  const map = new Map<string | undefined, { doc: ImportedDoc; idx: number }[]>();

  docs.forEach((doc, idx) => {
    const key = doc.folderPath;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ doc, idx });
  });

  // undefined (미분류) 먼저, 나머지는 알파벳 순
  const sorted = [...map.entries()].sort(([a], [b]) => {
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return a.localeCompare(b, "ko");
  });

  return sorted.map(([folderPath, items]) => ({ folderPath, items }));
}
