/**
 * api.ts — Next.js 프론트엔드 ↔ FastAPI 백엔드 통신 클라이언트
 *
 * 검증 기준:
 *  - frontend/api.py            (기존 Streamlit 클라이언트)
 *  - main.py                    (루트 엔드포인트)
 *  - app/service/story_keeper_agent/api.py      (prefix: /story)
 *  - app/service/clio_fact_checker_agent/router.py  (prefix: /manuscript)
 */

import type {
  Character,
  Document,
  Material,
  StoryHistory,
  WorldSetting,
  AnalysisItem,
  AnalysisResult,
} from "@/types";

// next.config.ts rewrite: /api/* → http://backend:8000/*
const BASE = "/api";

// ── 인증 토큰 헬퍼 ───────────────────────────────────────────────────────
// Zustand persist 스토어(localStorage "moneta-auth")에서 토큰을 직접 읽음
function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("moneta-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

function authHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonAuthHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeader() };
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────

/** HTML 태그 제거 → 순수 텍스트 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Story Keeper 응답 정규화
 *
 * 실제 백엔드 응답 구조 (story_keeper_agent/api.py):
 * {
 *   episode_no: number,
 *   issues: [
 *     { severity, type_label, title, location, sentence, reason, rewrite }
 *   ],
 *   message?: string   ← 이슈 없을 때
 * }
 */
function normalizeStoryKeeperResponse(raw: unknown): AnalysisItem[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  // issues 배열 없으면 문제 없음
  const issues = Array.isArray(obj.issues) ? obj.issues : [];
  if (issues.length === 0) return [];

  return issues.flatMap((item: unknown): AnalysisItem[] => {
    if (!item || typeof item !== "object") return [];
    const it = item as Record<string, unknown>;

    const sev = String(it.severity ?? "medium").toLowerCase();
    const severity = (["high", "medium", "low"].includes(sev)
      ? sev
      : "medium") as AnalysisItem["severity"];

    // description 조립: reason > sentence > location > rewrite 순
    const parts = [
      it.reason,
      it.sentence,
      it.location,
      it.rewrite ? `✏️ 수정 제안: ${String(it.rewrite)}` : "",
    ].filter((v): v is string => typeof v === "string" && v.trim() !== "");

    return [
      {
        title: String(it.title ?? it.type_label ?? "설정 충돌"),
        description: parts.join("\n") || "상세 내용 없음",
        severity,
      },
    ];
  });
}

/**
 * Clio 응답 정규화
 *
 * 실제 백엔드 응답 구조 (clio_fact_checker_agent/router.py):
 * {
 *   title: string,
 *   filename: string,
 *   analysis_result: <ManuscriptAnalyzer 반환값>
 * }
 */
function normalizeClioResponse(raw: unknown): AnalysisItem[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  // analysis_result 키 우선
  const result = obj.analysis_result ?? obj;

  if (typeof result === "string") {
    return [{ title: "고증 분석", description: result, severity: "medium" }];
  }

  if (Array.isArray(result)) {
    return result.flatMap((item: unknown): AnalysisItem[] => {
      if (typeof item === "string") {
        return [{ title: "고증 항목", description: item, severity: "low" }];
      }
      if (item && typeof item === "object") {
        const it = item as Record<string, unknown>;
        const sev = String(it.severity ?? "medium").toLowerCase();
        return [
          {
            title: String(it.title ?? it.type ?? "고증 항목"),
            description: String(it.description ?? it.message ?? it.content ?? ""),
            severity: (["high", "medium", "low"].includes(sev)
              ? sev
              : "medium") as AnalysisItem["severity"],
          },
        ];
      }
      return [];
    });
  }

  if (typeof result === "object" && result !== null) {
    return Object.entries(result as Record<string, unknown>).flatMap(
      ([key, val]): AnalysisItem[] => {
        if (typeof val === "string" && val.trim()) {
          return [{ title: key, description: val, severity: "low" }];
        }
        return [];
      }
    );
  }

  return [];
}

// ── Documents ─────────────────────────────────────────────────────────────
// 백엔드: POST /novels/{novel_id}/episodes
// 스키마: { id, episode_no, title, content, folder_id }

