import { useState, useCallback } from "react";
import { analyzeStoryKeeper, analyzeClio } from "@/lib/api";
import type { AnalysisResult, AnalysisType } from "@/types";

interface AnalysisState {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
}

const initialState: AnalysisState = { result: null, loading: false, error: null };

export function useAnalysis() {
  const [states, setStates] = useState<Record<AnalysisType, AnalysisState>>({
    story_keeper: initialState,
    clio: initialState,
  });

  const run = useCallback(async (type: AnalysisType, html: string) => {
    setStates((prev) => ({
      ...prev,
      [type]: { result: null, loading: true, error: null },
    }));
    try {
      const result =
        type === "story_keeper"
          ? await analyzeStoryKeeper(html)
          : await analyzeClio(html);
      setStates((prev) => ({
        ...prev,
        [type]: { result, loading: false, error: null },
      }));
    } catch (e) {
      setStates((prev) => ({
        ...prev,
        [type]: { result: null, loading: false, error: (e as Error).message },
      }));
    }
  }, []);

  const clear = useCallback((type: AnalysisType) => {
    setStates((prev) => ({ ...prev, [type]: initialState }));
  }, []);

  return { states, run, clear };
}
