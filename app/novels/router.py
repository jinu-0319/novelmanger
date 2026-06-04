"""
app/novels/router.py

소설·사용자별 격리 데이터 API
모든 엔드포인트는 Bearer 토큰 필수 (get_current_user_id 의존성)

라우트:
  GET    /novels                          소설 목록
  POST   /novels                          소설 생성
  DELETE /novels/{novel_id}               소설 삭제 (데이터 포함)

  GET    /novels/{novel_id}/characters    캐릭터 목록
  POST   /novels/{novel_id}/characters    캐릭터 저장/수정
  DELETE /novels/{novel_id}/characters/{name}  캐릭터 삭제

  GET    /novels/{novel_id}/world         세계관 조회
  POST   /novels/{novel_id}/world         세계관 저장 (LLM 요약)

  GET    /novels/{novel_id}/history       회차별 줄거리 조회

  GET    /novels/{novel_id}/materials     자료 목록
  POST   /novels/{novel_id}/materials     자료 저장
  DELETE /novels/{novel_id}/materials/{mat_id}  자료 삭제
"""
from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel

from app.auth.deps import get_current_user_id
from app.core.paths import (
    novels_index_path,
    characters_path,
    plot_path,
    story_history_path,
    material_path,
    novel_dir,
    plot_boards_path,
    episodes_path,
)

router = APIRouter(prefix="/novels", tags=["Novels"])

KST = timezone(timedelta(hours=9))

# ── 파일 쓰기 경쟁 조건 방지용 per-user Lock ───────────────────────────────
_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _get_lock(key: str) -> threading.Lock:
    """key 기반 Lock 반환 (없으면 생성). key = user_id 또는 user_id/novel_id"""
    with _locks_guard:
        if key not in _locks:
            _locks[key] = threading.Lock()
        return _locks[key]


def _now() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


# ── JSON 유틸 ──────────────────────────────────────────────────────────────

