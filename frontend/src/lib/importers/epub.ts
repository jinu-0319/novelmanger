import type { ImportResult, ImportedDoc } from "./types";
import { fileTitle } from "./utils";

/**
 * .epub 파일 가져오기 (JSZip 사용)
 * EPUB 스파인의 각 챕터를 개별 문서로 가져옵니다.
 */
export async function importEpub(file: File): Promise<ImportResult> {
  const JSZip = (await import("jszip")).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. META-INF/container.xml → OPF 경로 찾기
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) {
    throw new Error("유효하지 않은 EPUB 파일입니다 (container.xml 없음).");
  }

  const opfPathMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);
  if (!opfPathMatch) {
    throw new Error("유효하지 않은 EPUB 파일입니다 (OPF 경로를 찾을 수 없음).");
  }
  const opfPath = opfPathMatch[1];
  const opfBase = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  // 2. OPF 파싱 → 매니페스트 + 스파인
  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) throw new Error("OPF 파일을 읽을 수 없습니다.");

  // manifest: id → href 매핑
  const manifest = new Map<string, string>();
  const itemPat = /<item\s[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"/g;
  let itemM: RegExpExecArray | null;
  while ((itemM = itemPat.exec(opfXml)) !== null) {
    manifest.set(itemM[1], itemM[2]);
  }

  // spine: 순서대로 itemref idref 추출
  const spineMatch = opfXml.match(/<spine[\s\S]*?<\/spine>/i);
  const spineIds: string[] = [];
  if (spineMatch) {
    const idrefPat = /idref="([^"]+)"/g;
    let idrefM: RegExpExecArray | null;
    while ((idrefM = idrefPat.exec(spineMatch[0])) !== null) {
      spineIds.push(idrefM[1]);
    }
  }

  // 3. 각 챕터 읽기
  const docs: ImportedDoc[] = [];
  const warnings: string[] = [];
  const baseTitle = fileTitle(file.name);

  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;

    // href에 anchor(#) 있으면 파일 부분만
    const hrefFile = href.split("#")[0];
    const fullPath = opfBase + hrefFile;

    const chapterText = await zip.file(fullPath)?.async("text");
    if (!chapterText) {
      warnings.push(`챕터 파일을 읽을 수 없습니다: ${fullPath}`);
      continue;
    }

    const html = extractEpubBody(chapterText);
    if (!html.trim() || isNavDocument(html)) continue;

    // 제목: <title> 태그 → h1/h2 → 파일명 순서로 추출
    const title =
      chapterText.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i)?.[1]?.trim() ||
      `${baseTitle} ${docs.length + 1}`;

    docs.push({ title, content: html });
  }

  if (docs.length === 0) {
    throw new Error("EPUB에서 읽을 수 있는 챕터를 찾을 수 없습니다.");
  }

  return { docs, warnings };
}

/** EPUB HTML에서 body 내용 추출 및 정리 */
function extractEpubBody(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = bodyMatch ? bodyMatch[1] : html;

  // nav / toc 전용 태그 제거
  content = content
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .trim();

  return content;
}

/** 목차 전용 문서 여부 판별 */
function isNavDocument(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    (lower.includes('<nav') && lower.includes('epub:type="toc"')) ||
    lower.includes('epub:type="landmarks"')
  );
}
