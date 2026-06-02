import { useState, useCallback } from "react";
import { analyzeStoryKeeper, analyzeClio } from "@/lib/api";
import type { AnalysisResult, AnalysisType } from "@/types";
import type { WikiContextItem } from "@/lib/api";

interface AnalysisState {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  /** SSE 스트리밍 중 현재 진행 단계 메시지 */
  progressMessage: string | null;
}

/** run() 호출 시 전달하는 선택적 메타데이터 */
export interface RunOptions {
  /** Story Keeper: 현재 회차 번호 (기본값 1) */
  episodeNo?: number;
  /** Clio: 원고 제목 (기본값 "원고") */
  docTitle?: string;
  /** 장기 기억 위키 컨텍스트 */
  wikiContext?: WikiContextItem[];
  /** 소설 ID — Story Keeper 소설별 격리에 필요 */
  novelId?: string;
  /** 장르 — Story Keeper 장르 인식 프롬프트용 (회귀/빙의/로판/판타지 등) */
  genre?: string;
}

const initialState: AnalysisState = {
  result: null,
  loading: false,
  error: null,
  progressMessage: null,
};

export function useAnalysis() {
  const [states, setStates] = useState<Record<AnalysisType, AnalysisState>>({
    story_keeper: initialState,
    clio: initialState,
  });

  const run = useCallback(
    async (type: AnalysisType, html: string, opts: RunOptions = {}) => {
      setStates((prev) => ({
        ...prev,
        [type]: { result: null, loading: true, error: null, progressMessage: null },
      }));
      try {
        const wiki = opts.wikiContext ?? [];

        let result: AnalysisResult;

        if (type === "story_keeper") {
          // Next.js rewrite가 SSE 스트리밍을 프록시하지 못하는 문제로
          // onProgress(스트리밍) 대신 비스트리밍 모드로 호출
          result = await analyzeStoryKeeper(
            html,
            opts.episodeNo ?? 1,
            wiki,
            opts.novelId,
            opts.genre,
            undefined,   // onProgress 비활성화 → stream=false
          );
        } else {
          result = await analyzeClio(html, opts.docTitle ?? "원고", wiki, opts.novelId);
        }

        setStates((prev) => ({
          ...prev,
          [type]: { result, loading: false, error: null, progressMessage: null },
        }));
      } catch (e) {
        setStates((prev) => ({
          ...prev,
          [type]: {
            result: null,
            loading: false,
            error: (e as Error).message,
            progressMessage: null,
          },
        }));
      }
    },
    []
  );

  const clear = useCallback((type: AnalysisType) => {
    setStates((prev) => ({ ...prev, [type]: initialState }));
  }, []);

  return { states, run, clear };
}
