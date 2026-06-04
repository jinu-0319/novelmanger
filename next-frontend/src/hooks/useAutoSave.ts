import { useEffect, useRef, useCallback } from "react";
import { saveDocument } from "@/lib/api";
import { useStore } from "@/store/useStore";
import type { Document } from "@/types";

const DEBOUNCE_MS = 1500;

export function useAutoSave(doc: Partial<Document> | null) {
  const setSaveStatus = useStore((s) => s.setSaveStatus);
  const upsertDocument = useStore((s) => s.upsertDocument);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDoc = useRef(doc);
  latestDoc.current = doc;

  const flush = useCallback(async () => {
    const d = latestDoc.current;
    if (!d || !d.id) return;
    setSaveStatus("saving");
    try {
      await saveDocument(d);
      upsertDocument(d as Document);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [setSaveStatus, upsertDocument]);

  useEffect(() => {
    if (!doc) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveStatus("idle");
    timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [doc, flush, setSaveStatus]);

  return { flush };
}
