"use client";

import { Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/store/useStore";
import Sidebar from "@/components/layout/Sidebar";
import NovelEditor from "@/components/editor/NovelEditor";
import MonetaPanel from "@/components/editor/MonetaPanel";

function EditorContent() {
  const params = useSearchParams();
  const docId = params.get("doc");

  const documents = useStore((s) => s.documents);
  const monetaPanelOpen = useStore((s) => s.monetaPanelOpen);
  const toggleMonetaPanel = useStore((s) => s.toggleMonetaPanel);
  const upsertDocument = useStore((s) => s.upsertDocument);

  const editorRef = useRef<{ getHTML: () => string } | null>(null);

  const activeDoc = documents.find((d) => d.id === docId) ?? documents[0];

  function handleNewDoc() {
    const nextEp =
      documents.length > 0
        ? Math.max(...documents.map((d) => d.episode_no)) + 1
        : 1;
    const id = `doc-${Date.now()}`;
    upsertDocument({
      id,
      episode_no: nextEp,
      title: `제${nextEp}화`,
      content: "",
    });
  }

  return (
    <div className="flex h-screen bg-notion-bg overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-notion-border bg-notion-bg">
          <div className="text-sm text-notion-text-secondary">
            {activeDoc
              ? `제${activeDoc.episode_no}화 · ${activeDoc.title}`
              : "회차를 선택하거나 새로 만드세요"}
          </div>
          <div className="flex items-center gap-2">
            {!activeDoc && (
              <button
                onClick={handleNewDoc}
                className="px-3 py-1.5 text-sm bg-notion-bg-secondary border border-notion-border rounded-lg hover:bg-notion-border transition-colors"
              >
                + 새 회차
              </button>
            )}
            <button
              onClick={toggleMonetaPanel}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-all ${
                monetaPanelOpen
                  ? "bg-moneta text-white border-moneta shadow-sm"
                  : "bg-notion-bg-secondary text-notion-text border-notion-border hover:bg-notion-border"
              }`}
            >
              <span className="text-base leading-none">🔮</span>
              <span>Moneta</span>
            </button>
          </div>
        </div>

        {/* Editor + Panel */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {activeDoc ? (
              <NovelEditor key={activeDoc.id} doc={activeDoc} />
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

          {monetaPanelOpen && activeDoc && (
            <MonetaPanel
              getContent={() => activeDoc.content}
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
