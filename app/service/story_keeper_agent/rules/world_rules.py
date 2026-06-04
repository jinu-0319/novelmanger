# world_rules.py
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional as Opt

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from app.core.llm import get_llm

from .check_consistency import Issue

load_dotenv()

_CODEBLOCK_JSON_RE = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)
_ISSUES_JSON_RE = re.compile(r'(\{[^{}]*"issues"\s*:\s*\[.*?\][^{}]*\})', re.DOTALL)
_ANY_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _safe_json_load(s: str) -> Opt[Dict[str, Any]]:
    try:
        obj = json.loads(s)
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def _extract_json(text: str) -> Opt[Dict[str, Any]]:
    if not isinstance(text, str):
        return None
    t = text.strip()

    m = _CODEBLOCK_JSON_RE.search(t)
    if m:
        obj = _safe_json_load(m.group(1))
        if obj is not None:
            return obj

    m = _ISSUES_JSON_RE.search(t)
    if m:
        obj = _safe_json_load(m.group(1))
        if obj is not None:
            return obj

    m = _ANY_JSON_RE.search(t)
    if m:
        obj = _safe_json_load(m.group(0))
        if obj is not None:
            return obj

    return None


def _get_full_text(episode_facts: Dict[str, Any]) -> str:
    raw = episode_facts.get("raw_text")
    return raw if isinstance(raw, str) and raw.strip() else ""


def _build_episode_summary(episode_facts: Dict[str, Any]) -> str:
    """extract_facts 결과를 프롬프트용 한 줄 요약으로 변환"""
    parts: List[str] = []
    characters = episode_facts.get("characters") or []
    if isinstance(characters, list) and characters:
        char_strs = []
        for c in characters[:8]:
            if not isinstance(c, dict):
                continue
            name = c.get("name", "?")
            state = c.get("state", "")
            loc = c.get("location", "")
            desc = f"{name}: {state}" + (f" / {loc}" if loc and loc != "null" else "")
            char_strs.append(desc)
        if char_strs:
            parts.append("등장인물 상태 — " + ", ".join(char_strs))
    events = episode_facts.get("events") or []
    if isinstance(events, list) and events:
        parts.append("주요 사건 — " + " / ".join(str(e) for e in events[:5]))
    state_changes = episode_facts.get("state_changes") or {}
    if isinstance(state_changes, dict) and state_changes:
        sc = [f"{k}: {v}" for k, v in list(state_changes.items())[:5]]
        parts.append("변화 — " + " / ".join(sc))
    return "\n".join(parts)


