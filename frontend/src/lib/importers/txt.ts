import type { ImportResult } from "./types";
import { fileTitle, textToHtml } from "./utils";

/** .txt 파일 가져오기 */
export async function importTxt(file: File): Promise<ImportResult> {
  const text = await file.text();
  return {
    docs: [{ title: fileTitle(file.name), content: textToHtml(text) }],
    warnings: [],
  };
}
