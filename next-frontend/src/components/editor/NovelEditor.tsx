"use client";

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { useAutoSave } from "@/hooks/useAutoSave";
import type { Document } from "@/types";

interface Props {
  doc: Document;
}

type Format =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "highlight"
  | "h1"
  | "h2"
  | "h3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "code";

function SaveIndicator() {
  const status = useStore((s) => s.saveStatus);
  if (status === "idle") return null;
  return (
    <span
      className={`text-xs transition-all ${
        status === "saving"
          ? "text-notion-text-secondary"
          : status === "saved"
          ? "text-green-500"
          : "text-red-400"
      }`}
    >
      {status === "saving" && "저장 중..."}
      {status === "saved" && "✓ 저장됨"}
      {status === "error" && "저장 실패"}
    </span>
  );
}

export default function NovelEditor({ doc }: Props) {
  const upsertDocument = useStore((s) => s.upsertDocument);
  const [title, setTitle] = useState(doc.title);
  const [pendingDoc, setPendingDoc] = useState<Partial<Document> | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useAutoSave(pendingDoc);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: "이야기를 써내려 가세요...",
      }),
      CharacterCount,
      Underline,
      Highlight.configure({ multicolor: false }),
      Typography,
    ],
    content: doc.content,
    editorProps: {
      attributes: { class: "tiptap-editor focus:outline-none" },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setPendingDoc((prev) => ({ ...prev, ...doc, content: html }));
    },
    immediatelyRender: false,
  });

  // Sync when doc changes (switching episodes)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== doc.content) {
      editor.commands.setContent(doc.content, false);
    }
    setTitle(doc.title);
    setPendingDoc(null);
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTitleBlur() {
    const t = titleRef.current?.textContent?.trim() ?? "";
    if (t && t !== doc.title) {
      const updated = { ...doc, title: t };
      upsertDocument(updated);
      setPendingDoc(updated);
    }
  }

  const charCount = editor?.storage.characterCount.characters() ?? 0;
  const charCountNoSpace = charCount - (editor?.getText().split(" ").length ?? 0) + 1;

  const toolbarItems: { label: string; format: Format; active?: () => boolean }[] = [
    {
      label: "B",
      format: "bold",
      active: () => editor?.isActive("bold") ?? false,
    },
    {
      label: "I",
      format: "italic",
      active: () => editor?.isActive("italic") ?? false,
    },
    {
      label: "U",
      format: "underline",
      active: () => editor?.isActive("underline") ?? false,
    },
    {
      label: "S",
      format: "strike",
      active: () => editor?.isActive("strike") ?? false,
    },
    {
      label: "H",
      format: "highlight",
      active: () => editor?.isActive("highlight") ?? false,
    },
  ];

  function applyFormat(format: Format) {
    if (!editor) return;
    switch (format) {
      case "bold": editor.chain().focus().toggleBold().run(); break;
      case "italic": editor.chain().focus().toggleItalic().run(); break;
      case "underline": editor.chain().focus().toggleUnderline().run(); break;
      case "strike": editor.chain().focus().toggleStrike().run(); break;
      case "highlight": editor.chain().focus().toggleHighlight().run(); break;
      case "h1": editor.chain().focus().toggleHeading({ level: 1 }).run(); break;
      case "h2": editor.chain().focus().toggleHeading({ level: 2 }).run(); break;
      case "h3": editor.chain().focus().toggleHeading({ level: 3 }).run(); break;
      case "bulletList": editor.chain().focus().toggleBulletList().run(); break;
      case "orderedList": editor.chain().focus().toggleOrderedList().run(); break;
      case "blockquote": editor.chain().focus().toggleBlockquote().run(); break;
      case "code": editor.chain().focus().toggleCode().run(); break;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Bubble menu (appears on text selection) */}
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-0.5 bg-white border border-notion-border rounded-lg shadow-lg p-1"
        >
          {toolbarItems.map((item) => (
            <button
              key={item.format}
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat(item.format);
              }}
              className={`px-2.5 py-1 rounded text-sm font-medium transition-colors ${
                item.active?.()
                  ? "bg-notion-text text-white"
                  : "hover:bg-notion-bg-secondary text-notion-text"
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="w-px h-4 bg-notion-border mx-1" />
          {["h1", "h2", "h3"].map((h) => (
            <button
              key={h}
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat(h as Format);
              }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                editor.isActive("heading", { level: parseInt(h[1]) })
                  ? "bg-notion-text text-white"
                  : "hover:bg-notion-bg-secondary text-notion-text"
              }`}
            >
              {h.toUpperCase()}
            </button>
          ))}
        </BubbleMenu>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-16 py-12 max-w-3xl mx-auto w-full">
        {/* Episode badge */}
        <div className="text-sm text-notion-text-secondary mb-4 font-medium">
          제{doc.episode_no}화
        </div>

        {/* Editable title */}
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-4xl font-bold text-notion-text mb-8 outline-none episode-title empty:before:content-[attr(placeholder)] empty:before:text-notion-text-secondary"
          placeholder="제목을 입력하세요"
        >
          {title}
        </div>

        {/* TipTap editor */}
        <EditorContent editor={editor} />
      </div>

      {/* Status bar */}
      <div className="border-t border-notion-border px-16 py-2 flex items-center justify-between bg-notion-bg">
        <div className="flex items-center gap-4 text-xs text-notion-text-secondary">
          <span>공백 포함 {charCount.toLocaleString()}자</span>
          <span>공백 제외 {Math.max(0, charCountNoSpace).toLocaleString()}자</span>
        </div>
        <SaveIndicator />
      </div>
    </div>
  );
}
