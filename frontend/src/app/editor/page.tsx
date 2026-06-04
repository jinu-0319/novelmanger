"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/store/useStore";
import Sidebar from "@/components/layout/Sidebar";
import NovelEditor, { type NovelEditorRef } from "@/components/editor/NovelEditor";
import AiFeedbackPanel from "@/components/editor/AiFeedbackPanel";
import StoryPlanPanel from "@/components/editor/StoryPlanPanel";
import SpellPanel from "@/components/editor/SpellPanel";
import ExportModal from "@/components/editor/ExportModal";

function EditorContent() {
  const params = useSearchParams();
  const docId = params.get("doc");

  const documents = useStore((s) => s.getDocuments());
  const activeNovel = useStore((s) => s.getActiveNovel());

  const [aiFeedbackOpen, setAiFeedbackOpen] = useState(false);
  const [storyPlanOpen, setStoryPlanOpen] = useState(false);
  const [spellPanelOpen, setSpellPanelOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // 패널 하나만 열리도록
  function openPanel(target: "ai" | "story" | "spell") {
    setAiFeedbackOpen(target === "ai");
    setStoryPlanOpen(target === "story");
    setSpellPanelOpen(target === "spell");
  }
  const upsertDocument = useStore((s) => s.upsertDocument);

  const activeDoc = documents.find((d) => d.id === docId) ?? documents[0];

  // 에디터 ref (맞춤법 교정 적용용)
  const editorRef = useRef<NovelEditorRef>(null);


  // 사이드바의 addDocument를 이벤트로 트리거
  function handleNewDoc() {
    window.dispatchEvent(new CustomEvent("sidebar:openAddDoc"));
  }

  // 맞춤법 교정 적용 — 에디터 + 스토어 동시 업데이트
  function handleApplyContent(html: string) {
    if (!activeDoc) return;
    editorRef.current?.setContent(html);
    upsertDocument({ ...activeDoc, content: html });
  }

  return (
    <div className="flex h-screen bg-notion-bg overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        {/* 브레드크럼 + 액션 바 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-notion-border bg-notion-bg flex-shrink-0">
          {/* 브레드크럼 */}
          <div className="flex items-center gap-1.5 text-xs text-notion-text-secondary min-w-0">
            <span className="opacity-50">문서</span>
            {activeDoc && (
              <>
                <span className="opacity-30">›</span>
                <span className="text-notion-text font-medium truncate max-w-[200px]">
                  {activeDoc.title}
                </span>
              </>
            )}
            {!activeDoc && (
              <span className="opacity-50">회차를 선택하거나 새로 만드세요</span>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!activeDoc && (
              <button
                onClick={handleNewDoc}
                className="px-2.5 py-1 text-xs bg-notion-bg-secondary border border-notion-border rounded-md hover:bg-notion-border transition-colors text-notion-text"
              >
                + 새 회차
              </button>
            )}

            {/* 내보내기 */}
            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-all bg-notion-bg-secondary text-notion-text-secondary border-notion-border hover:bg-notion-border hover:text-notion-text"
              title="내보내기"
            >
              <span>⬇</span>
              <span className="hidden sm:inline">내보내기</span>
            </button>

            {/* 맞춤법 */}
            <button
              onClick={() => spellPanelOpen ? setSpellPanelOpen(false) : openPanel("spell")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-all ${
                spellPanelOpen
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-notion-bg-secondary text-notion-text-secondary border-notion-border hover:bg-notion-border hover:text-notion-text"
              }`}
              title="맞춤법 검사"
            >
              <span>✍️</span>
              <span className="hidden sm:inline">맞춤법</span>
            </button>

            {/* 스토리 제안받기 */}
            <button
              onClick={() => storyPlanOpen ? setStoryPlanOpen(false) : openPanel("story")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-all ${
                storyPlanOpen
                  ? "bg-moneta text-white border-moneta"
                  : "bg-notion-bg-secondary text-notion-text-secondary border-notion-border hover:bg-notion-border hover:text-notion-text"
              }`}
              title="스토리 제안받기"
            >
              <span>✨</span>
              <span className="hidden sm:inline">스토리 제안</span>
            </button>

            {/* AI 피드백 */}
            <button
              onClick={() => aiFeedbackOpen ? setAiFeedbackOpen(false) : openPanel("ai")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-all ${
                aiFeedbackOpen
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-notion-bg-secondary text-notion-text-secondary border-notion-border hover:bg-notion-border hover:text-notion-text"
              }`}
              title="AI 피드백"
            >
              <span>🤖</span>
              <span className="hidden sm:inline">AI 피드백</span>
            </button>
          </div>
        </div>

        {/* 에디터 + 패널 */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden relative">
            {activeDoc ? (
              <NovelEditor ref={editorRef} key={activeDoc.id} doc={activeDoc} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="text-6xl mb-4">✍️</div>
                <h2 className="text-xl font-semibold text-notion-text mb-2">
                  집필을 시작하세요
                </h2>
                <p className="text-notion-text-secondary mb-6">
                  왼쪽 사이드바에서 회차를 선택하거나 새로 만드세요
                </p>
                <button
                  onClick={handleNewDoc}
                  className="px-6 py-2.5 bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors shadow-sm"
                >
                  + 첫 번째 회차 만들기
                </button>
              </div>
            )}
          </div>

          {storyPlanOpen && activeDoc && (
            <StoryPlanPanel
              getContent={() => editorRef.current?.getHTML() ?? activeDoc.content}
              onClose={() => setStoryPlanOpen(false)}
              episodeNo={activeDoc.episode_no}
              novelTitle={activeNovel?.title}
              genre={activeNovel?.genre}
            />
          )}

          {aiFeedbackOpen && activeDoc && (
            <AiFeedbackPanel
              getContent={() => editorRef.current?.getHTML() ?? activeDoc.content}
              onClose={() => setAiFeedbackOpen(false)}
              episodeNo={activeDoc.episode_no}
              docTitle={activeDoc.title}
              novelTitle={activeNovel?.title}
              genre={activeNovel?.genre}
            />
          )}

          {exportModalOpen && (
            <ExportModal
              onClose={() => setExportModalOpen(false)}
              documents={documents}
              currentDocId={activeDoc?.id}
              novelTitle={activeNovel?.title ?? "소설"}
              author={activeNovel?.description ?? ""}
            />
          )}

          {spellPanelOpen && activeDoc && (
            <SpellPanel
              getContent={() => editorRef.current?.getHTML() ?? activeDoc.content}
              applyContent={handleApplyContent}
              onClose={() => setSpellPanelOpen(false)}
            />
          )}

        </div>
      </main>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense>
      <EditorContent />
    </Suspense>
  );
}
