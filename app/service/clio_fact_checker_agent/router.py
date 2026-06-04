# app/service/clio_fact_checker_agent/router.py

import asyncio
import json
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends

from .service import ManuscriptAnalyzer
from app.auth.deps import get_current_user_id
import app.core.paths as core_paths

router = APIRouter(prefix="/manuscript", tags=["Fact Checker"])


def _build_analyzer(user_id: str, novel_id: str, extra_fiction_terms: list[str]) -> ManuscriptAnalyzer:
    """사용자/소설별 설정 경로를 사용해 ManuscriptAnalyzer 생성"""
    return ManuscriptAnalyzer(
        setting_path=core_paths.plot_path(user_id, novel_id),
        character_path=core_paths.characters_path(user_id, novel_id),
        extra_fiction_terms=extra_fiction_terms or None,
    )


@router.post("/analyze")
async def analyze_manuscript_file(
    novel_id: str = Form("", description="분석 대상 소설 ID (선택)"),
    title: str = Form(...),
    file: UploadFile = File(...),
    wiki_context: str = Form("", description="JSON-encoded wiki items (장기 기억 위키)"),
    user_id: str = Depends(get_current_user_id),
):
    """
    원고 파일을 업로드해 역사 고증 분석을 수행합니다.
    소설별 설정(plot.json, characters.json)을 허구 필터로 활용합니다.
    """
    # 위키에서 허구 고유명사 추출 (웹 검색 오탐 방지)
    extra_fiction_terms: list[str] = []
    if wiki_context:
        try:
            wiki_items = json.loads(wiki_context)
            extra_fiction_terms = [
                item["title"].strip()
                for item in wiki_items
                if item.get("title")
            ]
        except Exception:
            extra_fiction_terms = []

    # 파일 읽기 (비동기)
    try:
        content_bytes = await file.read()
        raw_content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="파일은 UTF-8 형식이어야 합니다.")

    # JSON 형식이면 'file' 키 추출, 아니면 전체 텍스트 사용
    try:
        json_data = json.loads(raw_content)
        if isinstance(json_data, dict) and "file" in json_data:
            real_text = json_data["file"]
        else:
            real_text = raw_content
    except json.JSONDecodeError:
        real_text = raw_content

    # ManuscriptAnalyzer.analyze_manuscript 는 동기·블로킹 함수이므로
    # 이벤트 루프 차단을 피하기 위해 ThreadPoolExecutor에서 실행
    try:
        loop = asyncio.get_running_loop()
        # novel_id가 없으면 빈 설정으로 분석 (허구 필터 없이 동작)
        effective_novel_id = novel_id if novel_id else "__default__"
        analyzer = _build_analyzer(user_id, effective_novel_id, extra_fiction_terms)
        result = await loop.run_in_executor(
            None, analyzer.analyze_manuscript, real_text
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 중 오류가 발생했습니다: {str(e)}")

    return {
        "title": title,
        "filename": file.filename,
        "analysis_result": result,
    }
