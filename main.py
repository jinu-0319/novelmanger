# main.py (프로젝트 루트 위치)
from dotenv import load_dotenv

load_dotenv()  # .env 파일을 읽어서 환경변수로 로드함

from fastapi import FastAPI
from contextlib import asynccontextmanager

# [Import 경로 수정] app 패키지 내부 깊숙한 곳에 있는 라우터들을 가져옵니다.
from app.service.clio_fact_checker_agent.router import router as manuscript_router
from app.service.clio_fact_checker_agent.history_router import router as history_router
from app.service.story_keeper_agent.api import router as story_keeper_router

# ✅ [추가됨] 파일 처리 서비스 Import
from app.service.ingest_service import StoryIngestionService

# 공용 모듈 Import
from app.common.history import repo as history_repo
from app.common.history.vector_store import vector_store
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Path as FPath
from datetime import datetime, timezone
import uuid
import json
import os

# DB 파일 경로 (루트 기준이므로 app/... 으로 시작)
HISTORY_DB_PATH = "app/data/history_db.json"
DOCUMENTS_DB_PATH = "app/data/documents.json"


def _read_documents() -> Dict[str, Any]:
    if not os.path.exists(DOCUMENTS_DB_PATH):
        return {}
    try:
        with open(DOCUMENTS_DB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_documents(docs: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(DOCUMENTS_DB_PATH), exist_ok=True)
    with open(DOCUMENTS_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 [Startup] 서버 시작: History DB 점검 중...")

    # 1. DB 파일 초기화 확인
    history_repo.init_db(HISTORY_DB_PATH)

    # 2. 벡터 스토어 동기화 (ChromaDB가 실행 중일 때만)
    if vector_store.available:
        try:
            current_entities = history_repo.list_entities(HISTORY_DB_PATH)
            vector_store.sync_from_json(current_entities)
        except Exception as e:
            print(f"⚠️ [Startup] 벡터 DB 동기화 실패 (계속 진행): {e}")
    else:
        print("⚠️ [Startup] ChromaDB 미연결 - Clio 로컬 벡터 검색 비활성화 (웹 검색은 정상 동작)")

    yield
    print("👋 [Shutdown] 서버 종료")


app = FastAPI(
    title="Moneta Project Server",
    description="Fact Checker & History DB API",
    lifespan=lifespan
)

# CORS 설정 (Streamlit과의 통신 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# [Models] 데이터 모델
# --------------------------------------------------------------------------

class DocumentPayload(BaseModel):
    id: str
    episode_no: int = 1
    title: str = ""
    content: str = ""


class AnalyzeTextRequest(BaseModel):
    text: str
    episode_no: int = 1


class MaterialPayload(BaseModel):
    id: str
    title: str
    category: str
    content: str


# ✅ [추가됨] 프론트엔드 요청 데이터 모델
class IngestRequest(BaseModel):
    text: str
    type: str  # 'character' 또는 'world'


# --------------------------------------------------------------------------
# [API] 문서 (Documents)
# --------------------------------------------------------------------------

@app.post("/documents/save", tags=["Document"])
def api_save_document(doc: DocumentPayload):
    docs = _read_documents()
    now = datetime.now(timezone.utc).isoformat()
    existing = docs.get(doc.id, {})
    docs[doc.id] = {
        "id": doc.id,
        "episode_no": doc.episode_no,
        "title": doc.title,
        "content": doc.content,
        "created_at": existing.get("created_at", now),
        "updated_at": now,
    }
    _write_documents(docs)
    print(f"💾 [Doc Save] {doc.title} (ID: {doc.id}) - {len(doc.content)}자")
    return {"status": "success", "id": doc.id}


@app.get("/documents", tags=["Document"])
def api_list_documents():
    docs = _read_documents()
    return sorted(docs.values(), key=lambda d: d.get("episode_no", 0))


@app.delete("/documents/{doc_id}", tags=["Document"])
def api_delete_document(doc_id: str = FPath(...)):
    docs = _read_documents()
    docs.pop(doc_id, None)
    _write_documents(docs)
    print(f"🗑️ [Doc Delete] ID: {doc_id}")
    return {"status": "success"}


# --------------------------------------------------------------------------
# [API] 분석 (Moneta AI)
# --------------------------------------------------------------------------

@app.post("/analyze/text", tags=["Analysis"])
def api_analyze_text(payload: AnalyzeTextRequest):
    from app.service.story_keeper_agent.pipeline import run_pipeline

    text = payload.text
    if not text.strip():
        return []

    print(f"🔄 [Story Keeper] 분석 요청: {len(text)}자, episode={payload.episode_no}")
    result = run_pipeline(episode_no=payload.episode_no, raw_text=text)

    return [
        {
            "title": e.get("title") or e.get("type_label", "설정 오류"),
            "description": e.get("reason", ""),
            "severity": e.get("severity", "medium"),
        }
        for e in result.get("edits", [])
    ]


# --------------------------------------------------------------------------
# [API] 자료실 (Materials)
# --------------------------------------------------------------------------

@app.post("/materials/save", tags=["Materials"])
def api_save_material(mat: MaterialPayload):
    print(f"📚 [Mat Save] {mat.title} ({mat.category})")
    return {"status": "success", "msg": f"자료 '{mat.title}' 저장 완료"}


@app.delete("/materials/{material_id}", tags=["Materials"])
def api_delete_material(material_id: str):
    print(f"🗑️ [Mat Delete] ID: {material_id}")
    return {"status": "success", "msg": "자료 삭제 완료"}


# --------------------------------------------------------------------------
# ✅ [추가됨] 스토리 Ingest API (프론트 연결용)
# --------------------------------------------------------------------------
@app.post("/story/ingest", tags=["Story Keeper"])
async def ingest_content(request: IngestRequest):
    """
    프론트엔드에서 텍스트를 받아 분석 및 저장
    """
    service = StoryIngestionService()
    success = service.process_text(request.text, request.type)

    if success:
        return {"status": "success", "message": "분석 및 저장이 완료되었습니다."}
    else:
        return {"status": "error", "message": "서버 내부 처리 중 실패했습니다."}


# ---------------------------------------------------------
# 라우터 등록 (Include Routers)
# ---------------------------------------------------------
# 1. 원고 분석 API (/manuscript)
app.include_router(manuscript_router)

# 2. 역사 DB 관리 API (/history)
app.include_router(history_router)

app.include_router(story_keeper_router)


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}

# 실행 명령: uvicorn main:app --reload

# backend/main.py 하단에 추가
@app.get("/story/characters", tags=["Story Keeper"])
def get_characters():
    import json, os
    # 백엔드 내부의 실제 데이터 경로
    path = "app/data/characters.json"
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}