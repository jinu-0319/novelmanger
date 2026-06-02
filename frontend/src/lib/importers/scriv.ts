import type { ImportResult, ImportedDoc } from "./types";
import { escapeHtml } from "./utils";

/**
 * 스크리브너 .scriv 폴더 가져오기
 *
 * .scriv 폴더 구조 (webkitdirectory로 선택):
 *   MyNovel.scriv/
 *     MyNovel.scrivx          ← 바인더 구조 (XML)
 *     Files/
 *       Data/
 *         {UUID}/
 *           content.rtf       ← 문서 본문 (RTF)
 *
 * project.scrivx에서 "Manuscript" 하위 항목의 타이틀과 UUID를 추출하고,
 * 해당 UUID의 content.rtf를 읽어 HTML로 변환합니다.
 */
export async function importScriv(files: File[]): Promise<ImportResult> {
  // .scrivx 파일 찾기
  const scrivxFile = files.find((f) => f.name.endsWith(".scrivx"));
  if (!scrivxFile) {
    throw new Error(
      ".scrivx 파일을 찾을 수 없습니다. .scriv 폴더 전체를 선택해주세요."
    );
  }

  const scrivxContent = await scrivxFile.text();
  const binder = parseScrivxBinder(scrivxContent);

  const docs: ImportedDoc[] = [];
  const warnings: string[] = [];

  // UUID → File 매핑 미리 생성 (탐색 성능)
  const fileMap = new Map<string, File>();
  for (const f of files) {
    // webkitRelativePath: "MyNovel.scriv/Files/Data/{UUID}/content.rtf"
    const parts = f.webkitRelativePath.replace(/\\/g, "/").split("/");
    const uuidIdx = parts.findIndex((p, i) => i > 0 && parts[i - 1] === "Data");
    if (uuidIdx !== -1 && f.name === "content.rtf") {
      fileMap.set(parts[uuidIdx], f);
    }
  }

  for (const item of binder) {
    const rtfFile = fileMap.get(item.uuid);
    if (!rtfFile) {
      warnings.push(`"${item.title}" 내용 파일을 찾을 수 없습니다 (UUID: ${item.uuid})`);
      continue;
    }

    let rtfText: string;
    try {
      rtfText = await rtfFile.text();
    } catch {
      warnings.push(`"${item.title}" RTF 파일을 읽을 수 없습니다.`);
      continue;
    }

    const html = rtfToHtml(rtfText);
    if (!html.trim()) continue;

    docs.push({
      title: item.title || `문서 ${docs.length + 1}`,
      content: html,
      folderPath: item.folderPath,
    });
  }

  if (docs.length === 0 && binder.length > 0) {
    warnings.push("가져올 수 있는 문서가 없습니다. .scriv 폴더 구조를 확인해주세요.");
  }

  return { docs, warnings };
}

interface ScrivItem {
  uuid: string;
  title: string;
  folderPath?: string;
}

/**
 * .scrivx XML 파싱 → Manuscript 폴더 내 문서 항목 추출
 * 재귀적으로 폴더 경로를 누적합니다.
 */
function parseScrivxBinder(xml: string): ScrivItem[] {
  // Manuscript 섹션 추출
  const manuscriptMatch = xml.match(
    /<BinderItem[^>]*Type="DraftFolder"[\s\S]*?<Children>([\s\S]*?)<\/Children>/
  );
  const scope = manuscriptMatch ? manuscriptMatch[1] : xml;

  const items: ScrivItem[] = [];
  extractItems(scope, items, undefined);
  return items;
}

function extractItems(xml: string, out: ScrivItem[], currentFolder: string | undefined) {
  // 최상위 BinderItem 요소들 탐색 (중첩 처리)
  const itemPattern = /<BinderItem\s([^>]*)>([\s\S]*?)<\/BinderItem>/g;
  let m: RegExpExecArray | null;

  while ((m = itemPattern.exec(xml)) !== null) {
    const attrs = m[1];
    const inner = m[2];

    const uuidMatch = attrs.match(/UUID="([^"]+)"/);
    const typeMatch = attrs.match(/Type="([^"]+)"/);
    const uuid = uuidMatch?.[1] ?? "";
    const type = typeMatch?.[1] ?? "Text";

    // 제목 추출
    const titleMatch = inner.match(/<Title>([^<]*)<\/Title>/);
    const title = titleMatch?.[1]?.trim() ?? "제목 없음";

    if (type === "Folder" || type === "DraftFolder") {
      // 폴더: 하위 항목 재귀 탐색
      const childrenMatch = inner.match(/<Children>([\s\S]*?)<\/Children>/);
      if (childrenMatch) {
        const folderPath = currentFolder ? `${currentFolder}/${title}` : title;
        extractItems(childrenMatch[1], out, folderPath);
      }
    } else if (type === "Text" && uuid) {
      out.push({ uuid, title, folderPath: currentFolder });
    }
  }
}

/**
 * RTF → HTML 변환 (기본 텍스트 추출)
 *
 * RTF 컨트롤 워드와 그룹을 제거해 순수 텍스트를 추출하고
 * <p> 태그로 단락을 구분합니다.
 */
function rtfToHtml(rtf: string): string {
  if (!rtf.startsWith("{\\rtf")) return `<p>${escapeHtml(rtf.trim())}</p>`;

  let text = rtf;

  // 이미지, 폰트테이블 등 바이너리/메타 그룹 제거
  text = text.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|object|shppict)[\s\S]*?\}/g, "");
  // 중첩 그룹 제거 (\* 목적지)
  text = text.replace(/\{\\\*[^}]*\}/g, "");

  // \par, \pard → 단락 구분자
  text = text.replace(/\\pard[^\\{}\n]*/g, "");
  text = text.replace(/\\par\b/g, "\n");
  text = text.replace(/\\line\b/g, "\n");

  // 탭
  text = text.replace(/\\tab\b/g, "\t");

  // 한국어 문자 유니코드 이스케이프 (\uN)
  text = text.replace(/\\u(-?\d+)\??/g, (_, codeStr) => {
    const code = parseInt(codeStr, 10);
    return code < 0 ? String.fromCharCode(code + 65536) : String.fromCharCode(code);
  });

  // 나머지 컨트롤 워드 제거
  text = text.replace(/\\[a-z*]+[-\d]* ?/gi, "");
  // 중괄호 제거
  text = text.replace(/[{}]/g, "");
  // 백슬래시 이스케이프 처리
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // 연속 공백 정리
  text = text.replace(/[ \t]+/g, " ");

  // 줄바꿈으로 단락 분리 → <p> 변환
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n") || "<p></p>"
  );
}