def _extract_world_from_plot(plot_config: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(plot_config, dict):
        return {}
    for k in ("world", "world_setting", "worldSettings", "settings", "setting", "global"):
        v = plot_config.get(k)
        if isinstance(v, dict) and v:
            return v
    return {}


def _is_leaf(v: Any) -> bool:
    return isinstance(v, (str, int, float, bool)) or v is None


def _stringify(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v).strip()


def _build_value_anchors(obj: Any) -> List[str]:
    anchors: List[str] = []

    def walk(x: Any):
        if _is_leaf(x):
            s = _stringify(x)
            if s and s != "null":
                anchors.append(s)
            return

        if isinstance(x, dict):
            for _, v in list(x.items())[:80]:
                walk(v)
            return

        if isinstance(x, list):
            for v in x[:80]:
                walk(v)
            return

    walk(obj)

    anchors = [a for a in anchors if isinstance(a, str) and a.strip()]
    if len(anchors) > 160:
        anchors = anchors[:160]
    return anchors


_REGRESSION_NOTE = (
    "회귀/빙의/환생물: 주인공이 과거 시점·다른 육체·다른 세계로 전이된 이후의 설정 변화는 "
    "새로운 타임라인/새 자아로 허용한다. "
    "전생·전이 이전 기억을 보유하거나 원래 인물과 행동 방식이 달라지는 것은 오류가 아니다. "
    "세계관 자체(지리·마법·제도 등)는 전이 이후에도 동일하게 유지되므로, "
    "세계관 내 규칙과의 충돌만 이슈로 잡을 것."
)

GENRE_NOTES: Dict[str, str] = {
    "회귀": _REGRESSION_NOTE,
    "빙의": _REGRESSION_NOTE,
    "환생": _REGRESSION_NOTE,
    "로판": "로맨스 판타지: 마법·귀족 사회 설정을 현실 기준으로 판단하지 마라. 세계관 내 규칙만 기준으로 삼을 것.",
    "판타지": "판타지: 마법·몬스터·이능력은 현실 물리 법칙 예외. 세계관 내 규칙과의 충돌만 이슈로 잡을 것.",
    "무협": "무협: 내공·무공 설정은 세계관 내 설정만 기준. 현실 인체 한계로 판단하지 마라.",
    "현대": "현대물: 현실 세계와 다른 허구적 설정(능력자·기업 등)은 작품 내 규칙 기준으로만 판단.",
    "sf": "SF: 미래 기술·우주 설정은 현재 과학 상식이 아닌 작품 내 설정으로만 판단.",
}


def _build_genre_note(genre: str) -> str:
    g = (genre or "").strip().lower()
    for key, note in GENRE_NOTES.items():
        if key in g:
            return f"\n[장르별 주의사항]\n{note}\n"
    return ""


def check_world_consistency(
    episode_facts: Dict[str, Any],
    plot_config: Dict[str, Any],
    genre: str = "",
) -> List[Issue]:
    full_text = _get_full_text(episode_facts)
    if not full_text:
        return []

    world = _extract_world_from_plot(plot_config)
    if not world:
        return []

    anchors = _build_value_anchors(world)
    if not anchors:
        return []

    llm = get_llm(temperature=0.2)
    genre_note = _build_genre_note(genre)

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
너는 '원고 피드백 작성자'다. 오직 주어진 anchors(확정 사실)와 원고만 본다.
외부 상식/현실/역사/고증 판단은 절대 하지 않는다.
{genre_note}
[이슈 생성 기준]
- 동시에 성립할 수 없는 '확정 서술' 충돌만 이슈로 만든다.
- 애매한 표현(가능성/추측/비유/꿈/회상/과장)은 이슈로 만들지 마라.
- anchors에 없는 정보는 오류가 아니다.

[절대 금지 단어/표현]
- reason에서 아래 단어를 절대 쓰지 마라:
  anchors, 앵커, 설정, 기준, 룰, 판정, 비교, 명시, ~에서는, ~기준으로
- "anchors에 없어서 오류" 같은 말 금지.

[출력(JSON only)]
{{{{ "issues": [ {{ "title": "...", "sentence": "...", "reason": "...", "severity": "low|medium|high" }} ] }}}}
없으면:
{{{{ "issues": [] }}}}

[reason 작성 규칙]
- '작가에게 말하듯' 자연어 1~2문장.
- "이 문장 때문에 독자가 무엇을 헷갈리는지 / 왜 동시에 성립이 어려운지"만 설명.
- 시스템 설명(설정/anchors/키/근거) 절대 언급하지 말 것.
"""),
        ("human", """[anchors]
{anchors}

[이번 회차 확정 사실]
{episode_summary}

[manuscript]
{full_text}
"""),
    ])

    episode_summary = _build_episode_summary(episode_facts)

    try:
        raw = (prompt | llm).invoke({
            "anchors": json.dumps(anchors, ensure_ascii=False),
            "episode_summary": episode_summary,
            "full_text": full_text,
            "genre_note": genre_note,
        })
        content = raw.content if hasattr(raw, "content") else str(raw)
        data = _extract_json(content) or {"issues": []}
    except Exception as e:
        return [Issue(
            type="world",
            title="세계관 룰 검사 실패",
            sentence="(원고 전체)",
            reason=f"LLM 호출/파싱 실패: {repr(e)}",
            severity="high",
        )]

    out: List[Issue] = []
    items = data.get("issues", [])
    if not isinstance(items, list):
        items = []

    for it in items:
        if not isinstance(it, dict):
            continue

        sentence = it.get("sentence")
        sentence = sentence.strip() if isinstance(sentence, str) and sentence.strip() else None
        if not sentence:
            continue

        reason = str(it.get("reason") or "").strip()
        if not reason:
            continue

        sev = str(it.get("severity") or "medium").lower()
        if sev not in ("low", "medium", "high"):
            sev = "medium"

        out.append(Issue(
            type="world",
            title=str(it.get("title") or "세계관 충돌"),
            sentence=sentence,
            reason=reason,
            severity=sev,
        ))

    return out
