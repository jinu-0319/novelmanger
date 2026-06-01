"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";
import type { Document, DocFolder } from "@/types";
import { importFile, importFolder, FILE_ACCEPT } from "@/lib/importers";
import type { ImportResult, ImportedDoc } from "@/lib/importers";
import ImportModal from "@/components/layout/ImportModal";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

interface Props {
  projectName?: string;
}

// ── 단일 문서 행 ───────────────────────────────────────────────────────────────

interface DocRowProps {
  doc: Document;
  isActive: boolean;
  isRenaming: boolean;
  renameRef: React.RefObject<HTMLInputElement>;
  onCommitRename: (doc: Document, title: string) => void;
  onCancelRename: () => void;
  onContextMenu: (e: React.MouseEvent, docId: string) => void;
  onDragStart: (e: React.DragEvent, docId: string) => void;
  onClick: () => void;
  indent?: boolean;
}

function DocRow({
  doc, isActive, isRenaming, renameRef, onCommitRename, onCancelRename,
  onContextMenu, onDragStart, onClick, indent,
}: DocRowProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, doc.id)}
      className={cn(
        "group flex items-center gap-1.5 py-1 rounded cursor-pointer transition-colors",
        indent ? "pl-6 pr-2" : "px-2",
        isActive
          ? "bg-white/15 text-white"
          : "text-white/60 hover:bg-white/8 hover:text-white/90"
      )}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, doc.id); }}
    >
      <span className="text-[10px] text-white/25 w-4 text-right flex-shrink-0 tabular-nums select-none">
        {doc.episode_no}
      </span>
      {isRenaming ? (
        <input
          ref={renameRef}
          defaultValue={doc.title}
          className="bg-white/10 text-white text-sm flex-1 px-1 rounded outline-none min-w-0"
          placeholder="제목 입력..."
          onBlur={(e) => onCommitRename(doc, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename(doc, e.currentTarget.value);
            if (e.key === "Escape") onCancelRename();
          }}
        />
      ) : (
        <span className={cn("text-sm flex-1 min-w-0", doc.title ? "truncate" : "text-white/30 italic")}>
          {doc.title || "제목 없음"}
        </span>
      )}
      <button
        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 text-xs transition-all flex-shrink-0"
        onClick={(e) => { e.stopPropagation(); onContextMenu(e, doc.id); }}
      >
        ···
      </button>
    </div>
  );
}

// ── 폴더 행 ───────────────────────────────────────────────────────────────────

interface FolderRowProps {
  folder: DocFolder;
  docs: Document[];
  activeDocId: string | null;
  isRenamingFolder: boolean;
  folderRenameRef: React.RefObject<HTMLInputElement>;
  onCommitFolderRename: (folder: DocFolder, title: string) => void;
  onToggleCollapse: () => void;
  onFolderContextMenu: (e: React.MouseEvent, folderId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, folderId: string) => void;
  children: React.ReactNode;
}

