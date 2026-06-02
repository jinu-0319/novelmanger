/**
 * importer 공통 유틸리티
 */

/** 파일명에서 확장자를 제거한 제목 추출 */
export function fileTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim() || filename;
}

/** 평문 텍스트 → TipTap 호환 HTML */
export function textToHtml(text: string): string {
  // 연속 줄바꿈 2개 이상 → 문단 분리
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split("\n")
        .map((line) => escapeHtml(line.trim()))
        .join("<br>")
    )
    .filter((p) => p.trim());

  return paragraphs.map((p) => `<p>${p}</p>`).join("\n") || "<p></p>";
}

/** HTML 엔티티 이스케이프 (평문 → HTML 변환 시 사용) */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** XML/HTML 태그 완전 제거 */
export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

/** 지원 확장자 목록 */
export const SUPPORTED_EXTENSIONS = [
  "txt", "md", "markdown",
  "html", "htm",
  "docx",
  "epub",
  "hwpx",
  // hwp: 바이너리라 별도 에러 처리
  // doc: 레거시 바이너리라 별도 에러 처리
] as const;

export type SupportedExt = typeof SUPPORTED_EXTENSIONS[number];
