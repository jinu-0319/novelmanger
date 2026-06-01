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


def _is_leaf(v: Any) -> bool:
    return isinstance(v, (str, int, float, bool)) or v is None


def _stringify(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v).strip()


def _normalize_character_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(cfg, dict):
        return {"characters": []}
    chars = cfg.get("characters")
    return {"characters": chars if isinstance(chars, list) else []}


def _pick_character_anchor_pool(character_config: Dict[str, Any]) -> List[str]:
    chars = character_config.get("characters", [])
    if not isinstance(chars, list):
        return []

    anchors: List[str] = []
    for i, ch in enumerate(chars[:12]):
        if not isinstance(ch, dict):
            continue

        name = ch.get("name")
        name_tag = str(name).strip() if isinstance(name, str) and name.strip() else f"idx{i}"

        hard_keys = [
            "name", "age", "gender", "age_gender",
            "birth", "death", "is_alive",
            "job_status", "rank", "status", "identity",
            "injury", "missing_parts", "scar", "disability",
        ]

        picked = {}
        for k in hard_keys:
            if k in ch and _is_leaf(ch.get(k)):
                picked[k] = ch.get(k)

        if not picked:
            leaf_count = 0
            for k, v in ch.items():
                if leaf_count >= 8:
                    break
                if _is_leaf(v):
                    picked[k] = v
                    leaf_count += 1

        for k, v in picked.items():
            s = _stringify(v)
            if not s or s == "null":
                continue
            anchors.append(f"{name_tag} - {k}: {s}")

    if len(anchors) > 180:
        anchors = anchors[:180]
    return anchors


_REGRESSION_NOTE = (
    "회귀/빙의/환생물: 전이(회귀·빙의·환생) 이후 인물의 성격·말투·행동 패턴 변화는 오류가 아니다. "
    "전생·전이 이전 기억 보유로 인해 원래 인물과 달리 행동하는 것도 충돌로 보지 마라. "
    "단, 전이와 무관하게 같은 회차 내에서 설정된 외형·신체적 사실(나이·성별·부상 등)은 "
    "그대로 유지되므로 해당 충돌은 이슈로 잡을 것."
)

GENRE_NOTES: Dict[str, str] = {
    "회귀": _REGRESSION_NOTE,
    "빙의": _REGRESSION_NOTE,
    "환생": _REGRESSION_NOTE,
    "로판": "로맨스 판타지: 귀족·마법사 사회의 인물 역할(신분, 계급, 직책)은 세계관 내 설정 기준으로만 판단.",
    "판타지": "판타지: 초인적 능력, 변신, 이능력은 세계관 설정 기준. 현실 인체 한계로 판단하지 마라.",
    "무협": "무협: 내공 수련으로 인한 신체 능력 향상은 허용. 현실 기준으로 캐릭터 능력을 판단하지 마라.",
    "현대": "현대물: 능력자·초능력자 설정은 작품 내 규칙 기준. 현실 상식으로 인물 행동을 재단하지 마라.",
    "sf": "SF: 사이보그·AI·클론 등 미래 인물 설정은 세계관 내 정의 기준으로만 판단.",
}


def _build_genre_note(genre: str) -> str:
    g = (genre or "").strip().lower()
    for key, note in GENRE_NOTES.items():
        if key in g:
            return f"\n[장르별 주의사항]\n{note}\n"
    return ""


def check_character_consistency(
    episode_facts: Dict[str, Any],
    character_config: Dict[str, Any],
    story_state: Dict[str, Any],
    genre: str = "",
) -> List[Issue]:
    _ = story_state
    full_text = _get_full_text(episode_facts)
    if not full_text:
        return []

    cfg = _normalize_character_config(character_config)
    anchors = _pick_character_anchor_pool(cfg)
    if not anchors:
        return []

    llm = get_llm(temperature=0.2)
    genre_note = _build_genre_note(genre)

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
너는 '캐릭터 설정 충돌 피드백 작성자'다. 오직 anchors와 원고만 본다.
외부 상식/심리 추론은 절대 하지 않는다.
{genre_note}
[이슈 생성 기준]
- 동시에 성립 불가한 '확정 서술' 충돌만 이슈로 만든다.
- 애매한 표현(가능성/추측/비유/꿈/회상)은 이슈로 만들지 마라.
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
- "이 문장 때문에 무엇이 모순처럼 보이는지 / 독자가 왜 헷갈리는지"만 설명.
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
            type="character",
            title="캐릭터 룰 검사 실패",
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
            type="character",
            title=str(it.get("title") or "캐릭터 설정 충돌"),
            sentence=sentence,
            reason=reason,
            severity=sev,
        ))

    return out
