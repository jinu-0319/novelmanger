import type { ImportResult } from "./types";
import { fileTitle } from "./utils";

/** .html / .htm 파일 가져오기 */
export async function importHtml(file: File): Promise<ImportResult> {
  const text = await file.text();

  // <body> 내용만 추출, 없으면 전체 사용
  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = bodyMatch ? bodyMatch[1].trim() : text;

  // <head>, <script>, <style> 제거
  content = content
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .trim();

  return {
    docs: [{ title: fileTitle(file.name), content: content || "<p></p>" }],
    warnings: [],
  };
}
