# app/service/story_keeper_agent/api.py
import asyncio
import os
import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Body, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from typing import Any, AsyncGenerator, Dict

from app.service.story_keeper_agent.ingest_episode import (
    ingest_episode,
    IngestEpisodeRequest,
)
from app.service.story_keeper_agent.ingest_episode.chunking import split_into_chunks
from app.service.story_keeper_agent.load_state.extracter import PlotManager

from app.service.story_keeper_agent.rules.check_consistency import check_consistency
from app.auth.deps import get_current_user_id
import app.core.paths as core_paths

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/story", tags=["story-keeper"])


def _safe_read_json(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _safe_write_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


def _extract_world_from_plot(plot_config: dict) -> dict:
    if not isinstance(plot_config, dict):
        return {}
    for k in ("world", "world_setting", "worldSettings", "settings", "setting", "global"):
        v = plot_config.get(k)
        if isinstance(v, dict) and v:
            return v
    return plot_config if isinstance(plot_config, dict) else {}


def _load_plot_config_for(user_id: str, novel_id: str) -> dict:
    return _safe_read_json(core_paths.plot_path(user_id, novel_id))


def _load_story_history_for(user_id: str, novel_id: str) -> dict:
    path = core_paths.story_history_path(user_id, novel_id)
    return _safe_read_json(path)


def _load_character_config_for(user_id: str, novel_id: str) -> dict:
    path = core_paths.characters_path(user_id, novel_id)
    if not os.path.exists(path):
        return {"characters": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {"characters": []}

    if isinstance(data, dict):
        chars = []
        for name, d in data.items():
            if isinstance(d, dict):
                x = dict(d)
                x.setdefault("name", name)
                chars.append(x)
        return {"characters": chars}

    if isinstance(data, list):
        chars = [d for d in data if isinstance(d, dict) and d.get("name")]
        return {"characters": chars}

    return {"characters": []}


def _sse_event(event: str, data: Any) -> str:
    """SSE 이벤트 포맷팅"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _run_manuscript_pipeline(
    *,
    episode_no: int,
    full_text_str: str,
    novel_id: str,
    user_id: str,
    wiki_context: str,
    genre: str,
    debug_raw: bool,
) -> AsyncGenerator[tuple, None]:
    """
    manuscript_feedback 핵심 로직을 async generator로 감싸
    SSE(stage, message, result) 튜플을 yield.
    마지막 yield는 ("done", ..., final_result_dict).
    """
    yield ("progress", "설정 파일 로드 중...", None)

    plot_config = await asyncio.get_running_loop().run_in_executor(
        None, _load_plot_config_for, user_id, novel_id
    )
    world = _extract_world_from_plot(plot_config)

    history = await asyncio.get_running_loop().run_in_executor(
        None, _load_story_history_for, user_id, novel_id
    )
    character_config = await asyncio.get_running_loop().run_in_executor(
        None, _load_character_config_for, user_id, novel_id
    )
    story_state = {"world": world, "history": history}

    # ── 위키 컨텍스트 주입 ────────────────────────────────────────────────
    wiki_items: list = []
    if wiki_context:
        try:
            wiki_items = json.loads(wiki_context)
        except Exception:
            wiki_items = []

    if wiki_items:
        existing_names = {
            c.get("name", "").strip()
            for c in character_config.get("characters", [])
        }
        for item in wiki_items:
            if item.get("type") == "character" and item.get("title"):
                name = item["title"].strip()
                if name and name not in existing_names:
                    character_config.setdefault("characters", []).append({
                        "name": name,
                        "description": item.get("description", ""),
                    })
                    existing_names.add(name)

        wiki_world_lines = [
            f"[{item.get('type', 'setting')}] {item['title']}: {item.get('description', '')}"
            for item in wiki_items
            if item.get("type") in ("world", "setting", "event", "theme", "location")
            and item.get("title")
        ]
        if wiki_world_lines:
            wiki_note = "\n\n[장기 기억 위키]\n" + "\n".join(wiki_world_lines)
            existing_raw = plot_config.get("world_raw", "")
            plot_config = {**plot_config, "world_raw": existing_raw + wiki_note}
            world = _extract_world_from_plot(plot_config)
            story_state["world"] = world

    yield ("progress", "회차 요약 저장 중...", None)

    chunks = split_into_chunks(full_text_str)
    await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: ingest_episode(req=IngestEpisodeRequest(
            episode_no=episode_no,
            text_chunks=chunks,
            user_id=user_id,
            novel_id=novel_id,
        )),
    )

    history_after = await asyncio.get_running_loop().run_in_executor(
        None, _load_story_history_for, user_id, novel_id
    )
    story_state = {"world": world, "history": history_after}

    yield ("progress", "이번 회차 팩트 추출 중...", None)

    novel_manager = PlotManager(user_id=user_id, novel_id=novel_id)
    episode_facts = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: novel_manager.extract_facts(episode_no, full_text_str, story_state),
    )
    if isinstance(episode_facts, dict):
        episode_facts["raw_text"] = full_text_str
    else:
        episode_facts = {"raw_text": full_text_str}

    yield ("progress", "세계관·캐릭터·플롯 검사 중 (병렬)...", None)

    issues = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: check_consistency(
            episode_facts=episode_facts,
            character_config=character_config,
            plot_config=plot_config,
            story_state=story_state,
            genre=genre,
        ),
    )

    if not issues:
        base: Dict[str, Any] = {"episode_no": episode_no, "message": "수정할 사안이 없습니다!", "issues": []}
    else:
        base = {"episode_no": episode_no, "issues": issues}

    if debug_raw:
        base["debug"] = {
            "cwd": os.getcwd(),
            "history_path": core_paths.story_history_path(user_id, novel_id),
            "full_text_len": len(full_text_str),
            "plot_loaded": bool(plot_config),
            "world_loaded": bool(world),
            "history_loaded": bool(history_after),
            "character_count": len(character_config.get("characters", [])) if isinstance(character_config, dict) else 0,
            "issues_count": len(issues) if isinstance(issues, list) else 0,
        }

    yield ("done", "분석 완료", base)


@router.post(
    "/manuscript_feedback",
    summary="Manuscript Feedback",
    description="원고 업로드 → 소설별 설정과 비교해 피드백 반환. stream=true 시 SSE 스트리밍.",
)
async def manuscript_feedback(
    episode_no: int,
    novel_id: str = Query(..., description="현재 소설 ID"),
    text: str = Body(..., media_type="text/plain"),
    debug_raw: bool = Query(False, description="디버그 정보를 포함할지"),
    wiki_context: str = Query("", description="JSON-encoded wiki items (장기 기억 위키)"),
    stream: bool = Query(False, description="SSE 스트리밍 여부"),
    genre: str = Query("", description="소설 장르 (회귀/빙의/로판/판타지 등)"),
    user_id: str = Depends(get_current_user_id),
):
    full_text_str = (text or "").strip()
    if not full_text_str:
        raise HTTPException(status_code=400, detail="원고 내용이 비어 있습니다. 내용을 입력한 후 다시 시도해주세요.")

    pipeline_kwargs = dict(
        episode_no=episode_no,
        full_text_str=full_text_str,
        novel_id=novel_id,
        user_id=user_id,
        wiki_context=wiki_context,
        genre=genre,
        debug_raw=debug_raw,
    )

    if stream:
        async def _generate_sse():
            try:
                async for stage, message, result in _run_manuscript_pipeline(**pipeline_kwargs):
                    if stage == "done":
                        yield _sse_event("done", result)
                    else:
                        yield _sse_event("progress", {"stage": stage, "message": message})
            except Exception as e:
                logger.exception("manuscript_feedback SSE 파이프라인 오류")
                yield _sse_event("error", {"message": _user_friendly_error(e)})

        return StreamingResponse(
            _generate_sse(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # 논-스트리밍: 최종 결과만 반환
    try:
        final_result: Dict[str, Any] = {}
        async for stage, message, result in _run_manuscript_pipeline(**pipeline_kwargs):
            if stage == "done" and result is not None:
                final_result = result
        return final_result
    except ValidationError as ve:
        raise HTTPException(status_code=422, detail=f"요청 형식 오류: {str(ve)}")
    except Exception as e:
        logger.exception("manuscript_feedback 파이프라인 오류")
        raise HTTPException(status_code=500, detail=_user_friendly_error(e))


def _user_friendly_error(e: Exception) -> str:
    """예외를 사용자 친화적 메시지로 변환"""
    msg = str(e)
    if "API" in msg or "api" in msg or "key" in msg.lower():
        return "AI 서비스 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
    if "timeout" in msg.lower() or "timed out" in msg.lower():
        return "분석 시간이 초과되었습니다. 원고를 더 짧게 나누어 시도해보세요."
    if "memory" in msg.lower() or "oom" in msg.lower():
        return "메모리 부족으로 분석에 실패했습니다. 원고 길이를 줄여보세요."
    if "empty" in msg.lower() or "비어" in msg:
        return msg
    return f"분석 중 오류가 발생했습니다. 원고 내용을 확인하고 다시 시도해주세요. (오류: {msg[:100]})"
