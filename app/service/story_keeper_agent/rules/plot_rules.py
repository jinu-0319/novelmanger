from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional as Opt

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from app.core.llm import get_llm

from .check_consistency import Issue, extract_original_sentence, pick_best_anchor

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


def _get_history(story_state: Dict[str, Any]) -> Dict[str, Any]:
    h = story_state.get("history", {})
    return h if isinstance(h, dict) else {}


def _is_leaf(v: Any) -> bool:
    return isinstance(v, (str, int, float, bool)) or v is None


def _stringify(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v).strip()


def _history_value_anchors(history: Dict[str, Any], max_episodes: int = 15) -> List[str]:
    """
    story_history.json 구조 ({episode_no: {title, summary, story_flow}}) 또는
    구 구조 ({summary: [...], ...}) 모두 지원.
    최근 max_episodes 화만 포함 (롤링 요약).
    """
    anchors: List[str] = []

    # ── 신 구조: 키가 숫자 문자열인 에피소드 dict ──────────────────────────
    episode_entries = []
    for k, v in history.items():
        if isinstance(k, str) and k.isdigit() and isinstance(v, dict):
            episode_entries.append((int(k), v))

    if episode_entries:
        # 최근 max_episodes 화만 취함
        episode_entries.sort(key=lambda x: x[0])
        recent = episode_entries[-max_episodes:]
        for _, ep in recent:
            for field in ("summary", "story_flow", "title"):
                val = ep.get(field)
                if isinstance(val, str) and val.strip():
                    anchors.append(val.strip())
    else:
        # ── 구 구조: 플랫 리스트 키 ────────────────────────────────────────
        for k in ("summary", "important_parts", "highlights", "key_points", "events"):
            v = history.get(k)
            if isinstance(v, list):
                for x in v[:40]:
                    if _is_leaf(x):
                        s = _stringify(x)
                        if s and s != "null":
                            anchors.append(s)
            elif _is_leaf(v):
                s = _stringify(v)
                if s and s != "null":
                    anchors.append(s)

    uniq: List[str] = []
    seen: set = set()
    for a in anchors:
        if a in seen:
            continue
        seen.add(a)
        uniq.append(a)

    return uniq[:160]


def _plot_value_anchors(plot_config: Dict[str, Any]) -> List[str]:
    anchors: List[str] = []
    if not isinstance(plot_config, dict):
        return anchors

    for k in (
        "summary",
        "important_parts",
        "theme",
        "premise",
        "constraints",
        "rules",
        "major_events",
        "forbidden",
        "must",
        "events",
        "highlights",
        "key_points",
    ):
        v = plot_config.get(k)
        if isinstance(v, list):
            for x in v[:80]:
                if _is_leaf(x):
                    s = _stringify(x)
                    if s and s != "null":
                        anchors.append(s)
        elif _is_leaf(v):
            s = _stringify(v)
            if s and s != "null":
                anchors.append(s)
        elif isinstance(v, dict):
            for vv in list(v.values())[:80]:
                if _is_leaf(vv):
                    s = _stringify(vv)
                    if s and s != "null":
                        anchors.append(s)

    uniq: List[str] = []
    seen = set()
    for a in anchors:
        if a in seen:
            continue
        seen.add(a)
        uniq.append(a)

    return uniq[:200]


_REGRESSION_NOTE = (
    "회귀/빙의/환생물: 전이(회귀·빙의·환생) 시점 이후 타임라인은 새로운 흐름으로 허용한다. "
    "전생·전이 이전 기억으로 인한 행동 변화, 미래 지식 활용, 이전 삶과 다른 선택은 플롯 오류가 아니다. "
    "'의식이 끊어지는 순간'을 전이 시점으로 간주하며, 전이 직후 장소·신체 상태 변화는 연속 묘사로 본다. "
    "단, 같은 타임라인 내에서 명백히 앞뒤 순서가 뒤바뀌는 배타 충돌만 이슈로 잡을 것."
)

GENRE_NOTES: Dict[str, str] = {
    "회귀": _REGRESSION_NOTE,
    "빙의": _REGRESSION_NOTE,
    "환생": _REGRESSION_NOTE,
    "로판": "로맨스 판타지: 귀족 사회 이동·정치·마법 사건은 장르 관습상 허용 범위가 넓음. 명백한 모순만 이슈로.",
    "판타지": "판타지: 마법·전투·이능력 관련 사건 전개는 세계관 설정 기준으로만 판단. 현실 개연성 적용 금지.",
    "무협": "무협: 내공·무공에 의한 급격한 능력 변화나 장거리 이동은 허용. 명백한 시간선 배타 충돌만 이슈로.",
    "현대": "현대물: 능력자·비밀 조직 관련 사건 전개는 작품 설정 기준으로만 판단.",
    "sf": "SF: 공간 이동·타임라인 분기·AI 행동은 세계관 설정 기준. 현재 상식으로 재단하지 마라.",
}


