"use client";

import type { WikiItem, WikiItemType } from "@/types";

// ── 타입별 메타 ─────────────────────────────────────────────────────────────

const TYPE_META: Record<WikiItemType, { icon: string; label: string }> = {
  character: { icon: "👤", label: "등장인물" },
  world:     { icon: "🌐", label: "세계관" },
  event:     { icon: "🔑", label: "주요 사건" },
  theme:     { icon: "📖", label: "주제·소재" },
  location:  { icon: "📍", label: "장소" },
  chapter:   { icon: "📄", label: "회차 요약" },
  setting:   { icon: "⚙️", label: "설정" },
};

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  items: WikiItem[];
  onClose: () => void;
  onDelete?: (id: string) => void;
  onClear?: () => void;
}

// ── 컴포넌트 ────────────────────────────────────────────────────────────────

export default function WikiModal({ items, onClose, onDelete, onClear }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-notion-bg border border-notion-border rounded-2xl shadow-2xl w-[500px] max-h-[72vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-notion-border flex-shrink-0">
          <div>
            <h2 className="font-bold text-notion-text text-base">
              참고한 설정 {items.length}개
            </h2>
            <p className="text-xs text-notion-text-secondary mt-0.5">
              AI가 글에서 자동으로 추출한 소설 설정 기억
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onClear && items.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("모든 설정 기억을 삭제하시겠습니까?")) {
                    onClear();
                    onClose();
                  }
                }}
                className="text-xs text-notion-text-secondary hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-notion-bg-secondary"
              >
                전체 삭제
              </button>
            )}
            <button
              onClick={onClose}
              className="text-notion-text-secondary hover:text-notion-text transition-colors text-xl w-7 h-7 flex items-center justify-center rounded hover:bg-notion-bg-secondary"
            >
              ×
            </button>
          </div>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {items.length === 0 ? (
            <div className="text-center py-10 text-notion-text-secondary">
              <div className="text-4xl mb-3">🧠</div>
              <p className="text-sm font-medium text-notion-text mb-1">
                아직 추출된 설정이 없습니다
              </p>
              <p className="text-xs leading-relaxed">
                글을 작성하고 저장하면
                <br />
                AI가 자동으로 등장인물·세계관·설정을 추출합니다.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const meta =
                TYPE_META[item.type as WikiItemType] ?? { icon: "📌", label: item.type };
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-notion-bg-secondary hover:bg-notion-border transition-colors group"
                >
                  {/* 아이콘 */}
                  <span className="text-lg flex-shrink-0 mt-0.5 select-none">
                    {meta.icon}
                  </span>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm text-notion-text">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-notion-text-secondary bg-notion-border px-1.5 py-0.5 rounded-full">
                        {meta.label}
                      </span>
                      {item.episode_no && (
                        <span className="text-[10px] text-notion-text-secondary opacity-50">
                          제{item.episode_no}화
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-notion-text-secondary mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* 삭제 버튼 */}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-notion-text-secondary hover:text-red-400 transition-all text-base flex-shrink-0 w-5 h-5 flex items-center justify-center"
                      title="이 항목 삭제"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 푸터 */}
        {items.length > 0 && (
          <div className="border-t border-notion-border px-5 py-3 flex-shrink-0">
            <p className="text-xs text-notion-text-secondary text-center">
              이 설정들은 플롯 생성 시 AI 컨텍스트로 자동 활용됩니다
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
