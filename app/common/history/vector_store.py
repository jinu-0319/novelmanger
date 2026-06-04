# app/common/history/vector_store.py
from typing import List, Dict, Any

import os
from dotenv import load_dotenv
load_dotenv()

import chromadb
from langchain_chroma import Chroma
from app.core.llm import get_embeddings
from langchain_core.documents import Document


class HistoryVectorStore:
    def __init__(self):
        self.available = False
        self.client = None
        self.vector_db = None
        self.embedding_model = None

        try:
            self.embedding_model = get_embeddings()

            chroma_host = os.getenv("CHROMA_HOST", "chromadb")
            chroma_port = os.getenv("CHROMA_PORT", "8000")

            # localhost/127.0.0.1이면 서버 없이 로컬 파일 모드로 실행
            # 프로덕션(K8s)에서는 HttpClient로 외부 서버에 접속
            local_hosts = {"localhost", "127.0.0.1"}
            if chroma_host in local_hosts:
                persist_dir = os.path.join(
                    os.path.dirname(__file__), "..", "..", "data", "chroma_db"
                )
                os.makedirs(persist_dir, exist_ok=True)
                self.client = chromadb.PersistentClient(path=persist_dir)
                print(f"📂 ChromaDB 로컬 모드: {persist_dir}")
            else:
                self.client = chromadb.HttpClient(host=chroma_host, port=int(chroma_port))
                print(f"🌐 ChromaDB 서버 모드: {chroma_host}:{chroma_port}")

            self.vector_db = Chroma(
                client=self.client,
                collection_name="history_collection",
                embedding_function=self.embedding_model,
            )
            self.available = True

        except Exception as e:
            print(f"⚠️ [VectorStore] ChromaDB 연결 실패 - 벡터 검색 비활성화: {e}")

    def sync_from_json(self, entities: List[Dict[str, Any]]):
        """
        JSON 데이터를 받아 벡터 DB를 '통째로' 갱신합니다.
        (데이터 양이 적을 때는 이 방식이 무결성 유지에 가장 확실합니다)
        """
        if not self.available:
            print("⚠️ [VectorStore] ChromaDB 미연결 - sync 건너뜀")
            return

        print(f"🔄 벡터 DB 동기화 시작... ({len(entities)}건)")

        try:
            self.vector_db.delete_collection()
        except Exception:
            pass

        self.vector_db = Chroma(
            client=self.client,
            collection_name="history_collection",
            embedding_function=self.embedding_model,
        )

        documents = []
        for item in entities:
            content_text = (
                f"이름: {item['name']}\n"
                f"시대: {item.get('era', '')}\n"
                f"유형: {item.get('entity_type', '')}\n"
                f"요약: {item.get('summary', '')}\n"
                f"설명: {item.get('description', '')}\n"
                f"태그: {', '.join(item.get('tags', []))}"
            )
            doc = Document(
                page_content=content_text,
                metadata={
                    "id": item["id"],
                    "name": item["name"],
                    "entity_type": item.get("entity_type", "Unknown")
                }
            )
            documents.append(doc)

        if documents:
            self.vector_db.add_documents(documents)
            print("✅ 벡터 DB 동기화 완료!")

    def search(self, query: str, top_k: int = 3):
        """유사도 검색 수행"""
        if not self.available or self.vector_db is None:
            return []
        results = self.vector_db.similarity_search_with_score(query, k=top_k)
        return results


# 싱글톤 인스턴스
vector_store = HistoryVectorStore()
