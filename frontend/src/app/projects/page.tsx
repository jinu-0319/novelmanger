"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useStore, COVER_COLORS, type Novel } from "@/store/useStore";
import {
  getNovels,
  createNovelOnServer,
  deleteNovelOnServer,
} from "@/lib/api";

const GENRES = ["판타지", "로맨스", "로맨스 판타지", "현대 판타지", "무협", "SF", "공포/스릴러", "대체역사", "기타"];

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

// ── 표지 업로드 훅 ────────────────────────────────────────────────────────
function useCoverUpload(initial?: string) {
  const [preview, setPreview] = useState<string | undefined>(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function openPicker() { inputRef.current?.click(); }
  function clear() { setPreview(undefined); if (inputRef.current) inputRef.current.value = ""; }

  const inputEl = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
    />
  );

  return { preview, inputEl, openPicker, clear };
}

// ── 소설 카드 ─────────────────────────────────────────────────────────────
function NovelCard({ novel, onOpen, onDelete, onCoverChange }: {
  novel: Novel;
  onOpen: () => void;
  onDelete: () => void;
  onCoverChange: (base64: string) => void;
}) {
  const { novelDocuments } = useStore();
  const episodeCount = (novelDocuments[novel.id] ?? []).length;
  const coverInputRef = useRef<HTMLInputElement>(null);

  function handleCoverFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      onCoverChange(result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      onClick={onOpen}
      className="group bg-notion-bg border border-notion-border rounded-xl overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
    >
      {/* 표지 영역 */}
      <div className="relative h-28 overflow-hidden">
        {novel.cover_image ? (
          <img
            src={novel.cover_image}
            alt="표지"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full" style={{ backgroundColor: novel.cover_color }} />
        )}

        {/* 호버 시 표지 변경 버튼 */}
        <button
          onClick={(e) => { e.stopPropagation(); coverInputRef.current?.click(); }}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="text-white text-xs font-medium bg-black/50 px-3 py-1.5 rounded-full">
            📷 표지 변경
          </span>
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => e.target.files?.[0] && handleCoverFile(e.target.files[0])}
        />
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-notion-text text-base leading-tight line-clamp-2">
            {novel.title}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`"${novel.title}"을 삭제하시겠습니까?`)) onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 text-notion-text-secondary hover:text-red-400 transition-all text-xs flex-shrink-0 mt-0.5"
          >
            삭제
          </button>
        </div>

        {novel.description && (
          <p className="text-xs text-notion-text-secondary line-clamp-2 mb-2 leading-relaxed">
            {novel.description}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-3">
          {novel.genre && novel.genre.split(" · ").map((g) => (
            <span
              key={g}
              className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: novel.cover_color }}
            >
              {g}
            </span>
          ))}
          <span className="text-xs text-notion-text-secondary">{episodeCount}화</span>
          {novel.updated_at && (
            <span className="text-xs text-notion-text-secondary ml-auto">
              {timeAgo(novel.updated_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 새 소설 모달 ──────────────────────────────────────────────────────────
function NewNovelModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (data: { title: string; genre?: string; description?: string; cover_image?: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const { preview, inputEl, openPicker, clear } = useCoverUpload();

  function toggleGenre(g: string) {
    setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-notion-bg rounded-2xl border border-notion-border shadow-xl w-full max-w-md p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-notion-text mb-5">새 소설 만들기</h2>

        <div className="space-y-4">
          {/* 표지 이미지 업로드 */}
          <div>
            <label className="block text-sm text-notion-text-secondary mb-1.5">표지 이미지 (선택)</label>
            {inputEl}
            {preview ? (
              <div className="relative rounded-lg overflow-hidden h-32 border border-notion-border">
                <img src={preview} alt="표지 미리보기" className="w-full h-full object-cover" />
                <button
                  onClick={clear}
                  className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full hover:bg-black/80"
                >
                  ✕ 제거
                </button>
              </div>
            ) : (
              <button
                onClick={openPicker}
                className="w-full h-24 border-2 border-dashed border-notion-border rounded-lg flex flex-col items-center justify-center gap-1 text-notion-text-secondary hover:border-moneta hover:text-moneta transition-colors"
              >
                <span className="text-2xl">🖼️</span>
                <span className="text-xs">클릭하여 이미지 업로드</span>
              </button>
            )}
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-sm text-notion-text-secondary mb-1.5">
              제목 <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="소설 제목을 입력하세요"
              className="w-full px-3 py-2.5 text-sm border border-notion-border rounded-lg outline-none focus:border-moneta focus:ring-1 focus:ring-moneta/20 transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim())
                  onCreate({ title, genre: genres.join(" · ") || undefined, description, cover_image: preview });
              }}
            />
          </div>

          {/* 장르 (복수 선택) */}
          <div>
            <label className="block text-sm text-notion-text-secondary mb-1.5">
              장르
              {genres.length > 0 && (
                <span className="ml-2 text-moneta font-medium">{genres.length}개 선택됨</span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => toggleGenre(g)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    genres.includes(g)
                      ? "bg-moneta text-white border-moneta"
                      : "border-notion-border text-notion-text-secondary hover:border-moneta hover:text-moneta"
                  }`}
                >
                  {genres.includes(g) && <span className="mr-1">✓</span>}
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* 소개 */}
          <div>
            <label className="block text-sm text-notion-text-secondary mb-1.5">소개 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="소설을 짧게 소개해주세요"
              rows={3}
              className="w-full px-3 py-2.5 text-sm border border-notion-border rounded-lg outline-none focus:border-moneta focus:ring-1 focus:ring-moneta/20 transition-all resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-notion-text-secondary hover:text-notion-text transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => title.trim() && onCreate({ title, genre: genres.join(" · ") || undefined, description, cover_image: preview })}
            disabled={!title.trim()}
            className="px-5 py-2 text-sm bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors disabled:opacity-40"
          >
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { novels, addNovel, updateNovel, deleteNovel, setActiveNovel } = useStore();
  const [showModal, setShowModal] = useState(false);

  // 로그인 시 서버 소설 목록과 로컬 상태 동기화
  useEffect(() => {
    getNovels().then((serverNovels) => {
      // 배열이 아닌 응답(인증 오류 등)은 무시
      if (!Array.isArray(serverNovels) || serverNovels.length === 0) return;
      // 서버에만 있는 소설을 로컬에 추가 (ID 기준)
      const localIds = new Set(novels.map((n) => n.id));
      serverNovels.forEach((sn) => {
        if (!localIds.has(sn.id)) {
          addNovel({
            title: sn.title,
            genre: sn.genre,
            description: sn.description,
            cover_image: sn.cover_image,
          });
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(data: { title: string; genre?: string; description?: string; cover_image?: string }) {
    const novel = addNovel(data);
    // 서버에도 등록
    await createNovelOnServer({
      id: novel.id,
      title: novel.title,
      genre: novel.genre,
      description: novel.description,
      cover_color: novel.cover_color,
      cover_image: novel.cover_image,
    });
    setShowModal(false);
    setActiveNovel(novel.id);
    router.push(`/editor`);
  }

  function handleOpen(novel: Novel) {
    setActiveNovel(novel.id);
    router.push(`/editor`);
  }

  function handleDelete(novel: Novel) {
    deleteNovel(novel.id);
    deleteNovelOnServer(novel.id); // 서버에서도 삭제 (fire-and-forget)
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <>
      {showModal && (
        <NewNovelModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}

      <div className="min-h-screen bg-notion-bg-secondary">
        {/* 헤더 */}
        <header className="bg-notion-bg border-b border-notion-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-moneta flex items-center justify-center">
              <span className="text-white text-sm font-bold">M</span>
            </div>
            <span className="font-semibold text-notion-text">Moneta</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-notion-text-secondary">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-notion-text-secondary hover:text-notion-text transition-colors"
            >
              로그아웃
            </button>
          </div>
        </header>

        {/* 본문 */}
        <main className="max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-notion-text">
                {user?.name}의 소설
              </h1>
              <p className="text-notion-text-secondary text-sm mt-1">
                {novels.length > 0 ? `${novels.length}편의 소설` : "아직 작성한 소설이 없습니다"}
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-moneta text-white text-sm font-medium rounded-lg hover:bg-moneta-dark transition-colors shadow-sm"
            >
              <span className="text-lg leading-none">+</span>
              새 소설 만들기
            </button>
          </div>

          {novels.length === 0 ? (
            <div className="text-center py-24">
              <div className="text-6xl mb-4">✍️</div>
              <h2 className="text-lg font-semibold text-notion-text mb-2">
                첫 번째 소설을 시작해보세요
              </h2>
              <p className="text-notion-text-secondary text-sm mb-6">
                Moneta AI가 설정 관리와 고증 검수를 도와드립니다
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="px-6 py-2.5 bg-moneta text-white rounded-lg hover:bg-moneta-dark transition-colors"
              >
                소설 만들기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {novels.map((novel) => (
                <NovelCard
                  key={novel.id}
                  novel={novel}
                  onOpen={() => handleOpen(novel)}
                  onDelete={() => handleDelete(novel)}
                  onCoverChange={(base64) => updateNovel(novel.id, { cover_image: base64 })}
                />
              ))}
              <button
                onClick={() => setShowModal(true)}
                className="border-2 border-dashed border-notion-border rounded-xl p-5 text-notion-text-secondary hover:border-moneta hover:text-moneta transition-colors flex flex-col items-center justify-center gap-2 min-h-36"
              >
                <span className="text-3xl">+</span>
                <span className="text-sm font-medium">새 소설 만들기</span>
              </button>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
