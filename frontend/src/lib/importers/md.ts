import type { ImportResult } from "./types";
import { fileTitle, escapeHtml } from "./utils";

/**
 * .md / .markdown 파일 가져오기
 * 외부 라이브러리 없이 기본 마크다운 요소를 HTML로 변환합니다.
 */
export async function importMd(file: File): Promise<ImportResult> {
  const text = await file.text();
  return {
    docs: [{ title: fileTitle(file.name), content: mdToHtml(text) }],
    warnings: [],
  };
}

function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inParagraph = false;
  let paragraphLines: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      const text = paragraphLines.join("<br>").trim();
      if (text) html.push(`<p>${text}</p>`);
      paragraphLines = [];
    }
    inParagraph = false;
  }

  for (const raw of lines) {
    const line = raw;

    // 제목 (ATX 스타일)
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h1 || h2 || h3) {
      flushParagraph();
      if (h1) html.push(`<h1>${inlineFormat(h1[1])}</h1>`);
      else if (h2) html.push(`<h2>${inlineFormat(h2[1])}</h2>`);
      else if (h3) html.push(`<h3>${inlineFormat(h3[1])}</h3>`);
      continue;
    }

    // 수평선
    if (/^---+$|^\*\*\*+$/.test(line.trim())) {
      flushParagraph();
      html.push("<hr>");
      continue;
    }

    // 빈 줄 → 문단 분리
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    // 일반 텍스트 → 문단 누적
    inParagraph = true;
    paragraphLines.push(inlineFormat(escapeHtml(line)));
  }

  flushParagraph();
  return html.join("\n") || "<p></p>";
}

/** 인라인 마크다운 (굵기, 기울임, 코드) 처리 */
function inlineFormat(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
