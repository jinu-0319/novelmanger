import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Document, DocFolder, WikiItem, SaveStatus } from "@/types";

// ── 소설 프로젝트 타입 ────────────────────────────────────────────────────

export interface Novel {
  id: string;
  title: string;
  genre?: string;
  description?: string;
  cover_color: string;
  cover_image?: string;   // base64 data URL
  created_at: string;
  updated_at?: string;
}

export const COVER_COLORS = [
  "#7c3aed", "#2563eb", "#d97706", "#dc2626",
  "#16a34a", "#0891b2", "#db2777", "#65a30d",
];

// ── Store 타입 ────────────────────────────────────────────────────────────

interface Store {
  // 소설 프로젝트
  novels: Novel[];
  activeNovelId: string | null;
  addNovel: (novel: Omit<Novel, "id" | "created_at" | "cover_color">) => Novel;
  updateNovel: (id: string, updates: Partial<Novel>) => void;
  deleteNovel: (id: string) => void;
  setActiveNovel: (id: string | null) => void;
  getActiveNovel: () => Novel | null;

  // 회차 문서 (소설별로 격리: novelId → Document[])
  novelDocuments: Record<string, Document[]>;
  activeDocId: string | null;
  getDocuments: () => Document[];
  setActiveDoc: (id: string | null) => void;
  upsertDocument: (doc: Document) => void;
  deleteDocument: (id: string) => void;
  reorderEpisodes: () => void;

  // 폴더 (소설별로 격리: novelId → DocFolder[])
  novelFolders: Record<string, DocFolder[]>;
  getFolders: () => DocFolder[];
  addFolder: (title: string) => DocFolder;
  updateFolder: (folder: DocFolder) => void;
  deleteFolder: (folderId: string) => void;
  moveDocToFolder: (docId: string, folderId: string | null) => void;
  /**
   * 파일 가져오기: ImportedDoc[] 를 한꺼번에 폴더+문서로 생성.
   * folderPath가 같은 항목은 같은 폴더로 묶이며, 기존 동명 폴더가 있으면 재사용.
   * @returns 생성된 첫 번째 문서 ID (에디터 이동용)
   */
  batchImport: (docs: import("@/lib/importers").ImportedDoc[]) => string | null;

  // 장기 기억 위키 (소설별로 격리: novelId → WikiItem[])
  novelWiki: Record<string, WikiItem[]>;
  getWiki: () => WikiItem[];
  upsertWikiItems: (items: WikiItem[]) => void;
  deleteWikiItem: (id: string) => void;
  clearWiki: () => void;
  /** 백엔드 → Zustand 동기화 (소설 로드 시 호출) */
  loadWikiFromBackend: (novelId: string) => Promise<void>;
  /** Zustand → 백엔드 동기화 (위키 변경 후 호출) */
  syncWikiToBackend: (novelId: string) => Promise<void>;

  // 에디터
  saveStatus: SaveStatus;
  setSaveStatus: (s: SaveStatus) => void;

  // Moneta 패널
  monetaPanelOpen: boolean;
  toggleMonetaPanel: () => void;

  // 사이드바
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // 다크모드
  darkMode: boolean;
  toggleDarkMode: () => void;
}

