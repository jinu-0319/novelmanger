"use client";

import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import TextStyle from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { useStore } from "@/store/useStore";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useWikiExtract } from "@/hooks/useWikiExtract";
import type { Document } from "@/types";

// ── FontSize 커스텀 Extension ──────────────────────────────────────────────
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: () => { setMark: (name: string, attrs: Record<string, unknown>) => { run: () => boolean } } }) =>
        chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => { setMark: (name: string, attrs: Record<string, unknown>) => { run: () => boolean } } }) =>
        chain().setMark("textStyle", { fontSize: null }).run(),
    } as never;
  },
});

// ── LetterSpacing 커스텀 Extension ────────────────────────────────────────
const LetterSpacing = Extension.create({
  name: "letterSpacing",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        letterSpacing: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.letterSpacing || null,
          renderHTML: (attrs) => attrs.letterSpacing ? { style: `letter-spacing: ${attrs.letterSpacing}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setLetterSpacing: (spacing: string) => ({ chain }: { chain: () => { setMark: (name: string, attrs: Record<string, unknown>) => { run: () => boolean } } }) =>
        chain().setMark("textStyle", { letterSpacing: spacing }).run(),
    } as never;
  },
});

// ── 상수 ──────────────────────────────────────────────────────────────────

const FONTS = [
  { label: "나눔고딕",   value: "'Nanum Gothic', sans-serif" },
  { label: "나눔명조",   value: "'Nanum Myeongjo', serif" },
  { label: "고딕 A1",    value: "'Gothic A1', sans-serif" },
  { label: "본명조",     value: "'Noto Serif KR', serif" },
  { label: "Noto Sans",  value: "'Noto Sans KR', sans-serif" },
];
const DEFAULT_FONT = FONTS[0];

const FONT_SIZES = ["10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48"];
const DEFAULT_FONT_SIZE = "16";

const LETTER_SPACINGS = [
  { label: "기본", value: "0em" },
  { label: "좁게", value: "-0.05em" },
  { label: "보통", value: "0.05em" },
  { label: "넓게", value: "0.1em" },
  { label: "매우 넓게", value: "0.2em" },
];

const TEXT_COLORS = [
  "#000000", "#374151", "#6B7280", "#9CA3AF",
  "#EF4444", "#F97316", "#EAB308", "#22C55E",
  "#3B82F6", "#8B5CF6", "#EC4899", "#06B6D4",
  "#7C3AED", "#DC2626", "#16A34A", "#1D4ED8",
];

// 소설 창작에 자주 쓰이는 특수문자
const SPECIAL_CHARS = [
  // 따옴표·괄호류
  { group: "따옴표·괄호", chars: ["「", "」", "『", "』", "〔", "〕", "【", "】", "《", "》", "〈", "〉", "❝", "❞", "❛", "❜"] },
  // 구두점
  { group: "구두점", chars: ["…", "—", "–", "·", "•", "※", "☞", "‼", "⁉", "？", "！", "～", "〜", "∼"] },
  // 화살표·기호
  { group: "기호", chars: ["→", "←", "↑", "↓", "↔", "⇒", "⇐", "★", "☆", "♥", "♡", "◆", "◇", "▶", "◀"] },
  // 숫자·수학
  { group: "수학·단위", chars: ["①", "②", "③", "④", "⑤", "℃", "℉", "㎞", "㎡", "㎢", "㎏", "±", "×", "÷", "≒", "≠"] },
];

// ── 저장 인디케이터 ──────────────────────────────────────────────────────
function SaveIndicator() {
  const status = useStore((s) => s.saveStatus);
  if (status === "idle") return null;
  return (
    <span className={`text-xs ${
      status === "saving" ? "text-notion-text-secondary"
      : status === "saved" ? "text-green-500"
      : "text-red-400"
    }`}>
      {status === "saving" && "저장 중..."}
      {status === "saved"  && "✓ 저장됨"}
      {status === "error"  && "저장 실패"}
    </span>
  );
}

// ── 목표 글자수 ──────────────────────────────────────────────────────────
function GoalBadge({ current, goal, onSetGoal }: {
  current: number; goal: number | null; onSetGoal: (n: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  function commit() {
    const n = parseInt(input.replace(/,/g, ""), 10);
    onSetGoal(isNaN(n) || n <= 0 ? null : n);
    setEditing(false);
  }
  if (editing) return (
    <input autoFocus value={input} onChange={(e) => setInput(e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      placeholder="목표 글자수" className="w-24 text-xs border border-notion-border rounded px-2 py-0.5 outline-none focus:border-moneta" />
  );
  if (!goal) return (
    <button onClick={() => { setInput(""); setEditing(true); }}
      className="text-xs text-notion-text-secondary hover:text-moneta transition-colors whitespace-nowrap">
      + 목표 설정
    </button>
  );
  const pct = Math.min(100, Math.round((current / goal) * 100));
  const barColor = pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-moneta" : "bg-moneta/40";
  return (
    <button onClick={() => { setInput(String(goal)); setEditing(true); }}
      className="flex items-center gap-1.5 group" title="목표 수정">
      <div className="w-16 h-1.5 bg-notion-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-notion-text-secondary group-hover:text-moneta transition-colors whitespace-nowrap">
        {pct}% / {goal.toLocaleString()}자
      </span>
    </button>
  );
}

// ── 공용 툴바 버튼 ────────────────────────────────────────────────────────
function ToolBtn({ label, title, active, onClick }: {
  label: React.ReactNode; title?: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button onMouseDown={(e) => { e.preventDefault(); onClick(); }} title={title}
      className={`px-2 py-1 rounded text-sm leading-none transition-colors select-none flex-shrink-0 ${
        active ? "bg-notion-text text-white" : "text-notion-text hover:bg-notion-bg-secondary"
      }`}>
      {label}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-notion-border mx-0.5 flex-shrink-0" />;
}

// ── 드롭다운 래퍼 ─────────────────────────────────────────────────────────
function DropDown({ trigger, children, open, onToggle }: {
  trigger: React.ReactNode; children: React.ReactNode; open: boolean; onToggle: () => void;
}) {
  return (
    <div className="relative flex-shrink-0">
      <button onMouseDown={(e) => { e.preventDefault(); onToggle(); }}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-notion-text hover:bg-notion-bg-secondary transition-colors">
        {trigger}
        <span className="text-notion-text-secondary text-[10px]">▾</span>
      </button>
      {open && children}
    </div>
  );
}

// ── 특수문자 팝업 ─────────────────────────────────────────────────────────
function SpecialCharPanel({ onInsert, onClose }: { onInsert: (ch: string) => void; onClose: () => void; }) {
  return (
    <div className="absolute top-full left-0 mt-1 bg-notion-bg border border-notion-border rounded-xl shadow-2xl z-50 p-3 w-72"
      onMouseLeave={onClose}>
      {SPECIAL_CHARS.map((group) => (
        <div key={group.group} className="mb-2 last:mb-0">
          <div className="text-[10px] text-notion-text-secondary font-medium mb-1 px-1">{group.group}</div>
          <div className="flex flex-wrap gap-0.5">
            {group.chars.map((ch) => (
              <button key={ch} onMouseDown={(e) => { e.preventDefault(); onInsert(ch); }}
                className="w-7 h-7 flex items-center justify-center text-sm rounded hover:bg-notion-bg-secondary transition-colors"
                title={ch}>
                {ch}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 텍스트 색상 팝업 ──────────────────────────────────────────────────────
function ColorPanel({ current, onSelect, onClose }: {
  current: string; onSelect: (color: string) => void; onClose: () => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-1 bg-notion-bg border border-notion-border rounded-xl shadow-2xl z-50 p-3 w-48"
      onMouseLeave={onClose}>
      <div className="text-[10px] text-notion-text-secondary font-medium mb-2">글자 색상</div>
      <div className="grid grid-cols-8 gap-1 mb-2">
        {TEXT_COLORS.map((color) => (
          <button key={color} onMouseDown={(e) => { e.preventDefault(); onSelect(color); }}
            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${current === color ? "border-notion-text scale-110 ring-1 ring-notion-text" : "border-transparent"}`}
            style={{ backgroundColor: color }} title={color} />
        ))}
      </div>
      {/* 자유 색상 입력 */}
      <div className="flex items-center gap-2 mt-1">
        <input type="color" defaultValue={current || "#000000"}
          onChange={(e) => onSelect(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-notion-border" />
        <span className="text-xs text-notion-text-secondary">직접 선택</span>
      </div>
    </div>
  );
}

