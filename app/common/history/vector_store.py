# app/common/history/vector_store.py
from typing import List, Dict, Any

import os
from dotenv import load_dotenv
load_dotenv()

import chromadb
from langchain_chroma import Chroma
from app.core.llm import get_embeddings
from langchain_core.documents import Document

# 벡터 DB가 저장될 로컬 폴더 경로
#PERSIST_DIRECTORY = "app/data/chroma_db"

class HistoryVectorStore:
    def __init__(self):
        # 1. 임베딩 모델 설정 (Upstage Solar)
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

        # [변경 5] Chroma 초기화 시 client 주입
        self.vector_db = Chroma(
            client=self.client,
            collection_name="history_collection",
            embedding_function=self.embedding_model,
        )

    def sync_from_json(self, entities: List[Dict[str, Any]]):
        """
        JSON 데이터를 받아 벡터 DB를 '통째로' 갱신합니다.
        (데이터 양이 적을 때는 이 방식이 무결성 유지에 가장 확실합니다)
        """
        print(f"🔄 벡터 DB 동기화 시작... ({len(entities)}건)")

        try:
            self.vector_db.delete_collection()
        except Exception:
            # 컬렉션이 없으면 에러가 날 수 있으므로 무시하고 진행
            pass

        # 컬렉션 삭제 후 객체 재연결 (LangChain Chroma 특성상 안전하게 재할당)
        self.vector_db = Chroma(
            client=self.client,
            collection_name="history_collection",
            embedding_function=self.embedding_model,
        )

        # 2. Document 객체 리스트 생성
        documents = []
        for item in entities:
            # [중요] 검색에 걸리게 하고 싶은 텍스트를 하나로 합칩니다.
            # 이름, 시대, 요약, 설명, 태그를 모두 포함해야 검색이 잘 됩니다.
            content_text = (
                f"이름: {item['name']}\n"
                f"시대: {item.get('era', '')}\n"
                f"유형: {item.get('entity_type', '')}\n"
                f"요약: {item.get('summary', '')}\n"
                f"설명: {item.get('description', '')}\n"
                f"태그: {', '.join(item.get('tags', []))}"
            )

            # 메타데이터에는 원본 ID와 이름 등을 넣어두어 나중에 매칭하기 쉽게 함
            doc = Document(
                page_content=content_text,
                metadata={
                    "id": item["id"],
                    "name": item["name"],
                    "entity_type": item.get("entity_type", "Unknown")
                }
            )
            documents.append(doc)

        # 3. 벡터 DB에 삽입 (자동으로 임베딩 변환됨)
        if documents:
            self.vector_db.add_documents(documents)
            print("✅ 벡터 DB 동기화 완료!")

    def search(self, query: str, top_k: int = 3):
        """
        유사도 검색 수행
        """
        # 유사도 점수와 함께 반환 (score가 낮을수록 유사함 - 거리 기반일 경우)
        results = self.vector_db.similarity_search_with_score(query, k=top_k)
        return results

# 싱글톤 인스턴스
vector_store = HistoryVectorStore()