from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

from langchain_core.prompts import ChatPromptTemplate
from app.core.llm import get_llm

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


def _batch_resolve_check(issues: List[Issue], full_text: str) -> Set[int]:
    """
    여러 이슈가 원고 후반에서 해소되었는지 한 번의 LLM 호출로 일괄 확인.
    반환값: '해소된 이슈'의 인덱스 집합 (이 인덱스는 alive 목록에서 제거)
    """
    if not full_text.strip() or not issues:
        return set()

    # sentence 없는 이슈는 건너뜀
    checkable = [(idx, i) for idx, i in enumerate(issues) if i.sentence and i.sentence.strip()]
    if not checkable:
        return set()

    items_text = ""
    for idx, issue in checkable:
        items_text += f"""
---
[ID: {idx}]
- 이슈 제목: {issue.title}
- 문제 문장: {issue.sentence}
- 이슈 이유: {issue.reason}
"""

    llm = get_llm(temperature=0.2)

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
너는 '이슈 후반 해소 검증기'다.
원고 전체를 끝까지 읽고, 각 이슈 문장이 후반에서 명시적으로 정정/해소되었는지 판단한다.

판정 기준:
- 후반에서 명시적으로 정정·해소된 경우만 resolved=true
- 근거 없는 추측 금지. 원고 문장 기반으로만 판단.

출력 JSON only:
{{ "results": {{ "<ID>": {{ "resolved": true|false }} }} }}
"""),
        ("human", """[이슈 목록]
{items}

[원고 전체]
{full_text}
"""),
    ])

    try:
        raw = (prompt | llm).invoke({
            "items": items_text,
            "full_text": full_text,
        })
        content = (raw.content if hasattr(raw, "content") else str(raw)) or ""
        # JSON 파싱
        import re as _re
        m = _re.search(r"\{.*\}", content, _re.DOTALL)
        if not m:
            return set()
        data = json.loads(m.group(0))
        results = data.get("results", {})

        resolved_indices: Set[int] = set()
        for idx, _ in checkable:
            r = results.get(str(idx), {})
            if isinstance(r, dict) and r.get("resolved") is True:
                resolved_indices.add(idx)
        return resolved_indices
    except Exception:
        return set()


def check_consistency(
    *,
    episode_facts: Dict[str, Any],
    plot_config: Dict[str, Any],
    character_config: Dict[str, Any],
    story_state: Dict[str, Any],
    severity_threshold: str = "medium",
    genre: str = "",
) -> List[Dict[str, Any]]:
    from .world_rules import check_world_consistency
    from .character_rules import check_character_consistency
    from .plot_rules import check_plot_consistency

    threshold_rank = _severity_rank(severity_threshold)
    if threshold_rank not in (1, 2, 3):
        threshold_rank = 2

    # ── 3-pass 병렬 실행 ──────────────────────────────────────────────────────
    issues: List[Issue] = []

    def _run_world():
        return check_world_consistency(episode_facts, plot_config, genre=genre)

    def _run_character():
        return check_character_consistency(episode_facts, character_config, story_state, genre=genre)

    def _run_plot():
        return check_plot_consistency(episode_facts, plot_config, story_state, genre=genre)

    tasks = {
        "world": _run_world,
        "character": _run_character,
        "plot": _run_plot,
    }

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fn): name for name, fn in tasks.items()}
        for future in as_completed(futures):
            try:
                result = future.result()
                if isinstance(result, list):
                    issues += result
            except Exception as e:
                task_name = futures[future]
                issues.append(Issue(
                    type=task_name,
                    title=f"{task_name} 검사 실패",
                    sentence="(원고 전체)",
                    reason=f"병렬 실행 중 예외 발생: {repr(e)}",
                    severity="high",
                ))

    full_text = episode_facts.get("raw_text", "") if isinstance(episode_facts, dict) else ""

    # ── 1단계: 기본 필터링 ────────────────────────────────────────────────────
    pre_alive: List[Issue] = []
    for i in issues:
        if _is_failure_issue(i):
            i.severity = "high"
            if not i.sentence:
                i.sentence = "(원고 전체)"
            if not i.reason:
                i.reason = "룰 엔진이 정상적으로 결과를 만들지 못했습니다."
            if _severity_rank(i.severity) >= threshold_rank:
                pre_alive.append(i)
            continue

        if not i.sentence or not i.reason:
            continue

        if _looks_like_non_conflict(i.reason, i.title):
            continue

        if _severity_rank(i.severity) < threshold_rank:
            continue

        pre_alive.append(i)

    # ── 2단계: 배치 해소 검증 (N개 이슈 → LLM 1회 호출) ─────────────────────
    # failure 이슈는 검증 대상에서 제외
    verifiable = [i for i in pre_alive if not _is_failure_issue(i)]
    failures = [i for i in pre_alive if _is_failure_issue(i)]

    resolved_indices = _batch_resolve_check(verifiable, full_text)

    alive: List[Issue] = list(failures)
    for idx, i in enumerate(verifiable):
        if idx not in resolved_indices:
            alive.append(i)

    merged = _merge_same_sentence(alive)
    return [x.to_dict() for x in merged]
