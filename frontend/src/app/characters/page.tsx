"use client";

import { Suspense } from "react";
import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/layout/Sidebar";
import CharacterCard from "@/components/characters/CharacterCard";
import {
  getNovelCharacters,
  saveNovelCharacter,
  deleteNovelCharacter,
} from "@/lib/api";
import { useStore } from "@/store/useStore";
import type { Character, WikiItem } from "@/types";

function CharactersContent() {
  const novelId = useStore((s) => s.activeNovelId);
  const upsertWikiItems = useStore((s) => s.upsertWikiItems);
  const syncWikiToBackend = useStore((s) => s.syncWikiToBackend);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newChar, setNewChar] = useState<Partial<Character>>({ name: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!novelId) { setLoading(false); return; }
    getNovelCharacters(novelId).then(setCharacters).finally(() => setLoading(false));
  }, [novelId]);

  function charToWikiItem(c: Character): WikiItem {
    const parts: string[] = [];
    if (c.role) parts.push(`역할: ${c.role}`);
    if (c.age) parts.push(`나이: ${c.age}`);
    if (c.gender) parts.push(`성별: ${c.gender}`);
    if (c.description) parts.push(c.description);
    return {
      id: `char-wiki-${c.id ?? c.name}`,
      type: "character",
      title: c.name,
      description: parts.join(" / ") || c.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async function handleAdd() {
    if (!newChar.name?.trim() || !novelId) return;
    const char: Character = {
      ...newChar as Character,
      id: newChar.id ?? `char-${Date.now()}`,
    };
    await saveNovelCharacter(novelId, char);
    upsertWikiItems([charToWikiItem(char)]);
    syncWikiToBackend(novelId);
    setCharacters((prev) => [...prev, char]);
    setNewChar({ name: "" });
    setShowAddForm(false);
  }

  async function handleUpdate(updated: Character) {
    if (!novelId) return;
    await saveNovelCharacter(novelId, updated);
    upsertWikiItems([charToWikiItem(updated)]);
    syncWikiToBackend(novelId);
    setCharacters((prev) =>
      prev.map((c) =>
        (c.id ?? c.name) === (updated.id ?? updated.name) ? updated : c
      )
    );
  }

  async function handleDelete(id: string) {
    if (!novelId) return;
    await deleteNovelCharacter(novelId, id);
    setCharacters((prev) => prev.filter((c) => (c.id ?? c.name) !== id));
  }

  // 파일 업로드는 향후 구현 (현재는 숨김)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    e.target.value = "";
  }

  return (
    <div className="flex h-screen bg-notion-bg overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-10 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-notion-text mb-1">
                등장인물
              </h1>
              <p className="text-notion-text-secondary text-sm">
                {characters.length}명의 인물이 등록되어 있습니다
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.pdf,.docx"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={false}
                className="px-4 py-2 text-sm bg-notion-bg-secondary border border-notion-border rounded-lg hover:bg-notion-border transition-colors disabled:opacity-50"
              >
                {"📄 파일에서 추출"}
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 text-sm bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors shadow-sm"
              >
                + 인물 추가
              </button>
            </div>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="bg-notion-bg-secondary border border-notion-border rounded-xl p-5 mb-6 animate-fade-in">
              <h3 className="font-semibold text-notion-text mb-4">
                새 인물 추가
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[
                  { key: "name", label: "이름 *", placeholder: "홍길동" },
                  { key: "role", label: "역할", placeholder: "주인공 / 조력자 / 악당" },
                  { key: "age", label: "나이", placeholder: "25" },
                  { key: "gender", label: "성별", placeholder: "남 / 여" },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-notion-text-secondary mb-1 block">
                      {f.label}
                    </label>
                    <input
                      className="w-full text-sm bg-notion-bg border border-notion-border rounded-lg px-3 py-2 outline-none focus:border-moneta"
                      placeholder={f.placeholder}
                      value={String(newChar[f.key as keyof Character] ?? "")}
                      onChange={(e) =>
                        setNewChar({ ...newChar, [f.key]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="mb-4">
                <label className="text-xs text-notion-text-secondary mb-1 block">
                  설명
                </label>
                <textarea
                  className="w-full text-sm bg-notion-bg border border-notion-border rounded-lg px-3 py-2 outline-none focus:border-moneta resize-none"
                  placeholder="인물에 대한 설명을 입력하세요"
                  rows={3}
                  value={newChar.description ?? ""}
                  onChange={(e) =>
                    setNewChar({ ...newChar, description: e.target.value })
                  }
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewChar({ name: "" });
                  }}
                  className="px-4 py-2 text-sm text-notion-text-secondary hover:text-notion-text transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newChar.name?.trim()}
                  className="px-4 py-2 text-sm bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors disabled:opacity-40"
                >
                  추가하기
                </button>
              </div>
            </div>
          )}

          {/* Character grid */}
          {loading ? (
            <div className="text-center py-20 text-notion-text-secondary">
              불러오는 중...
            </div>
          ) : characters.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">👥</div>
              <p className="text-notion-text-secondary mb-4">
                등록된 인물이 없습니다
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-5 py-2.5 bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors"
              >
                첫 번째 인물 추가하기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {characters.map((c, i) => (
                <CharacterCard
                  key={c.id ?? c.name ?? i}
                  character={c}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function CharactersPage() {
  return (
    <Suspense>
      <CharactersContent />
    </Suspense>
  );
}
