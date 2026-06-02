/**
 * 파일/폴더 가져오기 진입점
 *
 * 지원 형식:
 *   단일 파일: .txt .md .markdown .html .htm .docx .epub .hwpx
 *   폴더: 위 형식 전부 + .scriv (스크리브너 패키지 폴더)
 *
 * 미지원 (사유):
 *   .hwp  — 한글 바이너리 포맷 (파서 없음, HWPX로 저장 후 가져올 것)
 *   .doc  — Word 레거시 바이너리 포맷 (docx로 저장 후 가져올 것)
 */

import type { ImportResult } from "./types";
import { importTxt } from "./txt";
import { importMd } from "./md";
import { importHtml } from "./html";
import { importDocx } from "./docx";
import { importEpub } from "./epub";
import { importHwpx } from "./hwpx";
import { importScriv } from "./scriv";

export type { ImportedDoc, ImportResult } from "./types";
export { SUPPORTED_EXTENSIONS } from "./utils";

/** accept 속성용 파일 확장자 문자열 */
export const FILE_ACCEPT =
  ".txt,.md,.markdown,.html,.htm,.docx,.epub,.hwpx,.hwp,.doc";

// ── 단일 파일 가져오기 ──────────────────────────────────────────────────────

export async function importFile(file: File): Promise<ImportResult> {
  const ext = getExt(file.name);

  switch (ext) {
    case "txt":
      return importTxt(file);

    case "md":
    case "markdown":
      return importMd(file);

    case "html":
    case "htm":
      return importHtml(file);

    case "docx":
      return importDocx(file);

    case "epub":
      return importEpub(file);

    case "hwpx":
      return importHwpx(file);

    case "hwp":
      throw new Error(
        "HWP 바이너리 형식은 지원되지 않습니다.\n" +
          "한글에서 [파일 → 다른 이름으로 저장 → HWPX(*.hwpx)]로 저장 후 다시 가져오세요."
      );

    case "doc":
      throw new Error(
        ".doc 형식은 지원되지 않습니다.\n" +
          "Word에서 [파일 → 다른 이름으로 저장 → .docx]로 저장 후 다시 가져오세요."
      );

    default:
      throw new Error(`지원하지 않는 파일 형식입니다: .${ext}`);
  }
}

// ── 폴더째로 가져오기 ──────────────────────────────────────────────────────

/**
 * webkitdirectory로 선택된 파일 목록을 가져옵니다.
 * 스크리브너 폴더(.scriv)는 전용 파서로 처리하고,
 * 그 외에는 지원 형식 파일들을 폴더 구조 그대로 가져옵니다.
 */
export async function importFolder(files: File[]): Promise<ImportResult> {
  // 스크리브너 프로젝트 감지 (.scrivx 파일 존재 여부)
  const hasScriv = files.some((f) => f.name.endsWith(".scrivx"));
  if (hasScriv) return importScriv(files);

  // 일반 폴더 — 지원 형식만 순차 가져오기
  const allDocs: ImportResult["docs"] = [];
  const allWarnings: string[] = [];

  const supportedExts = new Set([
    "txt", "md", "markdown", "html", "htm", "docx", "epub", "hwpx",
  ]);

  for (const file of files) {
    const ext = getExt(file.name);
    if (!supportedExts.has(ext)) continue;

    // 폴더 경로: webkitRelativePath의 중간 디렉토리
    // 예) "원고/1부/1장.txt" → folderPath = "원고/1부"
    //     "원고/서문.txt"    → folderPath = "원고"
    //     "서문.txt"         → folderPath = undefined
    const folderPath = extractFolderPath(file.webkitRelativePath);

    try {
      const result = await importFile(file);
      for (const doc of result.docs) {
        allDocs.push({ ...doc, folderPath: doc.folderPath ?? folderPath });
      }
      allWarnings.push(...result.warnings);
    } catch (e) {
      allWarnings.push(`${file.name}: ${(e as Error).message}`);
    }
  }

  if (allDocs.length === 0 && allWarnings.length === 0) {
    allWarnings.push("가져올 수 있는 파일이 없습니다. 지원 형식(.txt .md .docx .epub .hwpx .html)을 확인하세요.");
  }

  return { docs: allDocs, warnings: allWarnings };
}

// ── 유틸 ───────────────────────────────────────────────────────────────────

function getExt(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

/**
 * webkitRelativePath에서 중간 폴더 경로 추출
 * "root/folder1/folder2/file.txt" → "folder1/folder2"
 * "root/file.txt"                 → undefined (최상위 폴더는 무시)
 */
function extractFolderPath(relativePath: string): string | undefined {
  if (!relativePath) return undefined;
  const parts = relativePath.replace(/\\/g, "/").split("/");
  // parts[0] = root 폴더명, parts[-1] = 파일명
  if (parts.length <= 2) return undefined;
  return parts.slice(1, -1).join("/");
}
