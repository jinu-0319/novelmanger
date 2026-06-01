"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { useStore } from "@/store/useStore";
import {
  getBoards,
  createBoard,
  updateBoard,
  deleteBoard,
  type PlotBoard,
  type PlotColumn,
  type PlotCard,
} from "@/lib/api";

// ── helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const CARD_COLORS = [
  "#ffffff", "#fef3c7", "#d1fae5", "#dbeafe",
  "#ede9fe", "#fce7f3", "#ffedd5", "#f1f5f9",
];

// ── Tag badge ─────────────────────────────────────────────────────────────────

function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700 font-medium">
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          className="hover:text-red-500 leading-none ml-0.5"
        >
          ×
        </button>
      )}
    </span>
  );
}

// ── Card Detail Modal ─────────────────────────────────────────────────────────

interface CardModalProps {
  card: PlotCard;
  onSave: (updated: PlotCard) => void;
  onClose: () => void;
}

function CardModal({ card, onSave, onClose }: CardModalProps) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [tags, setTags] = useState<string[]>(card.tags);
  const [tagInput, setTagInput] = useState("");
  const [color, setColor] = useState(card.color);

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  function handleSave() {
    onSave({ ...card, title, description, tags, color });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-notion-bg rounded-2xl shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div>
          <label className="text-xs text-notion-text-secondary font-medium mb-1 block">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-notion-border bg-notion-bg text-notion-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            placeholder="카드 제목"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-notion-text-secondary font-medium mb-1 block">내용</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-notion-border bg-notion-bg text-notion-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none placeholder:text-notion-text-secondary"
            rows={4}
            placeholder="장면 설명, 메모..."
          />
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs text-notion-text-secondary font-medium mb-1 block">태그</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((t) => (
              <Tag key={t} label={t} onRemove={() => setTags(tags.filter((x) => x !== t))} />
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              className="flex-1 border border-notion-border bg-notion-bg text-notion-text rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              placeholder="태그 입력 후 Enter"
            />
            <button
              onClick={addTag}
              className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-sm hover:bg-violet-200 transition-colors"
            >
              추가
            </button>
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="text-xs text-notion-text-secondary font-medium mb-1 block">카드 색상</label>
          <div className="flex gap-2 flex-wrap">
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  color === c ? "border-violet-500 scale-110" : "border-notion-border hover:border-gray-400"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-notion-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-notion-text-secondary hover:text-notion-text transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  card: PlotCard;
  columnId: string;
  onUpdate: (card: PlotCard) => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent, cardId: string, fromColumnId: string) => void;
}

function KanbanCard({ card, columnId, onUpdate, onDelete, onDragStart }: CardProps) {
  const [showModal, setShowModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, card.id, columnId)}
        className="group rounded-xl border border-notion-border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all"
        style={{ backgroundColor: card.color || "#ffffff" }}
      >
        {/* Card header */}
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span
            className="text-sm font-semibold text-notion-text flex-1 cursor-pointer hover:text-violet-700 leading-snug"
            onClick={() => setShowModal(true)}
          >
            {card.title || "제목 없음"}
          </span>
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="opacity-0 group-hover:opacity-100 text-notion-text-secondary hover:text-notion-text text-base leading-none transition-opacity px-0.5"
            >
              ···
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-5 z-10 bg-notion-bg border border-notion-border rounded-lg shadow-lg py-1 min-w-28"
                onMouseLeave={() => setShowMenu(false)}
              >
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-notion-bg-secondary"
                  onClick={() => { setShowModal(true); setShowMenu(false); }}
                >
                  편집
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
                  onClick={() => { onDelete(); setShowMenu(false); }}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Description preview */}
        {card.description && (
          <p className="text-xs text-notion-text-secondary mb-2 line-clamp-2 leading-relaxed">
            {card.description}
          </p>
        )}

        {/* Tags */}
        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.tags.slice(0, 3).map((t) => (
              <Tag key={t} label={t} />
            ))}
            {card.tags.length > 3 && (
              <span className="text-xs text-notion-text-secondary">+{card.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <CardModal
          card={card}
          onSave={onUpdate}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

interface ColumnProps {
  column: PlotColumn;
  onUpdate: (col: PlotColumn) => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent, cardId: string, fromColumnId: string) => void;
  onDrop: (e: React.DragEvent, toColumnId: string) => void;
}

function KanbanColumn({ column, onUpdate, onDelete, onDragStart, onDrop }: ColumnProps) {
  const [editTitle, setEditTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(column.title);
  const [dragOver, setDragOver] = useState(false);

  function addCard() {
    const card: PlotCard = {
      id: uid(),
      title: "새 파트",
      description: "",
      tags: [],
      doc_ids: [],
      character_ids: [],
      color: "#ffffff",
    };
    onUpdate({ ...column, cards: [...column.cards, card] });
  }

  function updateCard(updated: PlotCard) {
    onUpdate({
      ...column,
      cards: column.cards.map((c) => (c.id === updated.id ? updated : c)),
    });
  }

  function deleteCard(cardId: string) {
    onUpdate({ ...column, cards: column.cards.filter((c) => c.id !== cardId) });
  }

  function commitTitle() {
    const t = titleValue.trim() || column.title;
    onUpdate({ ...column, title: t });
    setEditTitle(false);
  }

  return (
    <div
      className={`flex-shrink-0 w-64 flex flex-col rounded-2xl bg-notion-bg-secondary border ${
        dragOver ? "border-violet-400 bg-violet-50" : "border-notion-border"
      } transition-colors`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); onDrop(e, column.id); }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border">
        {editTitle ? (
          <input
            autoFocus
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditTitle(false); }}
            className="flex-1 bg-notion-bg border border-violet-300 rounded px-2 py-0.5 text-sm font-semibold focus:outline-none"
          />
        ) : (
          <span
            className="text-sm font-bold text-notion-text cursor-pointer hover:text-violet-700 transition-colors flex-1"
            onDoubleClick={() => setEditTitle(true)}
          >
            {column.title}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-xs text-notion-text-secondary bg-notion-border px-1.5 py-0.5 rounded-full">
            {column.cards.length}
          </span>
          <button
            onClick={onDelete}
            className="text-notion-text-secondary hover:text-red-400 transition-colors text-sm leading-none"
            title="막 삭제"
          >
            ×
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[100px]">
        {column.cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            columnId={column.id}
            onUpdate={updateCard}
            onDelete={() => deleteCard(card.id)}
            onDragStart={onDragStart}
          />
        ))}
        {column.cards.length === 0 && (
          <div className="text-center text-xs text-notion-text-secondary py-6">
            카드를 드래그하거나<br />아래 버튼으로 추가
          </div>
        )}
      </div>

      {/* Add card */}
      <div className="px-3 pb-3">
        <button
          onClick={addCard}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm text-notion-text-secondary hover:text-violet-600 hover:bg-violet-50 border border-dashed border-notion-border hover:border-violet-300 transition-all"
        >
          <span className="text-base leading-none">+</span>
          <span>새 파트 카드</span>
        </button>
      </div>
    </div>
  );
}

