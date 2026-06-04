from __future__ import annotations

import json
import re as _re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

# 원고 최대 전송 길이 (룰 검사 & 배치 검증 공통)
_MAX_MANUSCRIPT_CHARS = 8000
_ANY_JSON_RE = _re.compile(r"\{.*\}", _re.DOTALL)

TYPE_LABELS = {
    "world": "세계관 오류",
    "character": "캐릭터 설정 오류",
    "plot": "플롯 오류",
    "continuity": "연속성 오류",
    "mixed": "복합 오류",
}


@dataclass
class Issue:
    type: str
    title: str
    sentence: Optional[str]
    reason: str
    severity: str = "medium"

    def to_dict(self) -> Dict[str, Any]:
        t = self.type if self.type in TYPE_LABELS else "plot"
        return {
            "type": t,
            "title": self.title,
            "sentence": self.sentence,
            "reason": self.reason,
            "severity": self.severity,
        }


def extract_original_sentence(raw_text: str, hint: str) -> Optional[str]:
    if not isinstance(raw_text, str) or not raw_text.strip():
        return None
    if not isinstance(hint, str) or not hint.strip():
        return None

    candidates: List[str] = []
    for line in raw_text.splitlines():
        s = line.strip()
        if s:
            candidates.append(s)

    if not candidates:
        return None

    hint_tokens = set(hint.split())
    best = None
    best_score = 0

    for c in candidates:
        score = len(hint_tokens & set(c.split()))
        if score > best_score:
            best_score = score
            best = c

    return best


def pick_best_anchor(anchors: List[str], hint: str) -> Optional[str]:
    if not isinstance(anchors, list) or not anchors:
        return None
    if not isinstance(hint, str) or not hint.strip():
        return None

    hint_tokens = set(hint.split())
    best = None
    best_score = 0

    for a in anchors:
        if not isinstance(a, str) or not a.strip():
            continue
        score = len(hint_tokens & set(a.split()))
        if score > best_score:
            best_score = score
            best = a

    return best


def _severity_rank(s: str) -> int:
    s = (s or "").lower().strip()
    if s == "high":
        return 3
    if s == "medium":
        return 2
    if s == "low":
        return 1
    return 2


def _max_severity(a: str, b: str) -> str:
    return a if _severity_rank(a) >= _severity_rank(b) else b


def _is_failure_issue(i: Issue) -> bool:
    return isinstance(i.title, str) and ("검사 실패" in i.title)


def _looks_like_non_conflict(reason: str, title: str) -> bool:
    """
    확정 충돌이 아닌(암시/추정/주의/비교불가/없어서 오류 등) 이슈를 걸러낸다.
    """
    r = (reason or "").lower()
    t = (title or "").lower()

    bad_phrases = [
        "anchors에 없는",
        "앵커에 없는",
        "연결성",
        "부재",
        "고려할 때",
        "배타적이지",
        "직접적 연결",
        "새로운 설정",
        "추가 설정",
        "설정 추가",
        "명시되어 있으나",
        "명시되어 있지만",
        "추론",
        "가능성",
        "주의 필요",
        "비교 불가",
        "충돌은 없음",
        "해당하지 않음",

        # ✅ 여기 추가: '암시/추정/추측' 기반이면 확정 충돌 아님 → 버림
        "암시",
        "추정",
        "추측",
        "아마",
        "같다",
        "같은데",
    ]

    return any(p in r for p in bad_phrases) or any(p in t for p in ["연결성", "추론"])


def _merge_same_sentence(issues: List[Issue]) -> List[Issue]:
    buckets: Dict[str, List[Issue]] = {}
    for it in issues:
        if not it.sentence:
            continue
        key = it.sentence.strip()
        if not key:
            continue
        buckets.setdefault(key, []).append(it)

    merged: List[Issue] = []
    for sentence, items in buckets.items():
        if len(items) == 1:
            merged.append(items[0])
            continue

        type_set: List[str] = []
        for x in items:
            tt = x.type if x.type in TYPE_LABELS else "plot"
            if tt not in type_set:
                type_set.append(tt)

        title = " + ".join(TYPE_LABELS[t] for t in type_set) if type_set else "복합 오류"

        reasons: List[str] = []
        for x in items:
            rr = (x.reason or "").strip()
            if rr and rr not in reasons:
                reasons.append(rr)

        reason = "\n".join(reasons[:3]) if reasons else "원고의 해당 문장이 설정/연속성과 충돌합니다."

        sev = "low"
        for x in items:
            sev = _max_severity(sev, x.severity)

        merged.append(Issue(
            type="mixed",
            title=title,
            sentence=sentence,
            reason=reason,
            severity=sev,
        ))

    return merged


