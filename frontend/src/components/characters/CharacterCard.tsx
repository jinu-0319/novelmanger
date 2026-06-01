"use client";

import { useState } from "react";
import type { Character } from "@/types";

interface Props {
  character: Character;
  onUpdate: (c: Character) => void;
  onDelete: (id: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
  주인공: "bg-purple-100 text-purple-700",
  조력자: "bg-blue-100 text-blue-700",
  악당: "bg-red-100 text-red-700",
  조연: "bg-gray-100 text-gray-600",
};

export default function CharacterCard({ character, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(character);

  function saveEdit() {
    onUpdate(draft);
    setEditing(false);
  }

  const roleColor =
    ROLE_COLORS[character.role ?? ""] ?? "bg-gray-100 text-gray-600";
  const initial = (character.name?.[0] ?? "?").toUpperCase();

  return (
    <div className="bg-notion-bg border border-notion-border rounded-xl p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-moneta-light flex items-center justify-center flex-shrink-0">
          <span className="text-moneta font-bold text-lg">{initial}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              className="text-base font-semibold text-notion-text bg-notion-bg-secondary border border-notion-border rounded px-2 py-0.5 w-full mb-1 outline-none focus:border-moneta"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          ) : (
            <h3 className="text-base font-semibold text-notion-text truncate">
              {character.name}
            </h3>
          )}

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {character.role && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${roleColor}`}>
                {character.role}
              </span>
            )}
            {character.age && (
              <span className="text-xs text-notion-text-secondary">
                {character.age}세
              </span>
            )}
            {character.gender && (
              <span className="text-xs text-notion-text-secondary">
                {character.gender}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={saveEdit}
                className="text-xs px-2 py-1 bg-moneta text-white rounded hover:bg-moneta-dark transition-colors"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setDraft(character);
                  setEditing(false);
                }}
                className="text-xs px-2 py-1 text-notion-text-secondary hover:text-notion-text transition-colors"
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setExpanded((p) => !p)}
                className="text-notion-text-secondary hover:text-notion-text transition-colors text-sm"
                title="상세보기"
              >
                {expanded ? "▲" : "▼"}
              </button>
              <button
                onClick={() => setEditing(true)}
                className="text-notion-text-secondary hover:text-notion-text transition-colors text-sm"
                title="편집"
              >
                ✏️
              </button>
              <button
                onClick={() => onDelete(character.id ?? character.name)}
                className="text-notion-text-secondary hover:text-red-400 transition-colors text-sm"
                title="삭제"
              >
                🗑
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && !editing && character.description && (
        <div className="mt-4 pt-4 border-t border-notion-border">
          <p className="text-sm text-notion-text-secondary leading-relaxed">
            {character.description}
          </p>
          {character.traits && character.traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {character.traits.map((t, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 bg-notion-bg-secondary border border-notion-border rounded-full text-notion-text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="mt-4 pt-4 border-t border-notion-border space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {["role", "age", "gender"].map((field) => (
              <div key={field}>
                <label className="text-xs text-notion-text-secondary mb-1 block">
                  {field === "role" ? "역할" : field === "age" ? "나이" : "성별"}
                </label>
                <input
                  className="w-full text-sm bg-notion-bg-secondary border border-notion-border rounded px-2 py-1 outline-none focus:border-moneta"
                  value={String(draft[field as keyof Character] ?? "")}
                  onChange={(e) =>
                    setDraft({ ...draft, [field]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-notion-text-secondary mb-1 block">
              설명
            </label>
            <textarea
              className="w-full text-sm bg-notion-bg-secondary border border-notion-border rounded px-2 py-1.5 outline-none focus:border-moneta resize-none"
              rows={3}
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
