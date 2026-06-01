"""
app/core/llm.py — 중앙 LLM/임베딩 팩토리

모델 교체 시 이 파일만 수정하면 전체 적용됩니다.
  분석 (Story Keeper, Clio) : Google Gemini 2.5 Flash
  임베딩 (ChromaDB)         : Google text-embedding-004
  플롯 생성                  : OpenAI GPT-4o  (plot 모듈에서 직접 사용)
"""

import os
from dotenv import load_dotenv

load_dotenv()


def get_llm(temperature: float = 0.3):
    """분석용 LLM — Gemini 2.5 Flash"""
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=temperature,
    )


def get_embeddings():
    """임베딩 모델 — Google text-embedding-004"""
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    return GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=os.getenv("GEMINI_API_KEY"),
    )