def _read(path: str, default: Any = None) -> Any:
    if not os.path.exists(path):
        return default if default is not None else {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def _write(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


# ── 소설 목록 헬퍼 ─────────────────────────────────────────────────────────

def _load_novels(user_id: str) -> List[Dict[str, Any]]:
    data = _read(novels_index_path(user_id), default=[])
    return data if isinstance(data, list) else []


def _save_novels(user_id: str, novels: List[Dict[str, Any]]) -> None:
    _write(novels_index_path(user_id), novels)


def _get_novel(user_id: str, novel_id: str) -> Optional[Dict[str, Any]]:
    return next((n for n in _load_novels(user_id) if n["id"] == novel_id), None)


def _assert_novel(user_id: str, novel_id: str) -> Dict[str, Any]:
    novel = _get_novel(user_id, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="소설을 찾을 수 없습니다.")
    return novel


# ══════════════════════════════════════════════════════════════════════════
# 소설 CRUD
# ══════════════════════════════════════════════════════════════════════════

class NovelCreate(BaseModel):
    id: Optional[str] = None          # 프론트에서 이미 생성한 id 재사용
    title: str
    genre: Optional[str] = None
    description: Optional[str] = None
    cover_color: str = "#7c3aed"
    cover_image: Optional[str] = None  # base64 dataURL


@router.get("", summary="소설 목록")
def list_novels(user_id: str = Depends(get_current_user_id)):
    return _load_novels(user_id)


@router.post("", summary="소설 생성", status_code=201)
def create_novel(body: NovelCreate, user_id: str = Depends(get_current_user_id)):
    novel_id = body.id or f"novel-{uuid.uuid4().hex[:12]}"

    with _get_lock(user_id):
        novels = _load_novels(user_id)

        # 중복 방지 (멱등)
        existing = next((n for n in novels if n["id"] == novel_id), None)
        if existing:
            return existing

        now = _now()
        novel: Dict[str, Any] = {
            "id": novel_id,
            "title": body.title,
            "genre": body.genre,
            "description": body.description,
            "cover_color": body.cover_color,
            "cover_image": body.cover_image,
            "created_at": now,
            "updated_at": now,
        }
        novels.append(novel)
        _save_novels(user_id, novels)

    # 디렉터리 초기화 (lock 밖에서 수행해도 안전)
    os.makedirs(novel_dir(user_id, novel_id), exist_ok=True)
    return novel


@router.delete("/{novel_id}", summary="소설 삭제")
def delete_novel(novel_id: str, user_id: str = Depends(get_current_user_id)):
    with _get_lock(user_id):
        novels = _load_novels(user_id)
        if not any(n["id"] == novel_id for n in novels):
            raise HTTPException(status_code=404, detail="소설을 찾을 수 없습니다.")

        _save_novels(user_id, [n for n in novels if n["id"] != novel_id])

    # 데이터 디렉터리 삭제 (lock 밖에서 수행해도 안전)
    nd = novel_dir(user_id, novel_id)
    if os.path.isdir(nd):
        shutil.rmtree(nd, ignore_errors=True)

    return {"status": "success"}


# ══════════════════════════════════════════════════════════════════════════
# 캐릭터
# ══════════════════════════════════════════════════════════════════════════

class CharacterBody(BaseModel):
    id: Optional[str] = None
    name: str
    role: Optional[str] = None
    age: Optional[str] = None
    gender: Optional[str] = None
    description: Optional[str] = None
    traits: Optional[List[str]] = None


@router.get("/{novel_id}/characters", summary="캐릭터 목록")
def get_characters(novel_id: str, user_id: str = Depends(get_current_user_id)):
    _assert_novel(user_id, novel_id)
    data = _read(characters_path(user_id, novel_id), default=[])
    return data if isinstance(data, list) else []


@router.post("/{novel_id}/characters", summary="캐릭터 저장/수정")
def save_character(
    novel_id: str,
    body: CharacterBody,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    p = characters_path(user_id, novel_id)
    char_dict = body.model_dump(exclude_none=True)
    if not char_dict.get("id"):
        char_dict["id"] = f"char-{uuid.uuid4().hex[:8]}"

    with _get_lock(f"{user_id}/{novel_id}/chars"):
        chars: List[Dict[str, Any]] = _read(p, default=[])
        if not isinstance(chars, list):
            chars = []

        idx = next((i for i, c in enumerate(chars) if c.get("id") == char_dict["id"]
                    or c.get("name") == char_dict["name"]), -1)
        if idx >= 0:
            chars[idx] = {**chars[idx], **char_dict}
        else:
            chars.append(char_dict)
        _write(p, chars)

    return char_dict


@router.delete("/{novel_id}/characters/{char_id}", summary="캐릭터 삭제")
def delete_character(
    novel_id: str,
    char_id: str,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    p = characters_path(user_id, novel_id)

    with _get_lock(f"{user_id}/{novel_id}/chars"):
        chars: List[Dict[str, Any]] = _read(p, default=[])
        new_chars = [c for c in chars if c.get("id") != char_id and c.get("name") != char_id]
        _write(p, new_chars)

    return {"status": "success", "deleted": char_id}


# ══════════════════════════════════════════════════════════════════════════
# 세계관
# ══════════════════════════════════════════════════════════════════════════

class WorldBody(BaseModel):
    content: str
    summary: Optional[str] = None


@router.get("/{novel_id}/world", summary="세계관 조회")
def get_world(novel_id: str, user_id: str = Depends(get_current_user_id)):
    _assert_novel(user_id, novel_id)
    data = _read(plot_path(user_id, novel_id), default={})
    content = data.get("world_raw", data.get("content", ""))
    summary_raw = data.get("summary", "")
    summary = "\n".join(summary_raw) if isinstance(summary_raw, list) else summary_raw
    return {"content": content, "summary": summary}


@router.post("/{novel_id}/world", summary="세계관 저장 (LLM 요약)")
def save_world(
    novel_id: str,
    body: WorldBody,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    p = plot_path(user_id, novel_id)
    data = _read(p, default={})
    if not isinstance(data, dict):
        data = {}

    text = (body.content or "").strip()
    if not text:
        data["world_raw"] = ""
        data["summary"] = []
        _write(p, data)
        return {"status": "success", "content": "", "summary": ""}

    # LLM 요약 시도 (실패해도 원문 저장)
    summary_lines: List[str] = []
    try:
        from app.core.llm import get_llm
        llm = get_llm(temperature=0.2)
        prompt = f"""웹소설 편집자로서 아래 세계관 설정을 6~10줄로 요약해라.
JSON으로만 반환: {{"summary": ["...", "..."]}}

세계관 원문:
{text[:5000]}"""
        res = llm.invoke(prompt)
        raw = getattr(res, "content", "") or ""
        import re
        raw = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            parsed = json.loads(raw)
            s = parsed.get("summary")
            if isinstance(s, list):
                summary_lines = [str(x).strip() for x in s if str(x).strip()]
        except Exception:
            pass
    except Exception:
        pass

    if not summary_lines:
        # Fallback: 첫 8문장
        import re as _re
        parts = _re.split(r"(?<=[.!?。！？])\s+|\n+", text)
        summary_lines = [p.strip() for p in parts if len(p.strip()) >= 8][:8]

    data["world_raw"] = text
    data["summary"] = summary_lines
    _write(p, data)

    return {"status": "success", "content": text, "summary": "\n".join(summary_lines)}


# ══════════════════════════════════════════════════════════════════════════
# 줄거리 (회차별)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{novel_id}/history", summary="회차별 줄거리")
def get_story_history(novel_id: str, user_id: str = Depends(get_current_user_id)):
    _assert_novel(user_id, novel_id)
    data = _read(story_history_path(user_id, novel_id), default={})
    # { "1": { summary, title, ... }, ... } 형태 반환
    return {"history": data}


# ══════════════════════════════════════════════════════════════════════════
# 에피소드 (회차 원고 저장)
# ══════════════════════════════════════════════════════════════════════════

class EpisodeBody(BaseModel):
    id: str
    episode_no: int = 1
    title: str = ""
    content: str = ""
    folder_id: Optional[str] = None


@router.get("/{novel_id}/episodes", summary="에피소드 목록")
def list_episodes(novel_id: str, user_id: str = Depends(get_current_user_id)):
    _assert_novel(user_id, novel_id)
    data = _read(episodes_path(user_id, novel_id), default={})
    return list(data.values()) if isinstance(data, dict) else []


@router.post("/{novel_id}/episodes", summary="에피소드 저장/수정", status_code=200)
def save_episode(
    novel_id: str,
    body: EpisodeBody,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    p = episodes_path(user_id, novel_id)

    with _get_lock(f"{user_id}/{novel_id}/episodes"):
        data: Dict[str, Any] = _read(p, default={})
        if not isinstance(data, dict):
            data = {}
        data[body.id] = {
            "id":         body.id,
            "episode_no": body.episode_no,
            "title":      body.title,
            "content":    body.content,
            "folder_id":  body.folder_id,
            "updated_at": _now(),
        }
        _write(p, data)

    return {"status": "ok", "id": body.id}


@router.delete("/{novel_id}/episodes/{doc_id}", summary="에피소드 삭제")
def delete_episode(
    novel_id: str,
    doc_id: str,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    p = episodes_path(user_id, novel_id)

    with _get_lock(f"{user_id}/{novel_id}/episodes"):
        data: Dict[str, Any] = _read(p, default={})
        if isinstance(data, dict):
            data.pop(doc_id, None)
            _write(p, data)

    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════════════════
# 자료실
# ══════════════════════════════════════════════════════════════════════════

class MaterialBody(BaseModel):
    id: Optional[str] = None
    title: str
    content: str
    type: Optional[str] = "text"
    file_type: Optional[str] = None


@router.get("/{novel_id}/materials", summary="자료 목록")
def list_materials(novel_id: str, user_id: str = Depends(get_current_user_id)):
    _assert_novel(user_id, novel_id)
    data = _read(material_path(user_id, novel_id), default=[])
    return data if isinstance(data, list) else []


@router.post("/{novel_id}/materials", summary="자료 저장", status_code=201)
def save_material(
    novel_id: str,
    body: MaterialBody,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    p = material_path(user_id, novel_id)
    mat_dict = body.model_dump(exclude_none=True)
    if not mat_dict.get("id"):
        mat_dict["id"] = f"mat-{uuid.uuid4().hex[:12]}"
    mat_dict["created_at"] = _now()

    with _get_lock(f"{user_id}/{novel_id}/mats"):
        mats: List[Dict[str, Any]] = _read(p, default=[])
        if not isinstance(mats, list):
            mats = []

        idx = next((i for i, m in enumerate(mats) if m.get("id") == mat_dict["id"]), -1)
        if idx >= 0:
            mats[idx] = {**mats[idx], **mat_dict}
        else:
            mats.append(mat_dict)
        _write(p, mats)

    return mat_dict


@router.delete("/{novel_id}/materials/{mat_id}", summary="자료 삭제")
def delete_material(
    novel_id: str,
    mat_id: str,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    p = material_path(user_id, novel_id)

    with _get_lock(f"{user_id}/{novel_id}/mats"):
        mats: List[Dict[str, Any]] = _read(p, default=[])
        new_mats = [m for m in mats if m.get("id") != mat_id]
        _write(p, new_mats)

    return {"status": "success", "deleted": mat_id}


# ══════════════════════════════════════════════════════════════════════════
# 플롯 보드
# ══════════════════════════════════════════════════════════════════════════

class PlotCardBody(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    linked_docs: Optional[List[str]] = None    # document IDs
    linked_chars: Optional[List[str]] = None   # character names/IDs


class PlotColumnBody(BaseModel):
    id: str
    title: str
    cards: List[PlotCardBody] = []


class PlotBoardBody(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = None
    columns: List[PlotColumnBody] = []


def _load_boards(user_id: str, novel_id: str) -> List[Dict[str, Any]]:
    data = _read(plot_boards_path(user_id, novel_id), default=[])
    return data if isinstance(data, list) else []


def _save_boards(user_id: str, novel_id: str, boards: List[Dict[str, Any]]) -> None:
    _write(plot_boards_path(user_id, novel_id), boards)


@router.get("/{novel_id}/boards", summary="플롯 보드 목록")
def list_boards(novel_id: str, user_id: str = Depends(get_current_user_id)):
    _assert_novel(user_id, novel_id)
    boards = _load_boards(user_id, novel_id)
    # 목록에는 columns/cards 제외 (크기 절약)
    return [{"id": b["id"], "title": b["title"], "description": b.get("description")}
            for b in boards]


@router.post("/{novel_id}/boards", summary="플롯 보드 생성", status_code=201)
def create_board(
    novel_id: str,
    body: PlotBoardBody,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    boards = _load_boards(user_id, novel_id)
    board_id = body.id or f"board-{uuid.uuid4().hex[:10]}"

    # 중복 방지
    if any(b["id"] == board_id for b in boards):
        return next(b for b in boards if b["id"] == board_id)

    now = _now()
    board = {
        "id": board_id,
        "title": body.title,
        "description": body.description,
        "columns": [col.model_dump() for col in body.columns],
        "created_at": now,
        "updated_at": now,
    }
    boards.append(board)
    _save_boards(user_id, novel_id, boards)
    return board


@router.get("/{novel_id}/boards/{board_id}", summary="플롯 보드 상세")
def get_board(
    novel_id: str,
    board_id: str,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    boards = _load_boards(user_id, novel_id)
    board = next((b for b in boards if b["id"] == board_id), None)
    if not board:
        raise HTTPException(status_code=404, detail="보드를 찾을 수 없습니다.")
    return board


@router.put("/{novel_id}/boards/{board_id}", summary="플롯 보드 전체 업데이트")
def update_board(
    novel_id: str,
    board_id: str,
    body: PlotBoardBody,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    boards = _load_boards(user_id, novel_id)
    idx = next((i for i, b in enumerate(boards) if b["id"] == board_id), -1)
    if idx == -1:
        raise HTTPException(status_code=404, detail="보드를 찾을 수 없습니다.")

    updated = {
        **boards[idx],
        "title": body.title,
        "description": body.description,
        "columns": [col.model_dump() for col in body.columns],
        "updated_at": _now(),
    }
    boards[idx] = updated
    _save_boards(user_id, novel_id, boards)
    return updated


@router.delete("/{novel_id}/boards/{board_id}", summary="플롯 보드 삭제")
def delete_board(
    novel_id: str,
    board_id: str,
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    boards = _load_boards(user_id, novel_id)
    new_boards = [b for b in boards if b["id"] != board_id]
    _save_boards(user_id, novel_id, new_boards)
    return {"status": "success"}


# ══════════════════════════════════════════════════════════════════════════
# 장기 기억 위키 (GET / PUT)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{novel_id}/wiki", summary="위키 항목 전체 조회")
def get_wiki(novel_id: str, user_id: str = Depends(get_current_user_id)):
    _assert_novel(user_id, novel_id)
    from app.core.paths import wiki_path
    data = _read(wiki_path(user_id, novel_id), default=[])
    return data if isinstance(data, list) else []


@router.put("/{novel_id}/wiki", summary="위키 항목 전체 저장 (덮어쓰기)")
def save_wiki(
    novel_id: str,
    body: List[Dict[str, Any]] = Body(...),
    user_id: str = Depends(get_current_user_id),
):
    _assert_novel(user_id, novel_id)
    from app.core.paths import wiki_path
    _write(wiki_path(user_id, novel_id), body)
    return {"status": "success", "count": len(body)}