// ── Main PlotContent ──────────────────────────────────────────────────────────

function PlotContent() {
  const activeNovelId = useStore((s) => s.activeNovelId);

  const [boards, setBoards] = useState<PlotBoard[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [showNewBoard, setShowNewBoard] = useState(false);

  // Drag state
  const dragCard = useRef<{ cardId: string; fromColumnId: string } | null>(null);

  // Save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

  // ── Load boards on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeNovelId) { setLoading(false); return; }
    setLoading(true);
    getBoards(activeNovelId).then((data) => {
      setBoards(data);
      if (data.length > 0) setActiveBoardId(data[0].id);
      setLoading(false);
    });
  }, [activeNovelId]);

  // ── Auto-save on board change ─────────────────────────────────────────────
  const scheduleSave = useCallback(
    (board: PlotBoard) => {
      if (!activeNovelId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        try {
          await updateBoard(activeNovelId, board.id, {
            title: board.title,
            columns: board.columns,
          });
        } catch {
          /* silent */
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    [activeNovelId]
  );

  // ── Board mutations ───────────────────────────────────────────────────────

  function updateActiveBoard(updated: PlotBoard) {
    setBoards((prev) =>
      prev.map((b) => (b.id === updated.id ? updated : b))
    );
    scheduleSave(updated);
  }

  async function handleCreateBoard() {
    const title = newBoardTitle.trim() || "새 보드";
    if (!activeNovelId) return;
    const created = await createBoard(activeNovelId, { title, columns: [] });
    if (created) {
      setBoards((prev) => [...prev, created]);
      setActiveBoardId(created.id);
    }
    setNewBoardTitle("");
    setShowNewBoard(false);
  }

  async function handleDeleteBoard(boardId: string) {
    if (!activeNovelId) return;
    if (!confirm("이 보드를 삭제할까요?")) return;
    await deleteBoard(activeNovelId, boardId);
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    if (activeBoardId === boardId) {
      const remaining = boards.filter((b) => b.id !== boardId);
      setActiveBoardId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  // ── Column mutations ──────────────────────────────────────────────────────

  function addColumn() {
    if (!activeBoard) return;
    const colCount = activeBoard.columns.length;
    const col: PlotColumn = {
      id: uid(),
      title: `${colCount + 1}막`,
      cards: [],
    };
    updateActiveBoard({ ...activeBoard, columns: [...activeBoard.columns, col] });
  }

  function updateColumn(updated: PlotColumn) {
    if (!activeBoard) return;
    updateActiveBoard({
      ...activeBoard,
      columns: activeBoard.columns.map((c) => (c.id === updated.id ? updated : c)),
    });
  }

  function deleteColumn(colId: string) {
    if (!activeBoard) return;
    updateActiveBoard({
      ...activeBoard,
      columns: activeBoard.columns.filter((c) => c.id !== colId),
    });
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  function handleDragStart(
    e: React.DragEvent,
    cardId: string,
    fromColumnId: string
  ) {
    dragCard.current = { cardId, fromColumnId };
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, toColumnId: string) {
    e.preventDefault();
    if (!dragCard.current || !activeBoard) return;
    const { cardId, fromColumnId } = dragCard.current;
    if (fromColumnId === toColumnId) return;

    // Find card
    const fromCol = activeBoard.columns.find((c) => c.id === fromColumnId);
    if (!fromCol) return;
    const card = fromCol.cards.find((c) => c.id === cardId);
    if (!card) return;

    const newColumns = activeBoard.columns.map((col) => {
      if (col.id === fromColumnId) {
        return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
      }
      if (col.id === toColumnId) {
        return { ...col, cards: [...col.cards, card] };
      }
      return col;
    });

    updateActiveBoard({ ...activeBoard, columns: newColumns });
    dragCard.current = null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!activeNovelId) {
    return (
      <div className="flex-1 flex items-center justify-center text-notion-text-secondary text-sm">
        먼저 소설을 선택해주세요.
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel: board list */}
      <aside className="w-52 flex-shrink-0 border-r border-notion-border bg-notion-bg-secondary flex flex-col">
        <div className="px-4 py-4 border-b border-notion-border">
          <h2 className="font-bold text-notion-text text-sm">플롯 보드</h2>
          <p className="text-xs text-notion-text-secondary mt-0.5">보드를 선택하거나 추가하세요</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {loading ? (
            <div className="text-center text-xs text-notion-text-secondary py-8">불러오는 중...</div>
          ) : boards.length === 0 ? (
            <div className="text-center text-xs text-notion-text-secondary py-8">
              보드가 없습니다.<br />아래에서 추가해보세요.
            </div>
          ) : (
            boards.map((board) => (
              <div
                key={board.id}
                className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors text-sm ${
                  activeBoardId === board.id
                    ? "bg-violet-100 text-violet-800 font-semibold"
                    : "text-notion-text-secondary hover:bg-notion-border"
                }`}
                onClick={() => setActiveBoardId(board.id)}
              >
                <span className="text-base leading-none">📋</span>
                <span className="flex-1 truncate">{board.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteBoard(board.id); }}
                  className="opacity-0 group-hover:opacity-100 text-notion-text-secondary hover:text-red-400 text-xs transition-all leading-none"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        {/* New board */}
        <div className="p-3 border-t border-notion-border">
          {showNewBoard ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); if (e.key === "Escape") setShowNewBoard(false); }}
                placeholder="보드 제목"
                className="w-full border border-notion-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateBoard}
                  className="flex-1 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                >
                  추가
                </button>
                <button
                  onClick={() => setShowNewBoard(false)}
                  className="px-2 py-1.5 text-xs text-notion-text-secondary hover:text-notion-text transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewBoard(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs text-notion-text-secondary hover:text-violet-600 hover:bg-violet-50 border border-dashed border-notion-border hover:border-violet-300 transition-all"
            >
              <span className="text-sm leading-none">+</span>
              <span>새 보드</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main kanban area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeBoard ? (
          <>
            {/* Board header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-notion-border bg-notion-bg flex-shrink-0">
              <div>
                <h1 className="font-bold text-notion-text text-lg">{activeBoard.title}</h1>
                <p className="text-xs text-notion-text-secondary mt-0.5">
                  {activeBoard.columns.length}개 막 ·{" "}
                  {activeBoard.columns.reduce((s, c) => s + c.cards.length, 0)}개 파트
                </p>
              </div>
              <div className="flex items-center gap-3">
                {saving && (
                  <span className="text-xs text-notion-text-secondary animate-pulse">저장 중...</span>
                )}
                <button
                  onClick={addColumn}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm rounded-xl hover:bg-violet-700 transition-colors"
                >
                  <span>+</span>
                  <span>막 추가</span>
                </button>
              </div>
            </div>

            {/* Columns */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-4 p-6 h-full">
                {activeBoard.columns.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    column={col}
                    onUpdate={updateColumn}
                    onDelete={() => deleteColumn(col.id)}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                  />
                ))}

                {/* Add column placeholder */}
                <div
                  onClick={addColumn}
                  className="flex-shrink-0 w-64 rounded-2xl border-2 border-dashed border-notion-border flex items-center justify-center cursor-pointer hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all text-notion-text-secondary hover:text-violet-600"
                  style={{ minHeight: 200 }}
                >
                  <div className="text-center">
                    <div className="text-3xl mb-2">+</div>
                    <div className="text-sm font-medium">새 막 추가</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-notion-text-secondary">
              <div className="text-5xl mb-4">📋</div>
              <p className="text-sm font-medium">
                {boards.length === 0
                  ? "왼쪽에서 첫 번째 플롯 보드를 만들어보세요."
                  : "보드를 선택해주세요."}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

function PlotPage() {
  return (
    <div className="flex h-screen bg-notion-bg overflow-hidden">
      <Sidebar />
      <PlotContent />
    </div>
  );
}

export default function PlotPageWrapper() {
  return (
    <Suspense>
      <PlotPage />
    </Suspense>
  );
}
