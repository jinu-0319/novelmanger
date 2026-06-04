import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Document, SaveStatus } from "@/types";

interface Store {
  // Documents
  documents: Document[];
  activeDocId: string | null;
  setDocuments: (docs: Document[]) => void;
  setActiveDoc: (id: string | null) => void;
  upsertDocument: (doc: Document) => void;
  deleteDocument: (id: string) => void;
  reorderEpisodes: () => void;

  // Editor state
  saveStatus: SaveStatus;
  setSaveStatus: (s: SaveStatus) => void;

  // Moneta panel
  monetaPanelOpen: boolean;
  toggleMonetaPanel: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Dark mode
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      documents: [],
      activeDocId: null,
      saveStatus: "idle",
      monetaPanelOpen: false,
      sidebarCollapsed: false,
      darkMode: false,

      setDocuments: (docs) => set({ documents: docs }),

      setActiveDoc: (id) => set({ activeDocId: id }),

      upsertDocument: (doc) =>
        set((state) => {
          const idx = state.documents.findIndex((d) => d.id === doc.id);
          if (idx === -1) return { documents: [...state.documents, doc] };
          const next = [...state.documents];
          next[idx] = doc;
          return { documents: next };
        }),

      deleteDocument: (id) =>
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
          activeDocId: state.activeDocId === id ? null : state.activeDocId,
        })),

      reorderEpisodes: () =>
        set((state) => ({
          documents: state.documents
            .sort((a, b) => a.episode_no - b.episode_no)
            .map((d, i) => ({ ...d, episode_no: i + 1 })),
        })),

      setSaveStatus: (saveStatus) => set({ saveStatus }),

      toggleMonetaPanel: () =>
        set((state) => ({ monetaPanelOpen: !state.monetaPanelOpen })),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      toggleDarkMode: () => {
        const next = !get().darkMode;
        if (next) document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
        set({ darkMode: next });
      },
    }),
    {
      name: "moneta-store",
      partialize: (state) => ({
        documents: state.documents,
        activeDocId: state.activeDocId,
        darkMode: state.darkMode,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
