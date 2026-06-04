import type { ImportResult } from "./types";
import { fileTitle } from "./utils";

/**
 * .docx 파일 가져오기 (mammoth 라이브러리 사용)
 * mammoth는 동적으로 로드되어 필요할 때만 번들에 포함됩니다.
 */
export async function importDocx(file: File): Promise<ImportResult> {
  // 동적 import로 번들 크기 최소화
  const mammoth = (await import("mammoth")).default;

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });

  const warnings = result.messages
    .filter((m) => m.type === "warning" || m.type === "error")
    .map((m) => m.message);

  return {
    docs: [
      {
        title: fileTitle(file.name),
        content: result.value || "<p></p>",
      },
    ],
    warnings,
  };
}
