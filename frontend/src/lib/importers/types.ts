/**
 * importer 공통 타입
 */

/** 가져온 문서 한 편 */
export interface ImportedDoc {
  /** 문서 제목 (파일명 또는 챕터 헤더에서 추출) */
  title: string;
  /** TipTap 호환 HTML 내용 */
  content: string;
  /**
   * 폴더 경로 (폴더째로 가져오기 시)
   * 예: "1부", "원고/1부" — 사이드바 폴더 이름으로 사용됨
   */
  folderPath?: string;
}

export interface ImportResult {
  docs: ImportedDoc[];
  warnings: string[];
}
