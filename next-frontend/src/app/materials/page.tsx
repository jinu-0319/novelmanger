"use client";

import { useState, useRef } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { saveMaterial, deleteMaterial } from "@/lib/api";
import type { Material } from "@/types";

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAdd() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const id = await saveMaterial({ title, content, type: "text" });
      setMaterials((prev) => [
        ...prev,
        { id, title, content, type: "text", created_at: new Date().toISOString() },
      ]);
      setTitle("");
      setContent("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteMaterial(id);
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const id = await saveMaterial({
        title: file.name,
        content: text,
        type: "file",
        file_type: file.type,
      });
      setMaterials((prev) => [
        ...prev,
        {
          id,
          title: file.name,
          content: text,
          type: "file",
          created_at: new Date().toISOString(),
        },
      ]);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex h-screen bg-notion-bg overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-12">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-notion-text">자료실</h1>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.pdf,.docx"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 text-sm bg-notion-bg-secondary border border-notion-border rounded-lg hover:bg-notion-border transition-colors"
              >
                📄 파일 업로드
              </button>
            </div>
          </div>
          <p className="text-notion-text-secondary text-sm mb-8">
            Clio 팩트체크에 사용할 자료를 저장합니다
          </p>

          {/* Add form */}
          <div className="bg-notion-bg-secondary border border-notion-border rounded-xl p-5 mb-8">
            <h3 className="font-semibold text-sm text-notion-text mb-3">
              자료 직접 입력
            </h3>
            <input
              className="w-full text-sm bg-notion-bg border border-notion-border rounded-lg px-3 py-2 mb-2 outline-none focus:border-moneta"
              placeholder="자료 제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full text-sm bg-notion-bg border border-notion-border rounded-lg px-3 py-2.5 outline-none focus:border-moneta resize-none leading-relaxed"
              placeholder="자료 내용을 입력하세요. 역사적 사실, 참고 문헌, 고증 자료 등..."
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={handleAdd}
                disabled={saving || !title.trim() || !content.trim()}
                className="px-4 py-2 text-sm bg-clio text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {saving ? "저장 중..." : "자료 추가"}
              </button>
            </div>
          </div>

          {/* Material list */}
          {materials.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📚</div>
              <p className="text-notion-text-secondary">
                저장된 자료가 없습니다
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {materials.map((m) => (
                <div
                  key={m.id}
                  className="bg-notion-bg border border-notion-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-lg">{m.type === "file" ? "📄" : "📝"}</span>
                      <span className="font-medium text-notion-text truncate">
                        {m.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() =>
                          setExpanded((p) => (p === m.id ? null : m.id))
                        }
                        className="text-sm text-notion-text-secondary hover:text-notion-text transition-colors"
                      >
                        {expanded === m.id ? "접기" : "펼치기"}
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="text-sm text-notion-text-secondary hover:text-red-400 transition-colors ml-2"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  {expanded === m.id && (
                    <div className="mt-3 pt-3 border-t border-notion-border">
                      <pre className="text-xs text-notion-text-secondary leading-relaxed whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                        {m.content}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