// ── 표 삽입 팝업 ──────────────────────────────────────────────────────────
function TablePanel({ onInsert, onClose }: {
  onInsert: (rows: number, cols: number) => void; onClose: () => void;
}) {
  const [hovered, setHovered] = useState<[number, number]>([0, 0]);
  const MAX = 6;
  return (
    <div className="absolute top-full left-0 mt-1 bg-notion-bg border border-notion-border rounded-xl shadow-2xl z-50 p-3"
      onMouseLeave={() => { setHovered([0, 0]); onClose(); }}>
      <div className="text-[10px] text-notion-text-secondary font-medium mb-2">
        {hovered[0] > 0 ? `${hovered[0]} × ${hovered[1]} 표` : "표 크기 선택"}
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${MAX}, 1fr)` }}>
        {Array.from({ length: MAX }).map((_, r) =>
          Array.from({ length: MAX }).map((_, c) => {
            const on = r < hovered[0] && c < hovered[1];
            return (
              <button key={`${r}-${c}`}
                onMouseEnter={() => setHovered([r + 1, c + 1])}
                onMouseDown={(e) => { e.preventDefault(); onInsert(r + 1, c + 1); }}
                className={`w-5 h-5 border rounded-sm transition-colors ${on ? "bg-moneta/20 border-moneta" : "border-notion-border hover:border-notion-text-secondary"}`} />
            );
          })
        )}
      </div>
    </div>
  );
}

// ── 이미지 삽입 팝업 ─────────────────────────────────────────────────────
function ImagePanel({ onInsert, onClose }: {
  onInsert: (src: string, alt?: string) => void; onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (src) { onInsert(src, file.name); onClose(); }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="absolute top-full left-0 mt-1 bg-notion-bg border border-notion-border rounded-xl shadow-2xl z-50 p-3 w-64"
      onMouseLeave={onClose}>
      <div className="text-[10px] text-notion-text-secondary font-medium mb-2">이미지 삽입</div>

      {/* URL 입력 */}
      <div className="flex gap-1 mb-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && url) { onInsert(url, alt); onClose(); } }}
          placeholder="이미지 URL 입력" className="flex-1 text-xs border border-notion-border bg-notion-bg-secondary text-notion-text rounded-lg px-2 py-1.5 outline-none focus:border-moneta placeholder:text-notion-text-secondary" />
        <button onMouseDown={(e) => { e.preventDefault(); if (url) { onInsert(url, alt); onClose(); } }}
          className="px-2 py-1 bg-moneta text-white text-xs rounded-lg hover:bg-moneta-dark transition-colors">
          삽입
        </button>
      </div>
      <input value={alt} onChange={(e) => setAlt(e.target.value)}
        placeholder="대체 텍스트 (선택)" className="w-full text-xs border border-notion-border bg-notion-bg-secondary text-notion-text rounded-lg px-2 py-1.5 outline-none focus:border-moneta placeholder:text-notion-text-secondary mb-2" />

      {/* 파일 업로드 */}
      <div className="border-t border-notion-border pt-2">
        <button onMouseDown={(e) => { e.preventDefault(); fileRef.current?.click(); }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed border-notion-border rounded-lg text-xs text-notion-text-secondary hover:border-moneta hover:text-moneta transition-colors">
          <span>📁</span><span>로컬 파일 선택</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

// ── 에디터 ref 타입 ─────────────────────────────────────────────────────
export interface NovelEditorRef {
  setContent: (html: string) => void;
  getHTML: () => string;
  getPlainText: () => string;
}

// ── 메인 에디터 컴포넌트 ─────────────────────────────────────────────────
interface Props { doc: Document; }

const NovelEditor = forwardRef<NovelEditorRef, Props>(function NovelEditor({ doc }, ref) {
  const upsertDocument = useStore((s) => s.upsertDocument);
  const activeNovel = useStore((s) => s.getActiveNovel());
  const [title, setTitle] = useState(doc.title);
  const [pendingDoc, setPendingDoc] = useState<Partial<Document> | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  // 드롭다운 열림 상태
  const [fontOpen,       setFontOpen]       = useState(false);
  const [sizeOpen,       setSizeOpen]       = useState(false);
  const [spacingOpen,    setSpacingOpen]    = useState(false);
  const [colorOpen,      setColorOpen]      = useState(false);
  const [specialOpen,    setSpecialOpen]    = useState(false);
  const [tableOpen,      setTableOpen]      = useState(false);
  const [imageOpen,      setImageOpen]      = useState(false);

  const [font,        setFont]        = useState(DEFAULT_FONT);
  const [fontSize,    setFontSize]    = useState(DEFAULT_FONT_SIZE);
  const [letterSpacing, setLetterSpacingState] = useState(LETTER_SPACINGS[0]);
  const [textColor,   setTextColor]   = useState(TEXT_COLORS[0]);

  const loadWikiFromBackend = useStore((s) => s.loadWikiFromBackend);

  // 소설이 처음 로드될 때 백엔드 위키를 Zustand로 동기화
  useEffect(() => {
    if (activeNovel?.id) {
      loadWikiFromBackend(activeNovel.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNovel?.id]);

  const { extracting, scheduleExtract } = useWikiExtract(activeNovel?.title, activeNovel?.id);
  useAutoSave(pendingDoc, scheduleExtract);

  function closeAll() {
    setFontOpen(false); setSizeOpen(false); setSpacingOpen(false);
    setColorOpen(false); setSpecialOpen(false); setTableOpen(false); setImageOpen(false);
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "이야기를 써내려 가세요..." }),
      CharacterCount,
      Underline,
      Highlight.configure({ multicolor: false }),
      Typography,
      TextStyle,
      FontFamily.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Color,
      FontSize,
      LetterSpacing,
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: doc.content,
    editorProps: {
      attributes: {
        class: "tiptap-editor focus:outline-none",
        style: `font-family: ${font.value}; font-size: ${fontSize}px`,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setPendingDoc((prev) => ({ ...prev, ...doc, content: html }));
    },
    immediatelyRender: false,
  });

  // 폰트·사이즈 변경 시 에디터 스타일 갱신
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom as HTMLElement;
    el.style.fontFamily = font.value;
    el.style.fontSize = `${fontSize}px`;
  }, [font, fontSize, editor]);

  useImperativeHandle(ref, () => ({
    setContent: (html) => editor?.commands.setContent(html, false),
    getHTML: () => editor?.getHTML() ?? "",
    getPlainText: () => editor?.getText() ?? "",
  }));

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== doc.content) editor.commands.setContent(doc.content, false);
    setTitle(doc.title);
    // contentEditable은 React 상태 변경만으로 DOM이 갱신되지 않으므로 직접 업데이트
    if (titleRef.current) {
      titleRef.current.textContent = doc.title || "";
    }
    setPendingDoc(null);
  }, [doc.id]); // eslint-disable-line

  function handleTitleBlur() {
    const t = titleRef.current?.textContent?.trim() ?? "";
    if (t && t !== doc.title) {
      const updated = { ...doc, title: t };
      upsertDocument(updated);
      setPendingDoc(updated);
    }
  }

  // 텍스트 색상 적용
  const applyColor = useCallback((color: string) => {
    if (!editor) return;
    setTextColor(color);
    editor.chain().focus().setColor(color).run();
    setColorOpen(false);
  }, [editor]);

  // 이미지 삽입
  const insertImage = useCallback((src: string, alt?: string) => {
    editor?.chain().focus().setImage({ src, alt: alt ?? "" }).run();
  }, [editor]);

  // 표 삽입
  const insertTable = useCallback((rows: number, cols: number) => {
    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setTableOpen(false);
  }, [editor]);

  const charCount = editor?.storage.characterCount.characters() ?? 0;
  const spaces = editor?.getText().split("").filter((c) => c === " " || c === "\n").length ?? 0;
  const charNoSpace = Math.max(0, charCount - spaces);
  const alignActive = (a: string) => editor?.isActive({ textAlign: a }) ?? false;

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full" onClick={closeAll}>

      {/* ── 포맷팅 툴바 ── */}
      <div
        className="flex items-center gap-0.5 px-3 py-1.5 border-b border-notion-border bg-notion-bg flex-wrap sticky top-0 z-10"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Undo / Redo */}
        <ToolBtn label="↩" title="실행 취소 (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} />
        <ToolBtn label="↪" title="다시 실행 (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} />
        <Divider />

        {/* ── 글꼴 ── */}
        <DropDown open={fontOpen} onToggle={() => { closeAll(); setFontOpen((v) => !v); }}
          trigger={<span style={{ fontFamily: font.value }} className="text-xs min-w-[64px] text-left">{font.label}</span>}>
          <div className="absolute top-full left-0 mt-1 bg-notion-bg border border-notion-border rounded-lg shadow-2xl py-1 z-50 min-w-[130px]">
            {FONTS.map((f) => (
              <button key={f.value} onMouseDown={(e) => { e.preventDefault(); setFont(f); editor.chain().focus().setFontFamily(f.value).run(); setFontOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-notion-bg-secondary transition-colors ${font.value === f.value ? "text-moneta font-medium" : "text-notion-text"}`}
                style={{ fontFamily: f.value }}>
                {f.label}
              </button>
            ))}
          </div>
        </DropDown>

        {/* ── 글자 크기 ── */}
        <DropDown open={sizeOpen} onToggle={() => { closeAll(); setSizeOpen((v) => !v); }}
          trigger={<span className="text-xs w-8 text-center">{fontSize}</span>}>
          <div className="absolute top-full left-0 mt-1 bg-notion-bg border border-notion-border rounded-lg shadow-2xl py-1 z-50 min-w-[70px] max-h-52 overflow-y-auto">
            {FONT_SIZES.map((s) => (
              <button key={s} onMouseDown={(e) => {
                e.preventDefault();
                setFontSize(s);
                (editor.chain().focus() as unknown as { setFontSize: (s: string) => { run: () => void } }).setFontSize(`${s}px`).run();
                setSizeOpen(false);
              }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-notion-bg-secondary transition-colors ${fontSize === s ? "text-moneta font-medium" : "text-notion-text"}`}>
                {s}
              </button>
            ))}
          </div>
        </DropDown>

        {/* ── 글자 간격 ── */}
        <DropDown open={spacingOpen} onToggle={() => { closeAll(); setSpacingOpen((v) => !v); }}
          trigger={<span className="text-xs min-w-[40px] text-center">{letterSpacing.label}</span>}>
          <div className="absolute top-full left-0 mt-1 bg-notion-bg border border-notion-border rounded-lg shadow-2xl py-1 z-50 min-w-[100px]">
            {LETTER_SPACINGS.map((ls) => (
              <button key={ls.value} onMouseDown={(e) => {
                e.preventDefault();
                setLetterSpacingState(ls);
                (editor.chain().focus() as unknown as { setLetterSpacing: (s: string) => { run: () => void } }).setLetterSpacing(ls.value).run();
                setSpacingOpen(false);
              }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-notion-bg-secondary transition-colors ${letterSpacing.value === ls.value ? "text-moneta font-medium" : "text-notion-text"}`}>
                {ls.label}
              </button>
            ))}
          </div>
        </DropDown>

        <Divider />

        {/* ── 서식 ── */}
        <ToolBtn label={<b>B</b>}  title="굵게 (Ctrl+B)"   active={editor.isActive("bold")}      onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolBtn label={<i>I</i>}  title="기울임 (Ctrl+I)" active={editor.isActive("italic")}    onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolBtn label={<u>U</u>}  title="밑줄 (Ctrl+U)"   active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolBtn label={<s>S</s>}  title="취소선"           active={editor.isActive("strike")}    onClick={() => editor.chain().focus().toggleStrike().run()} />

        {/* ── 텍스트 색상 ── */}
        <div className="relative flex-shrink-0">
          <button onMouseDown={(e) => { e.preventDefault(); closeAll(); setColorOpen((v) => !v); }}
            title="글자 색상"
            className="flex flex-col items-center px-2 py-1 rounded hover:bg-notion-bg-secondary transition-colors">
            <span className="text-sm font-bold leading-none" style={{ color: textColor }}>A</span>
            <div className="w-4 h-1 rounded-full mt-0.5" style={{ backgroundColor: textColor }} />
          </button>
          {colorOpen && <ColorPanel current={textColor} onSelect={applyColor} onClose={() => setColorOpen(false)} />}
        </div>

        <Divider />

        {/* ── 정렬 ── */}
        <ToolBtn label="⬛" title="왼쪽 정렬"   active={alignActive("left")}    onClick={() => editor.chain().focus().setTextAlign("left").run()} />
        <ToolBtn label="⬜" title="가운데 정렬" active={alignActive("center")}  onClick={() => editor.chain().focus().setTextAlign("center").run()} />
        <ToolBtn label="⬛" title="오른쪽 정렬" active={alignActive("right")}   onClick={() => editor.chain().focus().setTextAlign("right").run()} />

        <Divider />

        {/* ── 목록 ── */}
        <ToolBtn label="•—" title="글머리 기호"  active={editor.isActive("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolBtn label="1—" title="번호 목록"     active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolBtn label="❝"  title="인용구"        active={editor.isActive("blockquote")}  onClick={() => editor.chain().focus().toggleBlockquote().run()} />

        <Divider />

        {/* ── 표 삽입 ── */}
        <div className="relative flex-shrink-0">
          <button onMouseDown={(e) => { e.preventDefault(); closeAll(); setTableOpen((v) => !v); }}
            title="표 삽입" className="px-2 py-1 rounded text-sm hover:bg-notion-bg-secondary transition-colors">
            ⊞
          </button>
          {tableOpen && <TablePanel onInsert={insertTable} onClose={() => setTableOpen(false)} />}
        </div>

        {/* ── 이미지 삽입 ── */}
        <div className="relative flex-shrink-0">
          <button onMouseDown={(e) => { e.preventDefault(); closeAll(); setImageOpen((v) => !v); }}
            title="이미지 삽입" className="px-2 py-1 rounded text-sm hover:bg-notion-bg-secondary transition-colors">
            🖼
          </button>
          {imageOpen && <ImagePanel onInsert={insertImage} onClose={() => setImageOpen(false)} />}
        </div>

        {/* ── 특수문자 ── */}
        <div className="relative flex-shrink-0">
          <button onMouseDown={(e) => { e.preventDefault(); closeAll(); setSpecialOpen((v) => !v); }}
            title="특수문자" className="px-2 py-1 rounded text-xs hover:bg-notion-bg-secondary transition-colors">
            Ω
          </button>
          {specialOpen && (
            <SpecialCharPanel
              onInsert={(ch) => { editor.chain().focus().insertContent(ch).run(); }}
              onClose={() => setSpecialOpen(false)}
            />
          )}
        </div>

        {/* ── 저장 상태 — 오른쪽 끝 ── */}
        <div className="ml-auto flex items-center gap-2 pl-2">
          <SaveIndicator />
        </div>
      </div>

      {/* ── 본문 영역 ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-16 py-12 max-w-[720px] mx-auto w-full">
          {/* 편집 가능 제목 */}
          <div
            ref={titleRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            className="text-[2.25rem] font-bold text-notion-text mb-10 outline-none episode-title leading-tight empty:before:content-[attr(placeholder)] empty:before:text-notion-text-secondary empty:before:font-normal"
            data-placeholder="새 문서"
            style={{ fontFamily: font.value }}
          >
            {title}
          </div>

          <EditorContent editor={editor} />
        </div>
      </div>

      {/* ── 하단 상태 바 ── */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-notion-border bg-notion-bg-secondary text-xs text-notion-text-secondary flex-shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span className="font-medium text-notion-text-secondary opacity-60">문서 표준</span>
          {extracting && (
            <span className="flex items-center gap-1 text-xs text-notion-text-secondary animate-pulse">
              <span>🧠</span>
              <span>기억 학습 중...</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <GoalBadge current={charCount} goal={goal} onSetGoal={setGoal} />
          <span className="tabular-nums">
            <span className="font-medium text-notion-text">{charCount.toLocaleString()}</span>
            {goal ? (
              <> / <span>{goal.toLocaleString()}</span> 자</>
            ) : (
              <> 자</>
            )}
            <span className="mx-2 opacity-30">|</span>
            공백 제외 <span className="font-medium text-notion-text">{charNoSpace.toLocaleString()}</span> 자
          </span>
        </div>
      </div>
    </div>
  );
});

export default NovelEditor;