export async function saveDocument(doc: Partial<Document>): Promise<void> {
  if (!doc.novel_id) {
    // novel_id 없으면 로컬 저장만으로 처리 (백엔드 저장 스킵)
    return;
  }
  const res = await fetch(`${BASE}/novels/${doc.novel_id}/episodes`, {
    method: "POST",
    headers: { ...jsonAuthHeaders() },
    body: JSON.stringify({
      id:         doc.id,
      episode_no: doc.episode_no ?? 1,
      title:      doc.title ?? "",
      content:    doc.content ?? "",
      folder_id:  doc.folder_id ?? null,
    }),
  });
  if (!res.ok) throw new Error(`saveDocument 실패 (${res.status})`);
}

// ── Characters ────────────────────────────────────────────────────────────
// 백엔드: GET /story/characters
// 반환: characters.json 그대로 (배열 or dict-keyed 가변)

export async function getCharacters(): Promise<Character[]> {
  try {
    const res = await fetch(`${BASE}/story/characters`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;

    if (Array.isArray(data)) return data as Character[];

    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;

      // { characters: [...] }
      if (Array.isArray(obj.characters)) return obj.characters as Character[];

      // { "홍길동": { role, age, ... }, ... } — dict-keyed 형태
      const chars: Character[] = [];
      for (const [name, val] of Object.entries(obj)) {
        if (val && typeof val === "object") {
          chars.push({ name, ...(val as object) } as Character);
        }
      }
      if (chars.length > 0) return chars;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * 캐릭터 저장
 * 백엔드: POST /story/character_setting
 * 스키마: Form(name=str, text=str) — form-urlencoded, JSON 아님
 */
export async function saveCharacter(character: Character): Promise<void> {
  const form = new URLSearchParams();
  form.set("name", character.name);

  const textParts = [
    character.description,
    character.role    ? `역할: ${character.role}`   : "",
    character.age     ? `나이: ${character.age}`    : "",
    character.gender  ? `성별: ${character.gender}` : "",
    ...(character.traits ?? []),
  ].filter(Boolean);
  form.set("text", textParts.join("\n") || character.name);

  const res = await fetch(`${BASE}/story/character_setting`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(`saveCharacter 실패 (${res.status})`);
}

/**
 * 파일 업로드 → 텍스트 추출 → 백엔드 ingest
 * 백엔드: POST /story/ingest
 * 스키마: IngestRequest { text: str, type: "character" | "world" }
 * ※ 파일을 직접 전송하지 않음 — 클라이언트에서 텍스트 추출 후 JSON 전송
 */
export async function ingestFile(
  file: File,
  type: "character" | "world"
): Promise<void> {
  const text = await readFileText(file);
  if (!text.trim()) throw new Error("파일에서 텍스트를 읽을 수 없습니다.");

  const res = await fetch(`${BASE}/story/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type }),
  });
  if (!res.ok) throw new Error(`ingestFile 실패 (${res.status})`);
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve((e.target?.result as string) ?? "");
    reader.onerror = ()  => reject(new Error("파일 읽기 실패"));
    reader.readAsText(file, "utf-8");
  });
}

// ── World Setting ──────────────────────────────────────────────────────────
// GET  /story/world_setting → { plot: { world_raw?, summary?, ... } }
// POST /story/world_setting → Body(text/plain) — JSON 아님

export async function getWorldSetting(): Promise<WorldSetting | null> {
  try {
    const res = await fetch(`${BASE}/story/world_setting`);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!data || typeof data !== "object") return null;

    const obj  = data as Record<string, unknown>;
    // 응답이 { plot: {...} } 래핑된 경우 unwrap
    const plot =
      obj.plot && typeof obj.plot === "object"
        ? (obj.plot as Record<string, unknown>)
        : obj;

    const content =
      typeof plot.world_raw === "string" ? plot.world_raw :
      typeof plot.content   === "string" ? plot.content   : "";

    const summaryRaw = plot.summary;
    const summary =
      Array.isArray(summaryRaw)        ? summaryRaw.join("\n") :
      typeof summaryRaw === "string"   ? summaryRaw            : "";

    return { content, summary };
  } catch {
    return null;
  }
}

/**
 * 세계관 저장
 * 백엔드: Body(..., media_type="text/plain") — JSON 아님
 */
export async function saveWorldSetting(data: WorldSetting): Promise<void> {
  const res = await fetch(`${BASE}/story/world_setting`, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: data.content,   // 텍스트 그대로
  });
  if (!res.ok) throw new Error(`saveWorldSetting 실패 (${res.status})`);
}

// ── Story History ──────────────────────────────────────────────────────────
// 백엔드: GET /story/history
// 실제 응답: { history: { "1": { summary, title?, ... }, "2": {...} } }
// ※ 배열이 아닌 episode_no를 key로 하는 dict

export async function getStoryHistory(): Promise<StoryHistory[]> {
  try {
    const res = await fetch(`${BASE}/story/history`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!data || typeof data !== "object") return [];

    const obj = data as Record<string, unknown>;
    // { history: { ... } } 래핑 벗기기
    const raw =
      obj.history && typeof obj.history === "object"
        ? (obj.history as Record<string, unknown>)
        : obj;

    const result: StoryHistory[] = [];
    for (const [key, val] of Object.entries(raw)) {
      const epNo = parseInt(key, 10);
      if (isNaN(epNo)) continue;

      if (val && typeof val === "object") {
        const v = val as Record<string, unknown>;
        result.push({
          episode_no: epNo,
          title:   typeof v.title   === "string" ? v.title   : undefined,
          summary: typeof v.summary === "string" ? v.summary : JSON.stringify(v),
        });
      } else if (typeof val === "string") {
        result.push({ episode_no: epNo, summary: val });
      }
    }

    return result.sort((a, b) => a.episode_no - b.episode_no);
  } catch {
    return [];
  }
}

// ── Materials ──────────────────────────────────────────────────────────────
// 백엔드: POST /materials/save
// 스키마: MaterialPayload { id: str, title: str, category: str, content: str }
// 백엔드: DELETE /materials/{id}

export async function saveMaterial(
  material: Omit<Material, "id">
): Promise<string> {
  const id = `mat-${Date.now()}`;
  const res = await fetch(`${BASE}/materials/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      title:    material.title,
      category: material.file_type ?? "text",  // ← 백엔드 필수 필드
      content:  material.content,
    }),
  });
  if (!res.ok) throw new Error(`saveMaterial 실패 (${res.status})`);
  return id;
}

export async function deleteMaterial(id: string): Promise<void> {
  const res = await fetch(`${BASE}/materials/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteMaterial 실패 (${res.status})`);
}

// ── Analysis ───────────────────────────────────────────────────────────────

/**
 * Story Keeper 분석
 * 백엔드: POST /story/manuscript_feedback?episode_no=N&debug_raw=false
 * Content-Type: text/plain; charset=utf-8
 * Body: 순수 텍스트 (HTML 제거)
 */
export async function analyzeStoryKeeper(
  html: string,
  episodeNo = 1,
  wikiContext: WikiContextItem[] = [],
  novelId?: string,
  genre?: string,
  onProgress?: (stage: string, message: string) => void,
): Promise<AnalysisResult> {
  const text = stripHtml(html);
  if (!text.trim()) return { items: [] };

  const url = new URL(
    `${BASE}/story/manuscript_feedback`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  );
  url.searchParams.set("episode_no", String(episodeNo));
  url.searchParams.set("debug_raw", "false");
  if (novelId) url.searchParams.set("novel_id", novelId);
  if (genre) url.searchParams.set("genre", genre);
  if (wikiContext.length > 0) {
    url.searchParams.set("wiki_context", JSON.stringify(wikiContext));
  }

  // SSE 스트리밍 모드 (onProgress 콜백 있을 때)
  if (onProgress) {
    url.searchParams.set("stream", "true");

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...authHeader(),
      },
      body: text,
    });

    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`Story Keeper 분석 실패 (${res.status}): ${msg}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: AnalysisResult = { items: [] };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let eventName = "";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventName = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataLine = line.slice(6).trim();
        } else if (line === "" && eventName && dataLine) {
          try {
            const payload = JSON.parse(dataLine);
            if (eventName === "progress") {
              onProgress(payload.stage ?? "", payload.message ?? "");
            } else if (eventName === "done") {
              finalResult = { items: normalizeStoryKeeperResponse(payload), raw: payload };
            } else if (eventName === "error") {
              throw new Error(payload.message ?? "분석 중 오류가 발생했습니다.");
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) {
              // JSON 파싱 실패는 무시
            } else {
              throw parseErr;
            }
          }
          eventName = "";
          dataLine = "";
        }
      }
    }

    return finalResult;
  }

  // 비스트리밍 모드
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...authHeader(),
    },
    body: text,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Story Keeper 분석 실패 (${res.status}): ${msg}`);
  }

  const raw = (await res.json()) as unknown;
  return { items: normalizeStoryKeeperResponse(raw), raw };
}

