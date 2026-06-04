"""
app/core/llm.py — 중앙 LLM/임베딩 팩토리

모델 교체 시 이 파일만 수정하면 전체 적용됩니다.
  분석 (Story Keeper, Clio) : Google Gemini 2.5 Flash
  임베딩 (ChromaDB)         : Google text-embedding-004  ← 패키지 업그레이드 후 사용 가능
  플롯 생성                  : OpenAI GPT-4o  (plot 모듈에서 직접 사용)

[임베딩 모델 선택 기준]
  google-generativeai >= 0.8.x + langchain-google-genai 4.x 조합에서
  text-embedding-004는 v1beta 엔드포인트에서 지원되지 않아 404 오류 발생.

  해결 방법 (둘 중 하나):
    A) 패키지 업그레이드:
       .venv\\Scripts\\pip.exe install --upgrade google-generativeai langchain-google-genai
       → 업그레이드 후 EMBEDDING_MODEL = "models/text-embedding-004" 로 변경
    B) 현재: v1beta 호환 모델인 models/embedding-001 사용
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── 모델 설정 ─────────────────────────────────────────────────────────────────
# 패키지 업그레이드 후 "models/text-embedding-004" 으로 변경하세요
EMBEDDING_MODEL = "models/embedding-001"


def _get_api_key() -> str:
    """GEMINI_API_KEY 우선, 없으면 GOOGLE_API_KEY fallback"""
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""


def get_llm(temperature: float = 0.3):
    """분석용 LLM — Gemini 2.5 Flash"""
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=_get_api_key(),
        temperature=temperature,
    )


def get_embeddings():
    """임베딩 모델 — Google Generative AI Embeddings

    현재: models/embedding-001 (v1beta 호환, 768차원)
    목표: models/text-embedding-004 (패키지 업그레이드 후 EMBEDDING_MODEL 상수 변경)
    """
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    return GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        google_api_key=_get_api_key(),
    )
