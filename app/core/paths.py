"""
app/core/paths.py — 사용자/소설별 데이터 경로 리졸버

디렉터리 구조:
  app/data/
    users.json                          ← 계정 목록
    users/{user_id}/
      novels.json                       ← 이 유저의 소설 목록
      {novel_id}/
        characters.json
        plot.json
        story_history.json
        material_db.json
        history_db.json
        chroma_db/
"""
from __future__ import annotations

import os

# app/data/ 절대 경로
_DATA_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data")
)


def user_dir(user_id: str) -> str:
    return os.path.join(_DATA_ROOT, "users", user_id)


def novel_dir(user_id: str, novel_id: str) -> str:
    return os.path.join(user_dir(user_id), novel_id)


def _ensure(path: str) -> str:
    """파일 경로를 받아 부모 디렉터리를 생성 후 경로 반환"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def novels_index_path(user_id: str) -> str:
    return _ensure(os.path.join(user_dir(user_id), "novels.json"))


def characters_path(user_id: str, novel_id: str) -> str:
    return _ensure(os.path.join(novel_dir(user_id, novel_id), "characters.json"))


def plot_path(user_id: str, novel_id: str) -> str:
    return _ensure(os.path.join(novel_dir(user_id, novel_id), "plot.json"))


def story_history_path(user_id: str, novel_id: str) -> str:
    return _ensure(os.path.join(novel_dir(user_id, novel_id), "story_history.json"))


def material_path(user_id: str, novel_id: str) -> str:
    return _ensure(os.path.join(novel_dir(user_id, novel_id), "material_db.json"))


def history_db_path(user_id: str, novel_id: str) -> str:
    return _ensure(os.path.join(novel_dir(user_id, novel_id), "history_db.json"))


def plot_boards_path(user_id: str, novel_id: str) -> str:
    return _ensure(os.path.join(novel_dir(user_id, novel_id), "plot_boards.json"))


def wiki_path(user_id: str, novel_id: str) -> str:
    return _ensure(os.path.join(novel_dir(user_id, novel_id), "wiki.json"))


def episodes_path(user_id: str, novel_id: str) -> str:
    return _ensure(os.path.join(novel_dir(user_id, novel_id), "episodes.json"))
