import { useEffect, useRef, useCallback } from "react";
import { saveDocument } from "@/lib/api";
import { useStore } from "@/store/useStore";
import type { Document } from "@/types";

const DEBOUNCE_MS = 1500;

export function useAutoSave(
  doc: Partial<Document> | null,
  onSaved?: (doc: Document) => void
) {
  const setSaveStatus = useStore((s) => s.setSaveStatus);
  const upsertDocument = useStore((s) => s.upsertDocument);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDoc = useRef(doc);
  const onSavedRef = useRef(onSaved);
  latestDoc.current = doc;
  onSavedRef.current = onSaved;

  const flush = useCallback(async () => {
    const d = latestDoc.current;
    if (!d || !d.id) return;
    setSaveStatus("saving");
    try {
      await saveDocument(d);
      upsertDocument(d as Document);
      setSaveStatus("saved");
      onSavedRef.current?.(d as Document);
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
