import type { ImportResult, ImportedDoc } from "./types";
import { fileTitle } from "./utils";

/**
 * .hwpx 파일 가져오기 (JSZip + XML 파싱)
 *
 * HWPX 구조:
 *   Contents/
 *     section0.xml  ← 본문 섹션들
 *     section1.xml
 *   word/
 *     header.xml    ← 메타데이터
 *
 * 각 섹션 XML에서 <hc:p> 요소 (단락) → <hc:t> (텍스트) 를 추출합니다.
 */
export async function importHwpx(file: File): Promise<ImportResult> {
  const JSZip = (await import("jszip")).default;
  const arrayBuffer = await file.arrayBuffer();

  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new Error("HWPX 파일을 열 수 없습니다. 손상된 파일이거나 지원되지 않는 형식입니다.");
  }

  // Contents/section*.xml 파일 목록 (정렬)
  const sectionPaths = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });

  if (sectionPaths.length === 0) {
    throw new Error("HWPX 파일에서 본문 섹션을 찾을 수 없습니다.");
  }

  const docs: ImportedDoc[] = [];
  const warnings: string[] = [];
  const baseName = fileTitle(file.name);
  const multiSection = sectionPaths.length > 1;

  for (const sectionPath of sectionPaths) {
    const xml = await zip.file(sectionPath)!.async("text");
    const paragraphs = extractHwpxParagraphs(xml);

    if (paragraphs.length === 0) continue;

    const sectionNo = parseInt(sectionPath.match(/\d+/)?.[0] ?? "0", 10) + 1;
    const title = multiSection ? `${baseName} — 섹션 ${sectionNo}` : baseName;
    const content = paragraphs.map((p) => `<p>${p}</p>`).join("\n");

    docs.push({ title, content });
  }

  if (docs.length === 0) {
    warnings.push("본문 내용이 비어있거나 추출할 수 없었습니다.");
    docs.push({ title: baseName, content: "<p></p>" });
  }

  return { docs, warnings };
}

/**
 * HWPX XML에서 단락 텍스트 추출
 *
 * 네임스페이스 패턴:
 *   <hc:p> ... <hc:t>텍스트</hc:t> ... </hc:p>
 * 또는 접두사 없이:
 *   <p> ... <t>텍스트</t> ... </p>
 */
function extractHwpxParagraphs(xml: string): string[] {
  const paragraphs: string[] = [];

  // <hc:p> 또는 <hp:p> 계열 단락 요소 매칭
  const paraPattern = /<(?:hc:|hp:|hs:)?p\b[^>]*>([\s\S]*?)<\/(?:hc:|hp:|hs:)?p>/g;
  let paraMatch: RegExpExecArray | null;

  while ((paraMatch = paraPattern.exec(xml)) !== null) {
    const inner = paraMatch[1];

    // <hc:t> 텍스트 요소에서 텍스트만 추출
    const textPattern = /<(?:hc:|hp:|hs:)?t[^>]*>([^<]*)<\/(?:hc:|hp:|hs:)?t>/g;
    let textMatch: RegExpExecArray | null;
    let lineText = "";

    while ((textMatch = textPattern.exec(inner)) !== null) {
      lineText += textMatch[1];
    }

    const trimmed = lineText.trim();
    if (trimmed) {
      // HTML 엔티티 처리
      paragraphs.push(
        trimmed
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&apos;/g, "'")
          .replace(/&quot;/g, '"')
      );
    }
  }

  return paragraphs;
}
