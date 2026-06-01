import { useState, useRef, useCallback } from "react";
import { extractWiki } from "@/lib/api";
import { useStore } from "@/store/useStore";
import type { Document, WikiItem } from "@/types";

/**
 * useWikiExtract — 저장 후 AI가 설정을 자동 추출해 Zustand + 백엔드에 저장
 *
 * - 저장 이벤트(onSaved) 발생 후 5초 뒤 추출 실행 (디바운스)
 * - 추출 성공 시 Zustand upsert → 백엔드 PUT 동기화
 * - 백엔드 실패 시 조용히 무시 (위키는 보조 기능)
 * - 텍스트가 50자 미만이면 스킵
 */
const EXTRACT_DELAY_MS = 5000;
// 위키 upsert 후 백엔드 동기화까지 추가 대기 (배치 여유)
const SYNC_DELAY_MS = 1000;

export function useWikiExtract(novelTitle?: string, novelId?: string) {
  const [extracting, setExtracting] = useState(false);
  const activeNovelId = useStore((s) => s.activeNovelId);
  const getWiki = useStore((s) => s.getWiki);
  const upsertWikiItems = useStore((s) => s.upsertWikiItems);
  const syncWikiToBackend = useStore((s) => s.syncWikiToBackend);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const novelTitleRef = useRef(novelTitle);
  novelTitleRef.current = novelTitle;

  // novelId 우선순위: prop > store
  const resolvedNovelId = novelId ?? activeNovelId ?? undefined;

  const scheduleExtract = useCallback(
    (doc: Document) => {
      if (!resolvedNovelId) return;
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        // HTML → plain text
        let text = doc.content;
        if (typeof window !== "undefined") {
          const div = window.document.createElement("div");
          div.innerHTML = doc.content;
          text = (div.textContent ?? div.innerText ?? "").trim();
        }
        if (!text || text.length < 50) return;

        setExtracting(true);
        try {
          const existingWiki = getWiki() as WikiItem[];
          const items = await extractWiki({
            content: text,
            episode_no: doc.episode_no,
            novel_title: novelTitleRef.current,
            existing_wiki: existingWiki,
          });
          if (items.length > 0) {
            // WikiItemRaw → WikiItem (created_at 보장)
            const now = new Date().toISOString();
            upsertWikiItems(
              items.map((item) => ({
                ...item,
                type: item.type as WikiItem["type"],
                created_at: item.created_at || now,
              }))
            );
            // 1초 후 백엔드에 동기화 (여러 청크가 연속 upsert될 경우 배치 효과)
            setTimeout(() => {
              syncWikiToBackend(resolvedNovelId);
            }, SYNC_DELAY_MS);
          }
        } catch {
          // silent fail — wiki is enhancement only
        } finally {
          setExtracting(false);
        }
      }, EXTRACT_DELAY_MS);
    },
    [resolvedNovelId, getWiki, upsertWikiItems, syncWikiToBackend]
  );

  return { extracting, scheduleExtract };
}
