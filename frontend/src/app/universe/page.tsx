"use client";

import { Suspense } from "react";
import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { getNovelWorld, saveNovelWorld, getNovelHistory } from "@/lib/api";
import { useStore } from "@/store/useStore";
import type { WorldSetting, StoryHistory, WikiItem } from "@/types";

type Tab = "world" | "plot";

function WorldTab() {
  const novelId = useStore((s) => s.activeNovelId);
  const upsertWikiItems = useStore((s) => s.upsertWikiItems);
  const syncWikiToBackend = useStore((s) => s.syncWikiToBackend);
  const [setting, setSetting] = useState<WorldSetting | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!novelId) { setLoading(false); return; }
    getNovelWorld(novelId).then((s) => {
      setSetting(s);
      setDraft(s?.content ?? "");
    }).finally(() => setLoading(false));
  }, [novelId]);

  async function handleSave() {
    if (!novelId) return;
    setSaving(true);
    try {
      const updated = { content: draft, summary: setting?.summary };
      await saveNovelWorld(novelId, updated);
      setSetting(updated);
      setEditing(false);

      // 세계관 설정을 위키에 반영
      if (draft.trim()) {
        const worldWikiItem: WikiItem = {
          id: `world-wiki-${novelId}`,
          type: "world",
          title: "세계관 설정",
          description: draft.trim().slice(0, 500) + (draft.trim().length > 500 ? "…" : ""),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        upsertWikiItems([worldWikiItem]);
        syncWikiToBackend(novelId);
      }
    } finally {
      setSaving(false);
    }
  }

  // 파일 업로드는 향후 구현
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    e.target.value = "";
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-notion-text-secondary">
        불러오는 중...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-notion-text">세계관 설정</h2>
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
            className="px-3 py-1.5 text-sm bg-notion-bg-secondary border border-notion-border rounded-lg hover:bg-notion-border transition-colors disabled:opacity-50"
          >
            {"📄 파일 업로드"}
          </button>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 text-sm bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors"
            >
              ✏️ 편집
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setDraft(setting?.content ?? "");
                  setEditing(false);
                }}
                className="px-3 py-1.5 text-sm text-notion-text-secondary hover:text-notion-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-sm bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </>
          )}
        </div>
      </div>

      {setting?.summary && !editing && (
        <div className="bg-moneta-light border border-purple-200 rounded-xl p-4 mb-4">
          <p className="text-xs text-moneta font-medium mb-1 uppercase tracking-wider">
            AI 요약
          </p>
          <p className="text-sm text-notion-text leading-relaxed">
            {setting.summary}
          </p>
        </div>
      )}

      {editing ? (
        <textarea
          className="w-full min-h-96 text-sm bg-notion-bg-secondary border border-notion-border rounded-xl px-4 py-3 outline-none focus:border-moneta resize-none leading-relaxed"
          placeholder="세계관을 직접 입력하거나 파일을 업로드하세요..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : setting?.content ? (
        <div className="bg-notion-bg-secondary border border-notion-border rounded-xl p-5">
          <pre className="text-sm text-notion-text leading-relaxed whitespace-pre-wrap font-sans">
            {setting.content}
          </pre>
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🌍</div>
          <p className="text-notion-text-secondary mb-4">
            아직 세계관이 등록되지 않았습니다
          </p>
          <button
            onClick={() => setEditing(true)}
            className="px-5 py-2.5 bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors"
          >
            세계관 작성하기
          </button>
        </div>
      )}
    </div>
  );
}

function PlotTab() {
  const novelId = useStore((s) => s.activeNovelId);
  const [history, setHistory] = useState<StoryHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!novelId) { setLoading(false); return; }
    getNovelHistory(novelId)
      .then((h) => setHistory(h.sort((a, b) => a.episode_no - b.episode_no)))
      .finally(() => setLoading(false));
  }, [novelId]);

  if (loading) {
    return (
      <div className="text-center py-20 text-notion-text-secondary">
        불러오는 중...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📖</div>
        <p className="text-notion-text-secondary">
          분석된 회차 요약이 없습니다. 원고를 작성하고 Story Keeper로 분석하면
          자동으로 기록됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((h) => (
        <div
          key={h.episode_no}
          className="bg-notion-bg-secondary border border-notion-border rounded-xl p-4"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs bg-keeper-light text-keeper px-2 py-0.5 rounded-full font-medium">
              제{h.episode_no}화
            </span>
            {h.title && (
              <span className="text-sm font-medium text-notion-text">
                {h.title}
              </span>
            )}
          </div>
          <p className="text-sm text-notion-text-secondary leading-relaxed">
            {h.summary}
          </p>
        </div>
      ))}
    </div>
  );
}

function UniverseContent() {
  const [tab, setTab] = useState<Tab>("world");

  return (
    <div className="flex h-screen bg-notion-bg overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-12">
          <h1 className="text-3xl font-bold text-notion-text mb-2">
            세계관 · 줄거리
          </h1>
          <p className="text-notion-text-secondary text-sm mb-8">
            작품의 세계관과 회차별 줄거리를 관리합니다
          </p>

          {/* Tabs */}
          <div className="flex gap-1 mb-8 border-b border-notion-border">
            {[
              { key: "world" as Tab, label: "🌍 세계관" },
              { key: "plot" as Tab, label: "📖 줄거리" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  tab === t.key
                    ? "border-moneta text-moneta"
                    : "border-transparent text-notion-text-secondary hover:text-notion-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "world" ? <WorldTab /> : <PlotTab />}
        </div>
      </main>
    </div>
  );
}

export default function UniversePage() {
  return (
    <Suspense>
      <UniverseContent />
    </Suspense>
  );
}