def _build_genre_note(genre: str) -> str:
    g = (genre or "").strip().lower()
    for key, note in GENRE_NOTES.items():
        if key in g:
            return f"\n[장르별 주의사항]\n{note}\n"
    return ""


def check_plot_consistency(
    episode_facts: Dict[str, Any],
    plot_config: Dict[str, Any],
    story_state: Dict[str, Any],
    genre: str = "",
) -> List[Issue]:
    full_text = _get_full_text(episode_facts)
    if not full_text:
        return []

    history = _get_history(story_state)

    anchors: List[str] = []
    anchors += _history_value_anchors(history)
    anchors += _plot_value_anchors(plot_config)

    if not anchors:
        return []

    llm = get_llm(temperature=0.2)
    genre_note = _build_genre_note(genre)

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
너는 '원고-플롯/연속성 충돌 피드백 작성자'다.
외부 상식/현실/역사/고증 판단은 절대 하지 않는다.
오직 anchors(확정 사실 문장)와 원고의 '정면 부정/배타 충돌'만 뽑는다.
{genre_note}
[이슈 생성 기준]
- 동시에 성립할 수 없는 '확정 서술' 충돌만 이슈로 만든다.
- 애매한 표현(가능/추측/비유/꿈/회상/과장)은 제외.
- anchors에 없는 정보는 오류가 아니다.

[중요: anchor_sentence 필드]
- anchor_sentence는 검증을 위해 필요하니 반드시 채워라.
- 단, reason에서는 anchor_sentence/anchors를 절대 언급하지 마라.

[절대 금지 단어/표현]
- reason에서 아래 단어를 절대 쓰지 마라:
  anchors, 앵커, 설정, 기준, 룰, 판정, 비교, 명시, ~에서는, ~기준으로
- "anchors에 없어서 오류" 같은 말 금지.

[시간선 관련 규칙]
- 기존 시간 순서를 유지한 채 이동/도착/대기 등 중간 단계가 상세화되어 추가된 경우는 오류로 보지 마라.
- 의식이 끊김/깨어남, 장면 전환, 시간 점프(서술 생략), 회상/요약 같은 '서술 방식' 차이는 오류로 보지 마라.
- "앞뒤가 뒤바뀌었다/동시에 발생했다"처럼 배타 충돌이 확정된 경우만 오류.
- 회귀/전생/빙의에서는 '의식이 끊어지는 순간'을 회귀 시점으로 간주한다.
  회귀 이후 상태 변화(아기가 됨/다른 장소/안겨있음/묶여있음)는 회귀 직후 연속 묘사로 보고 시간선 오류로 잡지 마라.

[출력(JSON only)]
{{{{ "issues": [ {{{{
  "type": "plot|continuity",
  "title": "...",
  "anchor_sentence": "...",
  "sentence": "...",
  "reason": "...",
  "severity": "low|medium|high"
}}}} ] }}}}
없으면:
{{{{ "issues": [] }}}}

[reason 작성 규칙]
- '작가에게 말하듯' 자연어 1~2문장.
- "이 문장 때문에 무엇이 모순처럼 보이는지 / 독자가 왜 헷갈리는지"만 설명.
- 시스템 설명(설정/anchors/키/근거/anchor_sentence) 절대 언급하지 말 것.
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
            type="plot",
            title="플롯 룰 검사 실패",
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

        # 1) anchor 검증 (근거 필터)
        anchor_hint = str(it.get("anchor_sentence") or "").strip()
        anchor_norm = pick_best_anchor(anchors, anchor_hint)
        if not anchor_norm or anchor_norm not in anchors:
            continue

        # 2) 원문 sentence 강제
        hint_sentence = str(it.get("sentence") or "").strip()
        original_sentence = extract_original_sentence(full_text, hint_sentence)
        if not original_sentence:
            continue

        reason = str(it.get("reason") or "").strip()
        if not reason:
            continue

        sev = str(it.get("severity") or "medium").lower()
        if sev not in ("low", "medium", "high"):
            sev = "medium"

        t = str(it.get("type") or "plot").lower()
        if t not in ("plot", "continuity"):
            t = "plot"

        out.append(Issue(
            type=t,
            title=str(it.get("title") or "플롯/연속성 충돌"),
            sentence=original_sentence,
            reason=reason,
            severity=sev,
        ))

    return out
