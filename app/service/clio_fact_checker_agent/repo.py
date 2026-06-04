import os
import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any

from app.core.llm import get_embeddings

COLLECTION_NAME = "history_collection"

# 전역 클라이언트 (재연결 방지)
_shared_client = None


class ManuscriptRepository:
    def __init__(self):
        global _shared_client
        self.available = False
        self.client = None
        self.collection = None

        try:
            self.embedding_function = get_embeddings()

            if _shared_client is None:
                chroma_host = os.getenv("CHROMA_HOST", "chromadb")
                chroma_port = os.getenv("CHROMA_PORT", "8000")

                print(f"📡 [ManuscriptRepo] ChromaDB 서버 연결 시도: {chroma_host}:{chroma_port}")

                _shared_client = chromadb.HttpClient(
                    host=chroma_host,
                    port=int(chroma_port),
                    settings=Settings(allow_reset=True, anonymized_telemetry=False)
                )

            self.client = _shared_client

            try:
                self.collection = self.client.get_collection(name=COLLECTION_NAME)
            except Exception:
                print(f"⚠️ 컬렉션 '{COLLECTION_NAME}'을 찾을 수 없습니다. (아직 데이터가 없을 수 있음)")
                self.collection = None

            self.available = True  # 클라이언트 연결 자체는 성공

        except Exception as e:
            print(f"⚠️ [ManuscriptRepo] ChromaDB 연결 실패 - 로컬 벡터 검색 비활성화: {e}")
            _shared_client = None  # 다음 인스턴스가 재시도할 수 있도록 초기화

    def search(self, query_text: str, n_results: int = 1) -> Dict[str, Any]:
        if not self.available or self.collection is None:
            return {"documents": [[]], "distances": [[]]}

        try:
            query_vector = self.embedding_function.embed_query(query_text)
            results = self.collection.query(
                query_embeddings=[query_vector],
                n_results=n_results
            )
            return results
        except Exception as e:
            print(f"⚠️ 검색 중 오류 발생: {e}")
            return {"documents": [[]], "distances": [[]]}