/**
 * Clio 팩트체크 분석
 * 백엔드: POST /manuscript/analyze
 * Content-Type: multipart/form-data
 * Fields: title (Form 필수), file (UploadFile 필수)
 */
export async function analyzeClio(
  html: string,
  title = "원고",
  wikiContext: WikiContextItem[] = []
): Promise<AnalysisResult> {
  const text = stripHtml(html);
  if (!text.trim()) return { items: [] };

  const formData = new FormData();
  formData.append("title", title);           // ← 백엔드 필수 Form 필드
  formData.append(
    "file",
    new Blob([text], { type: "text/plain" }),
    "manuscript.txt"
  );
  if (wikiContext.length > 0) {
    formData.append("wiki_context", JSON.stringify(wikiContext));
  }
  // Content-Type 헤더 설정 금지 — fetch가 boundary 포함해 자동 설정

  const res = await fetch(`${BASE}/manuscript/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Clio 분석 실패 (${res.status}): ${msg}`);
  }

  const raw = (await res.json()) as unknown;
  return { items: normalizeClioResponse(raw), raw };
}

// ── Plot ───────────────────────────────────────────────────────────────────

export interface PlotSuggestion {
  title: string;
  summary: string;
  detail: string;
  mood: string;
}

export interface PlotResult {
  suggestions: PlotSuggestion[];
  mode: "recommend" | "generate";
  error: string | null;
}

