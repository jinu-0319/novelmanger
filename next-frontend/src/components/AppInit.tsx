"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { getDocuments } from "@/lib/api";

/**
 * 앱 최초 마운트 시 서버의 documents.json을 불러와 스토어에 반영.
 * - 서버 데이터가 있으면 서버를 source of truth로 사용
 * - 서버 연결 실패 시 localStorage(Zustand persist) 유지
 */
export default function AppInit({ children }: { children: React.ReactNode }) {
  const setDocuments = useStore((s) => s.setDocuments);
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;

    getDocuments().then((docs) => {
      if (docs.length > 0) {
        setDocuments(docs);
      }
    });
  }, [setDocuments]);

  return <>{children}</>;
}