// ── Store 구현 ────────────────────────────────────────────────────────────

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // ── 소설 프로젝트 ───────────────────────────────────────────────────
      novels: [],
      activeNovelId: null,

      addNovel: (data) => {
        const novel: Novel = {
          id: `novel-${Date.now()}`,
          cover_color: COVER_COLORS[get().novels.length % COVER_COLORS.length],
          created_at: new Date().toISOString(),
          ...data,
        };
        set((state) => ({ novels: [...state.novels, novel] }));
        return novel;
      },

      updateNovel: (id, updates) =>
        set((state) => ({
          novels: state.novels.map((n) => (n.id === id ? { ...n, ...updates } : n)),
        })),

      deleteNovel: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.novelDocuments;
          return {
            novels: state.novels.filter((n) => n.id !== id),
            novelDocuments: rest,
            activeNovelId: state.activeNovelId === id ? null : state.activeNovelId,
          };
        }),

      setActiveNovel: (id) => set({ activeNovelId: id, activeDocId: null }),

      getActiveNovel: () => {
        const { novels, activeNovelId } = get();
        return novels.find((n) => n.id === activeNovelId) ?? null;
      },

      // ── 회차 문서 ───────────────────────────────────────────────────────
      novelDocuments: {},
      activeDocId: null,

      getDocuments: () => {
        const { novelDocuments, activeNovelId } = get();
        return activeNovelId ? (novelDocuments[activeNovelId] ?? []) : [];
      },

      setActiveDoc: (id) => set({ activeDocId: id }),

      upsertDocument: (doc) =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          const current = state.novelDocuments[novelId] ?? [];
          const idx = current.findIndex((d) => d.id === doc.id);
          const updated =
            idx === -1
              ? [...current, doc]
              : current.map((d, i) => (i === idx ? doc : d));

          // 소설의 updated_at 갱신
          const novels = state.novels.map((n) =>
            n.id === novelId ? { ...n, updated_at: new Date().toISOString() } : n
          );
          return {
            novelDocuments: { ...state.novelDocuments, [novelId]: updated },
            novels,
          };
        }),

      deleteDocument: (id) =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          const current = state.novelDocuments[novelId] ?? [];
          return {
            novelDocuments: {
              ...state.novelDocuments,
              [novelId]: current.filter((d) => d.id !== id),
            },
            activeDocId: state.activeDocId === id ? null : state.activeDocId,
          };
        }),

      reorderEpisodes: () =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          const current = state.novelDocuments[novelId] ?? [];
          const reordered = [...current]
            .sort((a, b) => a.episode_no - b.episode_no)
            .map((d, i) => ({ ...d, episode_no: i + 1 }));
          return {
            novelDocuments: { ...state.novelDocuments, [novelId]: reordered },
          };
        }),

      // ── 폴더 ────────────────────────────────────────────────────────────────
      novelFolders: {},

      getFolders: () => {
        const { novelFolders, activeNovelId } = get();
        return activeNovelId ? (novelFolders[activeNovelId] ?? []) : [];
      },

      addFolder: (title) => {
        const novelId = get().activeNovelId;
        const folder: DocFolder = {
          id: `folder-${Date.now()}`,
          title: title.trim() || "새 폴더",
          collapsed: false,
        };
        if (novelId) {
          set((state) => ({
            novelFolders: {
              ...state.novelFolders,
              [novelId]: [...(state.novelFolders[novelId] ?? []), folder],
            },
          }));
        }
        return folder;
      },

      updateFolder: (folder) =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          const current = state.novelFolders[novelId] ?? [];
          return {
            novelFolders: {
              ...state.novelFolders,
              [novelId]: current.map((f) => (f.id === folder.id ? folder : f)),
            },
          };
        }),

      deleteFolder: (folderId) =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          const docs = state.novelDocuments[novelId] ?? [];
          const updatedDocs = docs.map((d) =>
            d.folder_id === folderId ? { ...d, folder_id: null } : d
          );
          return {
            novelFolders: {
              ...state.novelFolders,
              [novelId]: (state.novelFolders[novelId] ?? []).filter((f) => f.id !== folderId),
            },
            novelDocuments: { ...state.novelDocuments, [novelId]: updatedDocs },
          };
        }),

      moveDocToFolder: (docId, folderId) =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          const docs = state.novelDocuments[novelId] ?? [];
          return {
            novelDocuments: {
              ...state.novelDocuments,
              [novelId]: docs.map((d) =>
                d.id === docId ? { ...d, folder_id: folderId } : d
              ),
            },
          };
        }),

      // ── 파일 가져오기 (일괄) ────────────────────────────────────────────
      batchImport: (importedDocs) => {
        const state = get();
        const novelId = state.activeNovelId;
        if (!novelId || importedDocs.length === 0) return null;

        const now = new Date().toISOString();
        const currentDocs = state.novelDocuments[novelId] ?? [];
        const currentFolders = state.novelFolders[novelId] ?? [];

        // 다음 에피소드 번호
        let nextEp =
          currentDocs.length > 0
            ? Math.max(...currentDocs.map((d) => d.episode_no)) + 1
            : 1;

        // folderPath → folder ID 매핑 (기존 폴더 재사용 또는 신규 생성)
        const pathToFolderId = new Map<string, string>();

        function getOrCreateFolderId(folderPath: string): string {
          if (pathToFolderId.has(folderPath)) return pathToFolderId.get(folderPath)!;

          // 기존 폴더 중 동일 제목이 있으면 재사용
          // folderPath가 "1부/2장" 형태라면 마지막 세그먼트를 폴더 제목으로 사용
          const folderTitle = folderPath.split("/").pop() ?? folderPath;
          const existing = currentFolders.find((f) => f.title === folderTitle);
          if (existing) {
            pathToFolderId.set(folderPath, existing.id);
            return existing.id;
          }

          const newId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          pathToFolderId.set(folderPath, newId);
          return newId;
        }

        // 신규 폴더 목록
        const newFolders: DocFolder[] = [];
        const usedFolderPaths = new Set<string>();
        for (const doc of importedDocs) {
          if (doc.folderPath) usedFolderPaths.add(doc.folderPath);
        }
        for (const folderPath of usedFolderPaths) {
          const folderId = getOrCreateFolderId(folderPath);
          const alreadyExists = currentFolders.some((f) => f.id === folderId);
          if (!alreadyExists) {
            const folderTitle = folderPath.split("/").pop() ?? folderPath;
            newFolders.push({ id: folderId, title: folderTitle, collapsed: false });
          }
        }

        // 신규 문서 목록
        const newDocs: Document[] = importedDocs.map((imported) => {
          const folderId = imported.folderPath
            ? getOrCreateFolderId(imported.folderPath)
            : null;
          const doc: Document = {
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            episode_no: nextEp++,
            title: imported.title,
            content: imported.content,
            folder_id: folderId,
            created_at: now,
            updated_at: now,
          };
          return doc;
        });

        set((s) => ({
          novelDocuments: {
            ...s.novelDocuments,
            [novelId]: [...(s.novelDocuments[novelId] ?? []), ...newDocs],
          },
          novelFolders: {
            ...s.novelFolders,
            [novelId]: [...(s.novelFolders[novelId] ?? []), ...newFolders],
          },
          novels: s.novels.map((n) =>
            n.id === novelId ? { ...n, updated_at: now } : n
          ),
        }));

        return newDocs[0]?.id ?? null;
      },

      // ── 장기 기억 위키 ──────────────────────────────────────────────────
      novelWiki: {},

      getWiki: () => {
        const { novelWiki, activeNovelId } = get();
        return activeNovelId ? (novelWiki[activeNovelId] ?? []) : [];
      },

      upsertWikiItems: (items) =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          const current = state.novelWiki[novelId] ?? [];
          let updated = [...current];
          const now = new Date().toISOString();
          for (const item of items) {
            const byId = updated.findIndex((w) => w.id === item.id);
            if (byId !== -1) {
              updated[byId] = { ...item, updated_at: now };
            } else {
              // 같은 type+title이면 업데이트 (ID가 다르게 생성된 경우 대비)
              const byTitle = updated.findIndex(
                (w) => w.title === item.title && w.type === item.type
              );
              if (byTitle !== -1) {
                updated[byTitle] = { ...updated[byTitle], ...item, updated_at: now };
              } else {
                updated = [...updated, { ...item, created_at: item.created_at || now }];
              }
            }
          }
          return { novelWiki: { ...state.novelWiki, [novelId]: updated } };
        }),

      deleteWikiItem: (id) =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          const current = state.novelWiki[novelId] ?? [];
          return {
            novelWiki: {
              ...state.novelWiki,
              [novelId]: current.filter((w) => w.id !== id),
            },
          };
        }),

      clearWiki: () =>
        set((state) => {
          const novelId = state.activeNovelId;
          if (!novelId) return {};
          return { novelWiki: { ...state.novelWiki, [novelId]: [] } };
        }),

      loadWikiFromBackend: async (novelId: string) => {
        try {
          const { getNovelWiki } = await import("@/lib/api");
          const items = await getNovelWiki(novelId);
          if (items.length > 0) {
            set((state) => ({
              novelWiki: { ...state.novelWiki, [novelId]: items as WikiItem[] },
            }));
          }
        } catch (e) {
          console.warn("[Wiki] 백엔드 로드 실패 (로컬 유지):", e);
        }
      },

      syncWikiToBackend: async (novelId: string) => {
        try {
          const { saveNovelWiki } = await import("@/lib/api");
          const items = get().novelWiki[novelId] ?? [];
          await saveNovelWiki(novelId, items as unknown as import("@/lib/api").WikiItemRaw[]);
        } catch (e) {
          console.warn("[Wiki] 백엔드 저장 실패 (로컬 유지):", e);
        }
      },

      // ── 에디터 ──────────────────────────────────────────────────────────
      saveStatus: "idle",
      setSaveStatus: (saveStatus) => set({ saveStatus }),

      // ── UI 상태 ─────────────────────────────────────────────────────────
      monetaPanelOpen: false,
      toggleMonetaPanel: () =>
        set((state) => ({ monetaPanelOpen: !state.monetaPanelOpen })),

      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      darkMode: false,
      toggleDarkMode: () => {
        const next = !get().darkMode;
        if (typeof document !== "undefined") {
          if (next) document.documentElement.classList.add("dark");
          else document.documentElement.classList.remove("dark");
        }
        set({ darkMode: next });
      },
    }),
    {
      name: "moneta-store",
      partialize: (state) => ({
        novels: state.novels,
        activeNovelId: state.activeNovelId,
        novelDocuments: state.novelDocuments,
        novelFolders: state.novelFolders,
        novelWiki: state.novelWiki,
        activeDocId: state.activeDocId,
        darkMode: state.darkMode,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