function FolderRow({
  folder, docs, isRenamingFolder, folderRenameRef, onCommitFolderRename,
  onToggleCollapse, onFolderContextMenu, onDragOver, onDrop, children,
}: FolderRowProps) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="mb-0.5">
      {/* 폴더 헤더 */}
      <div
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors select-none",
          dragOver ? "bg-moneta/20" : "hover:bg-white/8"
        )}
        onClick={onToggleCollapse}
        onContextMenu={(e) => { e.preventDefault(); onFolderContextMenu(e, folder.id); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); onDragOver(e); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); onDrop(e, folder.id); }}
      >
        <span className="text-white/40 text-[10px] w-3 flex-shrink-0 transition-transform"
          style={{ transform: folder.collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
          ▾
        </span>
        <span className="text-white/50 text-xs flex-shrink-0">📁</span>
        {isRenamingFolder ? (
          <input
            ref={folderRenameRef}
            defaultValue={folder.title}
            className="bg-white/10 text-white text-xs flex-1 px-1 rounded outline-none min-w-0"
            onBlur={(e) => onCommitFolderRename(folder, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitFolderRename(folder, e.currentTarget.value);
              if (e.key === "Escape") onCommitFolderRename(folder, folder.title);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-xs text-white/70 font-medium flex-1 truncate">{folder.title}</span>
        )}
        <span className="text-[10px] text-white/25 ml-auto flex-shrink-0">
          {docs.length}
        </span>
        <button
          className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 text-xs transition-all flex-shrink-0 ml-0.5"
          onClick={(e) => { e.stopPropagation(); onFolderContextMenu(e, folder.id); }}
        >
          ···
        </button>
      </div>

      {/* 폴더 내 문서들 */}
      {!folder.collapsed && (
        <div className="mt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── 메인 사이드바 ─────────────────────────────────────────────────────────────

export default function Sidebar({ projectName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeDocId = params.get("doc");

  const {
    getDocuments,
    sidebarCollapsed,
    toggleSidebar,
    upsertDocument,
    deleteDocument,
    reorderEpisodes,
    getActiveNovel,
    darkMode,
    toggleDarkMode,
    getFolders,
    addFolder,
    updateFolder,
    deleteFolder,
    moveDocToFolder,
    batchImport,
  } = useStore();

  // 문서 컨텍스트 메뉴
  const [contextMenu, setContextMenu] = useState<{ docId: string; x: number; y: number } | null>(null);
  // 폴더 컨텍스트 메뉴
  const [folderContextMenu, setFolderContextMenu] = useState<{ folderId: string; x: number; y: number } | null>(null);
  // 폴더 이동 서브메뉴
  const [movingDocId, setMovingDocId] = useState<string | null>(null);

  const [renaming, setRenaming] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const folderRenameRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");

  // 새 폴더 입력
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 추가 메뉴 (+ 드롭다운)
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // 파일 불러오기
  const [importPending, setImportPending] = useState<ImportResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // 드래그
  const dragDocId = useRef<string | null>(null);

  const documents = getDocuments();
  const folders = getFolders();
  const activeNovel = getActiveNovel();
  const displayName = projectName ?? activeNovel?.title ?? "내 소설";

  const navItems = [
    { href: "/plot",       icon: "📋", label: "플롯 보드" },
    { href: "/characters", icon: "👥", label: "등장인물" },
    { href: "/universe",   icon: "🌍", label: "세계관 · 줄거리" },
    { href: "/materials",  icon: "📚", label: "자료실" },
  ];

  const sortedDocs = [...documents].sort((a, b) => a.episode_no - b.episode_no);

  // 미분류 문서 (폴더 없음)
  const ungroupedDocs = sortedDocs.filter(
    (d) => !d.folder_id || !folders.find((f) => f.id === d.folder_id)
  );

  // 폴더에 속한 문서 조회
  const docsInFolder = (folderId: string) =>
    sortedDocs.filter((d) => d.folder_id === folderId);

  // 에디터 화면에서 보내는 이벤트 수신
  useEffect(() => {
    const handler = () => addDocument();
    window.addEventListener("sidebar:openAddDoc", handler);
    return () => window.removeEventListener("sidebar:openAddDoc", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  // ── 문서 액션 ──────────────────────────────────────────────────────────────

  function addDocument(folderId?: string) {
    const nextEp =
      documents.length > 0
        ? Math.max(...documents.map((d) => d.episode_no)) + 1
        : 1;
    const id = `doc-${Date.now()}`;
    const newDoc: Document = {
      id,
      episode_no: nextEp,
      title: "",
      content: "",
      folder_id: folderId ?? null,
    };
    upsertDocument(newDoc);
    router.push(`/editor?doc=${id}`);
    // 바로 이름 수정 모드로 진입
    setTimeout(() => {
      setRenaming(id);
      setTimeout(() => renameRef.current?.focus(), 50);
    }, 80);
  }

  function handleDelete(docId: string) {
    deleteDocument(docId);
    reorderEpisodes();
    setContextMenu(null);
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
    upsertDocument({ ...doc, title: title.trim() });
    setRenaming(null);
  }

  // ── 폴더 액션 ──────────────────────────────────────────────────────────────

  function confirmAddFolder(title: string) {
    const t = title.trim();
    addFolder(t || "새 폴더");
    setAddingFolder(false);
    setNewFolderTitle("");
  }

  function commitFolderRename(folder: DocFolder, title: string) {
    updateFolder({ ...folder, title: title.trim() || folder.title });
    setRenamingFolder(null);
  }

  function handleDeleteFolder(folderId: string) {
    deleteFolder(folderId);
    setFolderContextMenu(null);
  }

  function handleMoveDoc(docId: string, folderId: string | null) {
    moveDocToFolder(docId, folderId);
    setContextMenu(null);
    setMovingDocId(null);
  }

  // 드래그 앤 드롭
  function onDocDragStart(e: React.DragEvent, docId: string) {
    dragDocId.current = docId;
    e.dataTransfer.effectAllowed = "move";
  }

  function onFolderDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    if (dragDocId.current) {
      moveDocToFolder(dragDocId.current, folderId);
      dragDocId.current = null;
    }
  }

  // ── 파일 불러오기 ──────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportLoading(true);
    try {
      const result = await importFile(file);
      setImportPending(result);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImportLoading(false);
    }
  }

  async function handleFolderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = "";
    setImportLoading(true);
    try {
      const result = await importFolder(files);
      setImportPending(result);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImportLoading(false);
    }
  }

  function handleImportConfirm(docs: ImportedDoc[]) {
    const firstId = batchImport(docs);
    setImportPending(null);
    if (firstId) router.push(`/editor?doc=${firstId}`);
  }

  // ── 검색 ───────────────────────────────────────────────────────────────────

  const searchResults =
    searchQuery.trim().length >= 2
      ? sortedDocs.flatMap((doc) => {
          const text = doc.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const q = searchQuery.trim().toLowerCase();
          const idx = text.toLowerCase().indexOf(q);
          if (idx === -1) return [];
          const start = Math.max(0, idx - 20);
          const end = Math.min(text.length, idx + q.length + 40);
          const snippet =
            (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
          return [{ doc, snippet }];
        })
      : [];

  // ── 접힌 사이드바 ──────────────────────────────────────────────────────────

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

  // ── 공통 DocRow 렌더 헬퍼 ─────────────────────────────────────────────────

  function renderDoc(doc: Document, indent = false) {
    return (
      <DocRow
        key={doc.id}
        doc={doc}
        isActive={activeDocId === doc.id}
        isRenaming={renaming === doc.id}
        renameRef={renameRef}
        onCommitRename={commitRename}
        onCancelRename={() => setRenaming(null)}
        onContextMenu={(e, id) => setContextMenu({ docId: id, x: e.clientX, y: e.clientY })}
        onDragStart={onDocDragStart}
        onClick={() => router.push(`/editor?doc=${doc.id}`)}
        indent={indent}
      />
    );
  }

  return (
    <>
      {/* ── 문서 컨텍스트 메뉴 ── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#232323] border border-white/10 rounded-lg shadow-2xl py-1 min-w-36"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => { setContextMenu(null); setMovingDocId(null); }}
        >
          {(() => {
            const doc = documents.find((d) => d.id === contextMenu.docId);
            if (!doc) return null;
            return (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 transition-colors"
                  onClick={() => startRename(contextMenu.docId)}
                >
                  이름 변경
                </button>

                {/* 폴더로 이동 */}
                <div className="relative">
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 transition-colors flex items-center justify-between"
                    onMouseEnter={() => setMovingDocId(contextMenu.docId)}
                  >
                    <span>폴더로 이동</span>
                    <span className="text-white/40 text-xs">›</span>
                  </button>
                  {movingDocId === contextMenu.docId && (
                    <div className="absolute left-full top-0 ml-0.5 bg-[#232323] border border-white/10 rounded-lg shadow-2xl py-1 min-w-32 z-50">
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-white/60 hover:bg-white/8 transition-colors"
                        onClick={() => handleMoveDoc(contextMenu.docId, null)}
                      >
                        미분류
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          className={cn(
                            "w-full text-left px-3 py-1.5 text-sm hover:bg-white/8 transition-colors",
                            doc.folder_id === f.id ? "text-moneta" : "text-white/80"
                          )}
                          onClick={() => handleMoveDoc(contextMenu.docId, f.id)}
                        >
                          📁 {f.title}
                        </button>
                      ))}
                      {folders.length === 0 && (
                        <span className="px-3 py-1.5 text-xs text-white/30 block">폴더 없음</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/8 my-0.5" />
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => handleDelete(contextMenu.docId)}
                >
                  삭제
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* ── 폴더 컨텍스트 메뉴 ── */}
      {folderContextMenu && (
        <div
          className="fixed z-50 bg-[#232323] border border-white/10 rounded-lg shadow-2xl py-1 min-w-36"
          style={{ top: folderContextMenu.y, left: folderContextMenu.x }}
          onMouseLeave={() => setFolderContextMenu(null)}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 transition-colors"
            onClick={() => {
              setRenamingFolder(folderContextMenu.folderId);
              setFolderContextMenu(null);
              setTimeout(() => folderRenameRef.current?.focus(), 50);
            }}
          >
            이름 변경
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 transition-colors"
            onClick={() => {
              addDocument(folderContextMenu.folderId);
              setFolderContextMenu(null);
            }}
          >
            회차 추가
          </button>
          <div className="border-t border-white/8 my-0.5" />
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={() => handleDeleteFolder(folderContextMenu.folderId)}
          >
            폴더 삭제
          </button>
        </div>
      )}

      {/* ── 파일 불러오기 숨겨진 입력 ── */}
      <input
        ref={fileRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={folderRef}
        type="file"
        // @ts-expect-error webkitdirectory is not in React's HTMLInputElement types
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleFolderChange}
      />

      {/* ── 파일 가져오기 모달 ── */}
      {importPending && (
        <ImportModal
          docs={importPending.docs}
          warnings={importPending.warnings}
          onConfirm={handleImportConfirm}
          onClose={() => setImportPending(null)}
        />
      )}

      {/* ── 사이드바 본체 ── */}
      <aside className="w-56 bg-notion-sidebar flex flex-col flex-shrink-0 select-none">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8">
          <Link href="/" className="flex items-center gap-2 group min-w-0">
            <div className="w-5 h-5 rounded bg-moneta flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              M
            </div>
            <span className="text-white/90 font-semibold text-sm truncate">
              {displayName}
            </span>
          </Link>
          <button
            onClick={toggleSidebar}
            className="text-white/30 hover:text-white/70 transition-colors text-xs flex-shrink-0 ml-1"
          >
            ◀
          </button>
        </div>

        {/* 검색창 */}
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center gap-1.5 bg-white/6 rounded-md px-2.5 py-1.5">
            <span className="text-white/30 text-xs flex-shrink-0">🔍</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색..."
              className="flex-1 bg-transparent outline-none text-white/80 placeholder:text-white/25 text-xs"
              onKeyDown={(e) => { if (e.key === "Escape") setSearchQuery(""); }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-white/25 hover:text-white/60 text-xs leading-none">
                ×
              </button>
            )}
          </div>
        </div>

        {/* 본문 목록 */}
        <div className="flex-1 overflow-y-auto py-1 px-2">

          {/* 검색 결과 */}
          {searchQuery.trim().length >= 2 && (
            <div className="mb-2">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-white/30 text-[10px] uppercase tracking-widest">검색 결과</span>
                <span className="text-white/25 text-[10px]">{searchResults.length}건</span>
              </div>
              {searchResults.length === 0 ? (
                <p className="px-2 py-2 text-white/25 text-xs">결과 없음</p>
              ) : (
                searchResults.map(({ doc, snippet }) => (
                  <div
                    key={doc.id}
                    onClick={() => { router.push(`/editor?doc=${doc.id}`); setSearchQuery(""); }}
                    className="px-2 py-1.5 rounded cursor-pointer hover:bg-white/8 transition-colors mb-0.5"
                  >
                    <div className="text-white/80 text-xs font-medium mb-0.5 truncate">
                      {doc.episode_no} · {doc.title || "제목 없음"}
                    </div>
                    <div className="text-white/35 text-[10px] leading-relaxed line-clamp-2">{snippet}</div>
                  </div>
                ))
              )}
              <div className="border-t border-white/8 mt-2 mb-2" />
            </div>
          )}

          {/* 집필 섹션 헤더 */}
          <div className="flex items-center justify-between px-2 mb-1 mt-1">
            <span className="text-white/30 text-[10px] uppercase tracking-widest font-medium">집필</span>
            <div className="relative">
              {/* 추가 드롭다운 트리거 */}
              <button
                onClick={() => setAddMenuOpen((v) => !v)}
                className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none"
                title="추가"
              >
                {importLoading ? (
                  <span className="text-xs animate-pulse">…</span>
                ) : "+"}
              </button>

              {/* 드롭다운 메뉴 */}
              {addMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-44 bg-[#232323] border border-white/10 rounded-lg shadow-2xl py-1 z-50"
                  onMouseLeave={() => setAddMenuOpen(false)}
                >
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 transition-colors flex items-center gap-2"
                    onClick={() => { addDocument(); setAddMenuOpen(false); }}
                  >
                    <span className="text-xs">📄</span> 새 회차
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 transition-colors flex items-center gap-2"
                    onClick={() => {
                      setAddingFolder(true);
                      setAddMenuOpen(false);
                      setTimeout(() => folderInputRef.current?.focus(), 50);
                    }}
                  >
                    <span className="text-xs">📁</span> 새 폴더
                  </button>
                  <div className="border-t border-white/8 my-0.5" />
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 transition-colors flex items-center gap-2"
                    onClick={() => { fileRef.current?.click(); setAddMenuOpen(false); }}
                  >
                    <span className="text-xs">📥</span> 파일 불러오기
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 transition-colors flex items-center gap-2"
                    onClick={() => { folderRef.current?.click(); setAddMenuOpen(false); }}
                  >
                    <span className="text-xs">📂</span> 폴더째로 불러오기
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 새 폴더 입력 */}
          {addingFolder && (
            <div className="mb-1 px-1">
              <div className="flex items-center gap-1.5 bg-white/8 rounded px-2 py-1">
                <span className="text-white/40 text-xs">📁</span>
                <input
                  ref={folderInputRef}
                  value={newFolderTitle}
                  onChange={(e) => setNewFolderTitle(e.target.value)}
                  placeholder="폴더 이름..."
                  className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-white/25"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAddFolder(newFolderTitle);
                    if (e.key === "Escape") { setAddingFolder(false); setNewFolderTitle(""); }
                  }}
                  onBlur={() => setTimeout(() => { setAddingFolder(false); setNewFolderTitle(""); }, 150)}
                />
              </div>
            </div>
          )}

          {/* 미분류 문서 */}
          {ungroupedDocs.map((doc) => renderDoc(doc, false))}

          {/* 폴더 + 폴더 내 문서 */}
          {folders.map((folder) => {
            const folderDocs = docsInFolder(folder.id);
            return (
              <FolderRow
                key={folder.id}
                folder={folder}
                docs={folderDocs}
                activeDocId={activeDocId}
                isRenamingFolder={renamingFolder === folder.id}
                folderRenameRef={folderRenameRef}
                onCommitFolderRename={commitFolderRename}
                onToggleCollapse={() => updateFolder({ ...folder, collapsed: !folder.collapsed })}
                onFolderContextMenu={(e, id) => setFolderContextMenu({ folderId: id, x: e.clientX, y: e.clientY })}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={onFolderDrop}
              >
                {folderDocs.length === 0 ? (
                  <div className="pl-6 pr-2 py-1 text-[10px] text-white/20 italic">비어있음</div>
                ) : (
                  folderDocs.map((doc) => renderDoc(doc, true))
                )}
              </FolderRow>
            );
          })}

          {/* 빈 상태 */}
          {sortedDocs.length === 0 && !addingFolder && (
            <button
              onClick={() => addDocument()}
              className="w-full text-left px-2 py-2 text-white/25 text-xs hover:text-white/50 transition-colors rounded"
            >
              + 첫 번째 회차 추가하기
            </button>
          )}

          {/* 구분선 */}
          <div className="border-t border-white/8 my-3" />

          {/* 도구 메뉴 */}
          <div className="space-y-0.5">
            <span className="px-2 text-white/30 text-[10px] uppercase tracking-widest font-medium block mb-1">
              도구
            </span>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
                  pathname === item.href
                    ? "bg-white/15 text-white"
                    : "text-white/55 hover:bg-white/8 hover:text-white/90"
                )}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* 푸터 */}
        <div className="border-t border-white/8 px-3 py-2.5 flex items-center gap-2">
          <button
            onClick={toggleDarkMode}
            className="text-white/35 hover:text-white/70 transition-colors text-sm"
            title={darkMode ? "라이트 모드" : "다크 모드"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </aside>
    </>
  );
}
