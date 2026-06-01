# main.py (프로젝트 루트 위치)
import os
from dotenv import load_dotenv

load_dotenv()  # .env 파일을 읽어서 환경변수로 로드함

from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

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
# 예) ALLOWED_ORIGINS=https://novelbright.com,https://app.novelbright.com
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

HISTORY_DB_PATH = "app/data/history_db.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 [Startup] 서버 시작: History DB 점검 중...")

    history_repo.init_db(HISTORY_DB_PATH)

    try:
        current_entities = history_repo.list_entities(HISTORY_DB_PATH)
        vector_store.sync_from_json(current_entities)
        print("✅ 벡터 DB 동기화 완료")
    except Exception as e:
        print(f"⚠️  벡터 DB 동기화 실패 (AI 분석 기능 비활성화): {e}")

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


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "version": "1.0.0"}

# 실행 명령: uvicorn main:app --reload
