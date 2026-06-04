# main.py (프로젝트 루트 위치)
import os
import json
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()  # .env 파일을 읽어서 환경변수로 로드함

from fastapi import FastAPI, Path as FPath
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict

from app.service.clio_fact_checker_agent.router import router as manuscript_router
from app.service.clio_fact_checker_agent.history_router import router as history_router
from app.service.story_keeper_agent.api import router as story_keeper_router
from app.auth.router import router as auth_router
from app.spell.router import router as spell_router
from app.plot.router import router as plot_router
from app.novels.router import router as novels_router
from app.service.review.router import router as review_router
from app.service.export.router import router as export_router
from app.wiki.router import router as wiki_router

from app.common.history import repo as history_repo
from app.common.history.vector_store import vector_store

# ── 허용 오리진 (환경변수로 제어, 쉼표 구분) ──────────────────────────────────
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

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

    history_repo.init_db(HISTORY_DB_PATH)

    # ChromaDB가 실행 중일 때만 동기화 (available 플래그로 graceful degradation)
    if vector_store.available:
        try:
            current_entities = history_repo.list_entities(HISTORY_DB_PATH)
            vector_store.sync_from_json(current_entities)
            print("✅ 벡터 DB 동기화 완료")
        except Exception as e:
            print(f"⚠️ [Startup] 벡터 DB 동기화 실패 (계속 진행): {e}")
    else:
        print("⚠️ [Startup] ChromaDB 미연결 - Clio 로컬 벡터 검색 비활성화 (웹 검색은 정상 동작)")

    yield
    print("👋 [Shutdown] 서버 종료")


app = FastAPI(
    title="Moneta Project Server",
    description="NovelBright AI Writing Assistant API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 라우터 등록 ────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(novels_router)
app.include_router(review_router)
app.include_router(export_router)
app.include_router(spell_router)
app.include_router(plot_router)
app.include_router(wiki_router)
app.include_router(manuscript_router)
app.include_router(history_router)
app.include_router(story_keeper_router)


# ── Documents CRUD API ────────────────────────────────────────────────────────

class DocumentPayload(BaseModel):
    id: str
    episode_no: int = 1
    title: str = ""
    content: str = ""


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
    return {"status": "success"}


# ── Health Check ──────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "version": "1.0.0"}

# 실행 명령: uvicorn main:app --reload