def _batch_verify_unresolved(issues: List[Issue], full_text: str) -> List[bool]:
    """
    여러 이슈를 한 번의 LLM 호출로 일괄 검증.
    기존 _verify_issue_not_resolved_by_later_text 의 N번 호출을 1번으로 줄임.

    반환: issues와 동일 길이의 bool 리스트
      True  → 해소되지 않음 (이슈 유지)
      False → 후반에서 해소됨 (이슈 제거)
    """
    if not full_text.strip() or not issues:
        return [True] * len(issues)

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

    issue_list = [
        {
            "idx": i,
            "title": iss.title or "",
            "sentence": iss.sentence or "",
            "reason": iss.reason or "",
        }
        for i, iss in enumerate(issues)
    ]

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
너는 '이슈 후반 해소 검증기'다.
아래 issues 목록의 각 항목에 대해, 원고를 끝까지 읽고
해당 sentence가 이후 내용에서 명시적으로 정정/해소되는지 판단해라.

판정 기준:
- 후반에서 명시적으로 정정/해소 → resolved: true
- 근거 없이 추측하지 말 것. 원고 문장 기반으로만.

출력 JSON only:
{{ "results": [ {{ "idx": 0, "resolved": true }}, {{ "idx": 1, "resolved": false }}, ... ] }}
"""),
        ("human", """[issues]
{issues_json}

[manuscript]
{manuscript}
"""),
    ])

    try:
        raw = (prompt | llm).invoke({
            "issues_json": json.dumps(issue_list, ensure_ascii=False),
            "manuscript": full_text[:_MAX_MANUSCRIPT_CHARS],
        })
        content = (raw.content if hasattr(raw, "content") else str(raw)) or ""

        m = _ANY_JSON_RE.search(content)
        data: Dict[str, Any] = {}
        if m:
            try:
                data = json.loads(m.group(0))
            except Exception:
                pass

        results_map: Dict[int, bool] = {}
        for r in (data.get("results") or []):
            if isinstance(r, dict) and "idx" in r:
                results_map[int(r["idx"])] = bool(r.get("resolved", False))

        # resolved=True  → 이미 해소됨 → keep=False (제거)
        # resolved=False → 미해소       → keep=True  (유지)
        return [not results_map.get(i, False) for i in range(len(issues))]

    except Exception:
        # LLM 실패 시 보수적으로 전부 유지
        return [True] * len(issues)


def check_consistency(
    *,
    episode_facts: Dict[str, Any],
    plot_config: Dict[str, Any],
    character_config: Dict[str, Any],
    story_state: Dict[str, Any],
    severity_threshold: str = "medium",
) -> List[Dict[str, Any]]:
    from .world_rules import check_world_consistency
    from .character_rules import check_character_consistency
    from .plot_rules import check_plot_consistency

    threshold_rank = _severity_rank(severity_threshold)
    if threshold_rank not in (1, 2, 3):
        threshold_rank = 2

    issues: List[Issue] = []
    issues += check_world_consistency(episode_facts, plot_config)
    issues += check_character_consistency(episode_facts, character_config, story_state)
    issues += check_plot_consistency(episode_facts, plot_config, story_state)

    full_text = episode_facts.get("raw_text", "") if isinstance(episode_facts, dict) else ""

    alive: List[Issue] = []
    candidates: List[Issue] = []  # 배치 검증 대상

    for i in issues:
        if _is_failure_issue(i):
            i.severity = "high"
            if not i.sentence:
                i.sentence = "(원고 전체)"
            if not i.reason:
                i.reason = "룰 엔진이 정상적으로 결과를 만들지 못했습니다."
            if _severity_rank(i.severity) >= threshold_rank:
                alive.append(i)
            continue

        if not i.sentence or not i.reason:
            continue

        if _looks_like_non_conflict(i.reason, i.title):
            continue

        candidates.append(i)

    # 이슈별 개별 LLM 호출(N번) → 단일 배치 호출(1번)
    keep_flags = _batch_verify_unresolved(candidates, full_text)

    for i, keep in zip(candidates, keep_flags):
        if not keep:
            continue
        if _severity_rank(i.severity) < threshold_rank:
            continue
        alive.append(i)

    merged = _merge_same_sentence(alive)
    return [x.to_dict() for x in merged]
