from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    ChatGoogleGenerativeAI = None


def _project_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _read_json(path: Path, default: Any):
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


def _split_sentences_ko(text: str) -> List[str]:
    t = (text or "").strip()
    if not t:
        return []
    parts = re.split(r"(?<=[.!?。！？])\s+|\n+", t)
    return [p.strip() for p in parts if len(p.strip()) >= 8]


def _pick_summary(text: str) -> List[str]:
    sents = _split_sentences_ko(text)
    return sents[:8]


def _safe_str(x: Any) -> str:
    if isinstance(x, str):
        return x
    if x is None:
        return ""
    return str(x)


class PlotManager:
    def __init__(self):
        self._fix_ssl_cert_env()

        try:
            env_path = _project_root() / ".env"
            if env_path.exists():
                load_dotenv(str(env_path))
        except Exception:
            pass

        self.llm = self._init_llm()

        # ✅ 무조건 app/data 기준
        self.data_dir = _project_root() / "app" / "data"
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.history_file = self.data_dir / "story_history.json"
        self.global_setting_file = self.data_dir / "plot.json"

        print(f"📂 story_history path = {self.history_file}")
        print(f"📂 plot.json path     = {self.global_setting_file}")

    def _fix_ssl_cert_env(self):
        try:
            import certifi
            cafile = certifi.where()
            os.environ["SSL_CERT_FILE"] = cafile
        except Exception:
            pass

    def _init_llm(self) -> Optional["ChatGoogleGenerativeAI"]:
        key = (os.getenv("GOOGLE_API_KEY") or "").strip()
        if not key or ChatGoogleGenerativeAI is None:
            return None
        try:
            return ChatGoogleGenerativeAI(model="gemini-2.5-flash")
        except Exception:
            return None

    def _safe_json(self, raw: str) -> Dict[str, Any]:
        if not raw:
            return {}
        raw = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def _summarize_world_to_lines(self, world_text: str) -> List[str]:
        text = (world_text or "").strip()
        if not text:
            return []

        if self.llm is None:
            return _pick_summary(text)

        prompt = f"""
너는 웹소설 편집자다.
아래 '세계관 설정' 원문을 읽고, 핵심 규칙/배경/제약/톤을 6~10줄로 요약해라.
반드시 JSON으로만 반환해라.

형식:
{{
  "summary": ["...", "..."]
}}

세계관 원문:
{text[:6000]}
"""
        try:
            res = self.llm.invoke(prompt)
            data = self._safe_json(getattr(res, "content", "") or "")
            summary = data.get("summary")
            if isinstance(summary, list):
                out = []
                for s in summary:
                    s = _safe_str(s).strip()
                    if s:
                        out.append(s)
                return out[:10]
        except Exception:
            pass

        return _pick_summary(text)

    def update_global_settings(self, text: str) -> Dict[str, Any]:
        incoming = (text or "").strip()
        if not incoming:
            return {"status": "error", "message": "empty text"}

        plot = _read_json(self.global_setting_file, default={})
        if not isinstance(plot, dict):
            plot = {}

        genre = plot.get("genre", [])
        characters = plot.get("characters", [])

        if not isinstance(genre, list):
            genre = []
        if not isinstance(characters, list):
            characters = []

        prev_raw = _safe_str(plot.get("world_raw", "")).strip()
        if prev_raw:
            merged_raw = prev_raw + "\n\n" + incoming
        else:
            merged_raw = incoming

        summary_lines = self._summarize_world_to_lines(merged_raw)

        plot["world_raw"] = merged_raw
        plot["summary"] = summary_lines
        plot["genre"] = genre
        plot["characters"] = characters

        _write_json(self.global_setting_file, plot)
        return {"status": "success", "data": plot}

    def summarize_and_save(self, episode_no: int, full_text: str) -> Dict[str, Any]:
        if not full_text.strip():
            return {"status": "error", "message": "empty text"}

        history = _read_json(self.history_file, default={})
        prev_flow = history.get(str(episode_no - 1), {}).get("story_flow", "")

        if self.llm is None:
            result = {
                "title": f"{episode_no}화",
                "summary": full_text[:300],
                "story_flow": prev_flow,
            }
        else:
            prompt = f"""
너는 웹소설 편집자다.
아래 원고를 요약하여 JSON으로 반환하라.
키: title, summary, story_flow

이전 흐름:
{prev_flow}

원고:
{full_text[:3500]}
"""
            try:
                res = self.llm.invoke(prompt)
                result = self._safe_json(getattr(res, "content", "") or "")
            except Exception:
                result = {}

        if not result:
            result = {
                "title": f"{episode_no}화",
                "summary": "요약 실패",
                "story_flow": prev_flow,
            }

        history[str(episode_no)] = {
            "episode_no": episode_no,
            "title": result.get("title", ""),
            "summary": result.get("summary", ""),
            "story_flow": result.get("story_flow", ""),
        }

        _write_json(self.history_file, history)
        return {"status": "success", "data": history[str(episode_no)]}

    def extract_facts(self, episode_no, full_text, story_state):
        return {"episode_no": episode_no, "events": [], "characters": [], "state_changes": {}}


# -------------------------------------------------------------------
# ✅ IngestionService에서 찾는 함수 이름으로 "연결"해주는 래퍼
#    (기존 import: from ...extracter import update_world_setting 유지 가능)
# -------------------------------------------------------------------
_PLOT_MANAGER_SINGLETON: Optional[PlotManager] = None


def _get_plot_manager() -> PlotManager:
    global _PLOT_MANAGER_SINGLETON
    if _PLOT_MANAGER_SINGLETON is None:
        _PLOT_MANAGER_SINGLETON = PlotManager()
    return _PLOT_MANAGER_SINGLETON


def update_world_setting(text: str) -> Dict[str, Any]:
    return _get_plot_manager().update_global_settings(text)