export interface WikiContextItem {
  type: string;
  title: string;
  description: string;
}

export async function suggestPlot(params: {
  content: string;
  title?: string;
  genre?: string;
  episode_no?: number;
  wiki_context?: WikiContextItem[];
}): Promise<PlotResult> {
  const res = await fetch(`${BASE}/plot/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, mode: "recommend" }),
  });
  if (!res.ok) throw new Error(`플롯 추천 실패 (${res.status})`);
  return res.json();
}

export async function generatePlot(params: {
  content: string;
  title?: string;
  genre?: string;
  episode_no?: number;
  wiki_context?: WikiContextItem[];
}): Promise<PlotResult> {
  const res = await fetch(`${BASE}/plot/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, mode: "generate" }),
  });
  if (!res.ok) throw new Error(`플롯 생성 실패 (${res.status})`);
  return res.json();
}

// ── Wiki 자동 추출 ─────────────────────────────────────────────────────────

export interface WikiItemRaw {
  id: string;
  type: string;
  title: string;
  description: string;
  episode_no?: number;
  created_at?: string;
}

export async function extractWiki(params: {
  content: string;
  episode_no: number;
  novel_title?: string;
  existing_wiki?: WikiItemRaw[];
}): Promise<WikiItemRaw[]> {
  const res = await fetch(`${BASE}/wiki/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: params.content,
      episode_no: params.episode_no,
      novel_title: params.novel_title ?? "",
      existing_wiki: params.existing_wiki ?? [],
    }),
  });
  if (!res.ok) throw new Error(`위키 추출 실패 (${res.status})`);
  const data = (await res.json()) as { items: WikiItemRaw[]; error: string | null };
  if (data.error) throw new Error(data.error);
  return data.items ?? [];
}

// ── 위키 백엔드 영속화 ────────────────────────────────────────────────────────

export async function getNovelWiki(novelId: string): Promise<WikiItemRaw[]> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/wiki`, {
      headers: authHeader(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as WikiItemRaw[]) : [];
  } catch {
    return [];
  }
}

export async function saveNovelWiki(
  novelId: string,
  items: WikiItemRaw[]
): Promise<void> {
  try {
    await fetch(`${BASE}/novels/${novelId}/wiki`, {
      method: "PUT",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(items),
    });
  } catch {
    // 백엔드 저장 실패는 조용히 무시 (프론트 상태가 원본)
  }
}

// ── Spell Check ────────────────────────────────────────────────────────────

export interface SpellCorrection {
  original: string;
  corrected: string;
}

export interface SpellResult {
  checked: string;
  corrections: SpellCorrection[];
  error_count: number;
  error: string | null;
}

export async function checkSpell(text: string): Promise<SpellResult> {
  const res = await fetch(`${BASE}/spell/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`맞춤법 검사 실패 (${res.status})`);
  return res.json();
}

// ── Health ─────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Novel-scoped API (사용자/소설별 격리 데이터)
// 모든 함수는 Bearer 토큰 자동 첨부
// ══════════════════════════════════════════════════════════════════════════

export interface NovelServerData {
  id: string;
  title: string;
  genre?: string;
  description?: string;
  cover_color: string;
  cover_image?: string;
  created_at: string;
  updated_at?: string;
}

// ── 소설 목록/생성/삭제 ───────────────────────────────────────────────────

export async function getNovels(): Promise<NovelServerData[]> {
  try {
    const res = await fetch(`${BASE}/novels`, { headers: authHeader() });
    if (!res.ok) return [];
    const data = await res.json();
    // 백엔드가 배열 대신 오류 객체를 반환하는 경우 방어
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function createNovelOnServer(novel: {
  id: string;
  title: string;
  genre?: string;
  description?: string;
  cover_color: string;
  cover_image?: string;
}): Promise<NovelServerData | null> {
  try {
    const res = await fetch(`${BASE}/novels`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(novel),
    });
    if (!res.ok) return null;
    return (await res.json()) as NovelServerData;
  } catch {
    return null;
  }
}

export async function deleteNovelOnServer(novelId: string): Promise<void> {
  await fetch(`${BASE}/novels/${novelId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
}

// ── 캐릭터 (소설별) ────────────────────────────────────────────────────────

export async function getNovelCharacters(novelId: string): Promise<Character[]> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/characters`, {
      headers: authHeader(),
    });
    if (!res.ok) return [];
    return (await res.json()) as Character[];
  } catch {
    return [];
  }
}

export async function saveNovelCharacter(
  novelId: string,
  character: Character
): Promise<void> {
  const res = await fetch(`${BASE}/novels/${novelId}/characters`, {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: JSON.stringify(character),
  });
  if (!res.ok) throw new Error(`캐릭터 저장 실패 (${res.status})`);
}

export async function deleteNovelCharacter(
  novelId: string,
  charId: string
): Promise<void> {
  const res = await fetch(`${BASE}/novels/${novelId}/characters/${encodeURIComponent(charId)}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`캐릭터 삭제 실패 (${res.status})`);
}

// ── 세계관 (소설별) ────────────────────────────────────────────────────────

export async function getNovelWorld(novelId: string): Promise<WorldSetting | null> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/world`, {
      headers: authHeader(),
    });
    if (!res.ok) return null;
    return (await res.json()) as WorldSetting;
  } catch {
    return null;
  }
}

export async function saveNovelWorld(
  novelId: string,
  data: WorldSetting
): Promise<void> {
  const res = await fetch(`${BASE}/novels/${novelId}/world`, {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ content: data.content }),
  });
  if (!res.ok) throw new Error(`세계관 저장 실패 (${res.status})`);
}

// ── 줄거리 (소설별) ────────────────────────────────────────────────────────

export async function getNovelHistory(novelId: string): Promise<StoryHistory[]> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/history`, {
      headers: authHeader(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { history?: Record<string, unknown> };
    const raw = data.history ?? {};
    const result: StoryHistory[] = [];
    for (const [key, val] of Object.entries(raw)) {
      const epNo = parseInt(key, 10);
      if (isNaN(epNo)) continue;
      if (val && typeof val === "object") {
        const v = val as Record<string, unknown>;
        result.push({
          episode_no: epNo,
          title: typeof v.title === "string" ? v.title : undefined,
          summary: typeof v.summary === "string" ? v.summary : JSON.stringify(v),
        });
      }
    }
    return result.sort((a, b) => a.episode_no - b.episode_no);
  } catch {
    return [];
  }
}

// ── 자료실 (소설별) ────────────────────────────────────────────────────────

export async function getNovelMaterials(novelId: string): Promise<Material[]> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/materials`, {
      headers: authHeader(),
    });
    if (!res.ok) return [];
    return (await res.json()) as Material[];
  } catch {
    return [];
  }
}

export async function saveNovelMaterial(
  novelId: string,
  material: Omit<Material, "id">
): Promise<Material> {
  const res = await fetch(`${BASE}/novels/${novelId}/materials`, {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: JSON.stringify(material),
  });
  if (!res.ok) throw new Error(`자료 저장 실패 (${res.status})`);
  return (await res.json()) as Material;
}

export async function deleteNovelMaterial(
  novelId: string,
  matId: string
): Promise<void> {
  const res = await fetch(
    `${BASE}/novels/${novelId}/materials/${encodeURIComponent(matId)}`,
    { method: "DELETE", headers: authHeader() }
  );
  if (!res.ok) throw new Error(`자료 삭제 실패 (${res.status})`);
}

// ── 내보내기 ───────────────────────────────────────────────────────────────

export type ExportFormat = "txt" | "md" | "docx" | "pdf" | "epub";

export interface ExportEpisode {
  episode_no: number;
  title: string;
  content_html: string;
}

export async function exportNovel(params: {
  format: ExportFormat;
  novel_title: string;
  author?: string;
  episodes: ExportEpisode[];
}): Promise<void> {
  const res = await fetch(`${BASE}/export/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`내보내기 실패 (${res.status}): ${msg}`);
  }

  // Content-Disposition에서 파일명 추출
  const disposition = res.headers.get("Content-Disposition") ?? "";
  let filename = `${params.novel_title}.${params.format}`;
  const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i);
  if (match) filename = decodeURIComponent(match[1].replace(/['"]/g, ""));

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── AI 리뷰 ────────────────────────────────────────────────────────────────

export interface ReviewScores {
  story: number;
  character: number;
  tempo: number;
  style: number;
  emotion: number;
  marketability: number;
  world: number;
}

export interface ReviewSections {
  overall_feedback?: string;
  strengths?: string;
  improvements?: string;
  details?: string;
}

export interface ReviewResult {
  overall: number;
  scores: ReviewScores;
  sections: ReviewSections;
  error: string | null;
}

export async function analyzeReview(params: {
  text: string;
  title?: string;
  episode_no?: number;
  genre?: string;
  wiki_context?: WikiContextItem[];
}): Promise<ReviewResult> {
  const res = await fetch(`${BASE}/review/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`AI 리뷰 분석 실패 (${res.status})`);
  return res.json();
}

// ── 플롯 보드 (소설별) ─────────────────────────────────────────────────────

export interface PlotCard {
  id: string;
  title: string;
  description: string;
  tags: string[];
  doc_ids: string[];
  character_ids: string[];
  color: string;
}

export interface PlotColumn {
  id: string;
  title: string;
  cards: PlotCard[];
}

export interface PlotBoard {
  id: string;
  title: string;
  columns: PlotColumn[];
  created_at?: string;
  updated_at?: string;
}

export async function getBoards(novelId: string): Promise<PlotBoard[]> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/boards`, {
      headers: authHeader(),
    });
    if (!res.ok) return [];
    return (await res.json()) as PlotBoard[];
  } catch {
    return [];
  }
}

export async function createBoard(
  novelId: string,
  board: { title: string; columns?: PlotColumn[] }
): Promise<PlotBoard | null> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/boards`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(board),
    });
    if (!res.ok) return null;
    return (await res.json()) as PlotBoard;
  } catch {
    return null;
  }
}

export async function getBoard(
  novelId: string,
  boardId: string
): Promise<PlotBoard | null> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/boards/${boardId}`, {
      headers: authHeader(),
    });
    if (!res.ok) return null;
    return (await res.json()) as PlotBoard;
  } catch {
    return null;
  }
}

export async function updateBoard(
  novelId: string,
  boardId: string,
  board: { title: string; columns: PlotColumn[] }
): Promise<void> {
  const res = await fetch(`${BASE}/novels/${novelId}/boards/${boardId}`, {
    method: "PUT",
    headers: jsonAuthHeaders(),
    body: JSON.stringify(board),
  });
  if (!res.ok) throw new Error(`보드 저장 실패 (${res.status})`);
}

export async function deleteBoard(
  novelId: string,
  boardId: string
): Promise<void> {
  const res = await fetch(`${BASE}/novels/${novelId}/boards/${boardId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`보드 삭제 실패 (${res.status})`);
}
