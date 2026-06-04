"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useRef } from "react";
import { useStore } from "@/store/useStore";
import { deleteDocumentOnServer } from "@/lib/api";
import type { Document } from "@/types";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

interface Props {
  projectName?: string;
}

export default function Sidebar({ projectName = "내 소설" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeDocId = params.get("doc");

  const {
    documents,
    sidebarCollapsed,
    toggleSidebar,
    upsertDocument,
    deleteDocument,
    reorderEpisodes,
    darkMode,
    toggleDarkMode,
  } = useStore();

  const [contextMenu, setContextMenu] = useState<{
    docId: string;
    x: number;
    y: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  function addDocument() {
    const nextEp =
      documents.length > 0
        ? Math.max(...documents.map((d) => d.episode_no)) + 1
        : 1;
    const id = `doc-${Date.now()}`;
    const newDoc: Document = {
      id,
      episode_no: nextEp,
      title: `제${nextEp}화`,
      content: "",
    };
    upsertDocument(newDoc);
    router.push(`/editor?doc=${id}`);
  }

  function handleDelete(docId: string) {
    deleteDocument(docId);
    reorderEpisodes();
    setContextMenu(null);
    deleteDocumentOnServer(docId);
    if (activeDocId === docId) {
      const remaining = documents.filter((d) => d.id !== docId);
      if (remaining.length > 0) router.push(`/editor?doc=${remaining[0].id}`);
      else router.push("/editor");
    }
  }

  function startRename(docId: string) {
    setRenaming(docId);
    setContextMenu(null);
    setTimeout(() => renameRef.current?.focus(), 50);
  }

  function commitRename(doc: Document, title: string) {
    if (title.trim()) upsertDocument({ ...doc, title: title.trim() });
    setRenaming(null);
  }

  const navItems = [
    { href: "/characters", icon: "👥", label: "등장인물" },
    { href: "/universe", icon: "🌍", label: "세계관 · 줄거리" },
    { href: "/materials", icon: "📚", label: "자료실" },
  ];

  const sortedDocs = [...documents].sort((a, b) => a.episode_no - b.episode_no);

  if (sidebarCollapsed) {
    return (
      <aside className="w-12 bg-notion-sidebar flex flex-col items-center py-4 gap-4 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className="text-white/60 hover:text-white transition-colors"
          title="사이드바 열기"
        >
          ▶
        </button>
      </aside>
    );
  }

  return (
    <>
      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-notion-border rounded-lg shadow-lg py-1 min-w-32"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {(() => {
            const doc = documents.find((d) => d.id === contextMenu.docId);
            if (!doc) return null;
            return (
              <>
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-notion-bg-secondary"
                  onClick={() => startRename(contextMenu.docId)}
                >
                  이름 변경
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                  onClick={() => handleDelete(contextMenu.docId)}
                >
                  삭제
                </button>
              </>
            );
          })()}
        </div>
      )}

      <aside className="w-60 bg-notion-sidebar flex flex-col flex-shrink-0 select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-6 h-6 rounded bg-moneta flex items-center justify-center text-white text-xs font-bold">
              M
            </div>
            <span className="text-white/90 font-semibold text-sm truncate max-w-32">
              {projectName}
            </span>
          </Link>
          <button
            onClick={toggleSidebar}
            className="text-white/40 hover:text-white/80 transition-colors text-xs"
          >
            ◀
          </button>
        </div>

        {/* Writing section */}
        <div className="flex-1 overflow-y-auto py-3">
          <div className="px-3 mb-1">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-white/40 text-xs uppercase tracking-widest font-medium">
                집필
              </span>
              <button
                onClick={addDocument}
                className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none"
                title="새 회차 추가"
              >
                +
              </button>
            </div>

            {sortedDocs.length === 0 && (
              <button
                onClick={addDocument}
                className="w-full text-left px-2 py-2 text-white/30 text-sm hover:text-white/60 transition-colors rounded"
              >
                + 새 회차 추가하기
              </button>
            )}

            {sortedDocs.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
                  activeDocId === doc.id
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:bg-white/8 hover:text-white/90"
                )}
                onClick={() => router.push(`/editor?doc=${doc.id}`)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY });
                }}
              >
                <span className="text-xs text-white/30 w-5 text-right flex-shrink-0">
                  {doc.episode_no}
                </span>
                {renaming === doc.id ? (
                  <input
                    ref={renameRef}
                    defaultValue={doc.title}
                    className="bg-white/10 text-white text-sm flex-1 px-1 rounded outline-none"
                    onBlur={(e) => commitRename(doc, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        commitRename(doc, e.currentTarget.value);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <span className="text-sm truncate flex-1">{doc.title}</span>
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 text-xs transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  ···
                </button>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 my-3 mx-3" />

          {/* Nav items */}
          <div className="px-3 space-y-0.5">
            <span className="px-2 text-white/40 text-xs uppercase tracking-widest font-medium block mb-1">
              도구
            </span>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors",
                  pathname === item.href
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:bg-white/8 hover:text-white/90"
                )}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 p-3 flex items-center justify-between">
          <button
            onClick={toggleDarkMode}
            className="text-white/40 hover:text-white/80 transition-colors text-sm"
            title={darkMode ? "라이트 모드" : "다크 모드"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          <span className="text-white/20 text-xs">Solar Pro 2</span>
        </div>
      </aside>
    </>
  );
}
