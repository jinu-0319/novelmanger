"""
app/service/review/router.py — AI 리뷰 엔드포인트

POST /review/analyze
  - 원고 텍스트를 받아 7개 카테고리 점수 + 서술형 피드백 반환
  - LLM: Gemini 2.5 Flash (app/core/llm.py)
  - 장르·플랫폼·태그에 따라 시스템 프롬프트 동적 조정
"""
from __future__ import annotations

import json
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.llm import get_llm
from app.auth.deps import get_current_user_id

router = APIRouter(prefix="/review", tags=["Review"])


# ── 요청 / 응답 스키마 ────────────────────────────────────────────────────────

class WikiItem(BaseModel):
    type: str = ""
    title: str = ""
    description: str = ""


class ReviewRequest(BaseModel):
    text: str
    title: str = ""
    episode_no: int = 1
    genre: str = ""
    platform: str = ""              # 네이버 시리즈 / 카카오페이지 / 문피아 / 노벨피아 등
    tags: list[str] = []            # #대체역사, #현대판타지 등 (선택)
    wiki_context: list[WikiItem] = []


class ScoreDetail(BaseModel):
    story: float        # 스토리
    character: float    # 캐릭터
    tempo: float        # 템포
    style: float        # 문체
    emotion: float      # 감정선
    marketability: float  # 시장성
    world: float        # 세계관


class ReviewResponse(BaseModel):
    overall: float
    scores: ScoreDetail
    sections: dict      # { overall_feedback, strengths, improvements, details }
    error: str | None = None


# ── 프롬프트 기반 (변경 불가) ────────────────────────────────────────────────

_SYSTEM_PROMPT_BASE = """당신은 한국 웹소설·장편소설 전문 편집자이자 AI 리뷰어입니다.
주어진 원고 회차를 읽고 아래 JSON 형식으로 정확히 응답하세요.
점수는 모두 1.0~5.0 범위(소수점 1자리)이며, 각 항목을 독립적으로 평가합니다.

반드시 아래 JSON만 반환하고 다른 텍스트는 포함하지 마세요:

{
  "scores": {
    "story": <float>,
    "character": <float>,
    "tempo": <float>,
    "style": <float>,
    "emotion": <float>,
    "marketability": <float>,
    "world": <float>
  },
  "sections": {
    "overall_feedback": "<2~3문단 전반적인 평가>",
    "strengths": "<강점 2~3가지, 줄바꿈으로 구분>",
    "improvements": "<개선 포인트 2~3가지, 줄바꿈으로 구분>",
    "details": "<구체적인 장면·대사 단위 코멘트 (선택)>"
  }
}

점수 기준:
- 스토리(story): 서사 구조, 전개의 개연성, 회차 내 완결성
- 캐릭터(character): 인물의 입체성, 대사 일관성, 감정 표현
- 템포(tempo): 장면 전환 속도, 독자 집중 유지, 지루함 여부
- 문체(style): 문장 표현력, 어휘 다양성, 가독성
- 감정선(emotion): 감정 몰입도, 독자 공감 유발
- 시장성(marketability): 장르 부합성, 독자층 호소력, 상업성
- 세계관(world): 배경 묘사, 세계관 밀도, 설정의 정합성"""


# ── 장르별 추가 평가 지침 ─────────────────────────────────────────────────────

_GENRE_CRITERIA: dict[str, str] = {
    "회귀": (
        "회귀·환생물 특화: 전생 기억 활용의 자연스러움, 타임라인 인식의 명확성, "
        "회귀 이후 변화된 주인공 행동의 설득력을 스토리·캐릭터 점수에 반영하세요."
    ),
    "빙의": (
        "빙의물 특화: 원래 인물과의 성격 차이 묘사, 빙의 후 적응 과정의 설득력을 "
        "캐릭터·스토리 점수에 반영하세요."
    ),
    "환생": (
        "환생물 특화: 전생 기억과 현재 상황의 대비, 환생 후 성장 서사의 자연스러움을 "
        "스토리·캐릭터 점수에 반영하세요."
    ),
    "로판": (
        "로맨스 판타지 특화: 귀족·궁정 세계관 묘사 밀도, 로맨스 감정선의 설렘 지수, "
        "신분·권력 갈등 표현을 세계관·감정선·시장성 점수에 반영하세요."
    ),
    "판타지": (
        "판타지 특화: 마법·능력 체계의 일관성, 세계관 독창성, 전투 씬 긴장감을 "
        "세계관·스토리 점수에 반영하세요."
    ),
    "무협": (
        "무협 특화: 내공·무공 묘사의 생동감, 강호 의리와 은원 관계의 설득력, "
        "전투 박진감을 스토리·세계관·문체 점수에 반영하세요."
    ),
    "현대": (
        "현대물 특화: 현실감과 공감대 형성, 일상 묘사의 생생함, "
        "현대 독자가 이입할 수 있는 감정선을 감정선·캐릭터 점수에 반영하세요."
    ),
    "sf": (
        "SF 특화: 세계관 설정의 논리적 일관성, 미래·과학 설정의 창의성, "
        "하드 SF와 소프트 SF의 균형을 세계관·스토리 점수에 반영하세요."
    ),
    "스릴러": (
        "스릴러·미스터리 특화: 긴장감 유지 능력, 복선과 반전의 적절한 배치, "
        "몰입도를 저해하는 요소 여부를 템포·스토리 점수에 반영하세요."
    ),
    "로맨스": (
        "로맨스 특화: 두 주인공의 감정 발전 곡선, 설렘 포인트 밀도, "
        "독자가 응원하게 되는 매력 요소를 감정선·캐릭터 점수에 반영하세요."
    ),
    "역사": (
        "역사·대체역사물 특화: 시대 고증의 적절한 활용, 역사적 배경과 허구의 조화, "
        "시대극 특유 문체와 어휘의 완성도를 세계관·문체 점수에 반영하세요."
    ),
}

# ── 플랫폼별 평가 맥락 ────────────────────────────────────────────────────────

_PLATFORM_CONTEXT: dict[str, str] = {
    "네이버 시리즈": (
        "플랫폼 특성(네이버 시리즈): 회차당 적정 분량(2,000~5,000자) 유지 여부와 "
        "회차 말미 클리프행어 강도를 템포·시장성 점수에 반영하세요. "
        "주 독자층은 20~30대 여성입니다."
    ),
    "카카오페이지": (
        "플랫폼 특성(카카오페이지): 1화 도입부 후킹력이 매우 중요한 플랫폼입니다. "
        "기다리면 무료 구조를 고려한 분량과 전개 속도를 템포·시장성에 반영하세요."
    ),
    "문피아": (
        "플랫폼 특성(문피아): 남성 독자 비중이 높고 판타지·무협·현대판타지를 선호합니다. "
        "장문 회차(5,000자 이상)도 일반적이며, 독자 댓글을 유도하는 전개 방식을 "
        "시장성에 반영하세요."
    ),
    "노벨피아": (
        "플랫폼 특성(노벨피아): 아마추어 창작자 중심의 커뮤니티형 플랫폼입니다. "
        "독자 댓글·추천 반응이 연재 방향에 직접 영향을 주며, "
        "장르 다양성이 높고 신인 작가의 실험적 전개를 독자가 수용하는 편입니다. "
        "시장성보다 독창성·팬덤 형성 가능성을 중심으로 평가하세요."
    ),
}

# ── 태그 → 장르 키 매핑 ───────────────────────────────────────────────────────

_TAG_GENRE_MAP: dict[str, str] = {
    "회귀": "회귀", "회귀물": "회귀", "타임리셋": "회귀",
    "빙의": "빙의", "빙의물": "빙의",
    "환생": "환생", "전생": "환생",
    "로판": "로판", "로맨스판타지": "로판", "귀족": "로판",
    "판타지": "판타지", "이세계": "판타지", "마법": "판타지",
    "무협": "무협", "강호": "무협", "내공": "무협",
    "현대판타지": "현대", "현대물": "현대", "현대": "현대",
    "sf": "sf", "사이버펑크": "sf", "우주": "sf",
    "스릴러": "스릴러", "미스터리": "스릴러", "추리": "스릴러",
    "로맨스": "로맨스", "순정": "로맨스",
    "대체역사": "역사", "역사": "역사", "시대극": "역사",
}


# ── 동적 프롬프트 빌더 ─────────────────────────────────────────────────────────

def _infer_genre_key(genre: str, tags: list[str]) -> str:
    """장르 문자열과 태그에서 _GENRE_CRITERIA 키를 추론. 태그 우선순위 낮음."""
    g = (genre or "").strip().lower().replace(" ", "").replace("#", "")
    for key in _GENRE_CRITERIA:
        if key in g:
            return key
    for tag in tags:
        t = tag.strip().lower().replace("#", "").replace(" ", "")
        if t in _TAG_GENRE_MAP:
            return _TAG_GENRE_MAP[t]
        for key in _GENRE_CRITERIA:
            if key in t:
                return key
    return ""


def _infer_platform_key(platform: str) -> str:
    """플랫폼 문자열에서 _PLATFORM_CONTEXT 키를 추론."""
    p = (platform or "").strip()
    for key in _PLATFORM_CONTEXT:
        if key in p:
            return key
    # 약칭 보정
    shortcuts = {"시리즈": "네이버 시리즈", "카카오": "카카오페이지"}
    for short, full in shortcuts.items():
        if short in p:
            return full
    return ""


def _build_system_prompt(genre: str, platform: str, tags: list[str]) -> str:
    """장르·플랫폼·태그를 반영해 동적 시스템 프롬프트 생성.
    _SYSTEM_PROMPT_BASE(한국 웹소설 전문 편집자 페르소나)는 그대로 유지하고
    [장르·플랫폼 특화 지침] 블록을 뒤에 추가한다."""
    additions: list[str] = []

    genre_key = _infer_genre_key(genre, tags)
    if genre_key:
        additions.append(_GENRE_CRITERIA[genre_key])

    platform_key = _infer_platform_key(platform)
    if platform_key:
        additions.append(_PLATFORM_CONTEXT[platform_key])

    if not additions:
        return _SYSTEM_PROMPT_BASE

    return _SYSTEM_PROMPT_BASE + "\n\n[장르·플랫폼 특화 지침]\n" + "\n".join(additions)


# ── 유틸 ──────────────────────────────────────────────────────────────────────

def _build_user_prompt(req: ReviewRequest) -> str:
    parts = []
    if req.title:
        parts.append(f"제목: {req.title}")
    if req.episode_no:
        parts.append(f"회차: 제{req.episode_no}화")
    if req.genre:
        parts.append(f"장르: {req.genre}")
    if req.tags:
        tag_str = " ".join(t if t.startswith("#") else f"#{t}" for t in req.tags[:10])
        parts.append(f"태그: {tag_str}")
    if req.platform:
        parts.append(f"플랫폼: {req.platform}")

    # 위키 컨텍스트 — 캐릭터·세계관 평가 정확도 향상
    if req.wiki_context:
        wiki_lines = [
            f"  - [{item.type}] {item.title}: {item.description}"
            for item in req.wiki_context[:15]
            if item.title
        ]
        if wiki_lines:
            parts.append("\n[소설 설정 기억 — 캐릭터·세계관 평가 시 참고]\n" + "\n".join(wiki_lines))

    parts.append(f"\n--- 원고 ---\n{_sample_text(req.text)}")
    return "\n".join(parts)


def _sample_text(text: str, max_chars: int = 7000) -> str:
    """
    원고 전체를 head + middle + tail로 동적 샘플링.
    max_chars 이내면 전체 반환, 초과 시 앞3000 + 중간1000 + 뒤2000 구조로 요약.
    """
    if len(text) <= max_chars:
        return text
    head = text[:3000]
    mid_start = max(3000, len(text) // 2 - 500)
    mid = text[mid_start:mid_start + 1000]
    tail = text[-2000:]
    return f"{head}\n\n[...중략...]\n\n{mid}\n\n[...중략...]\n\n{tail}"


def _clamp(v: float) -> float:
    return round(max(1.0, min(5.0, float(v))), 1)


def _parse_response(raw: str) -> dict:
    """LLM 응답에서 JSON 추출 (markdown 코드블록 감싸여 있어도 파싱)"""
    cleaned = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    return json.loads(cleaned)


# ── 엔드포인트 ───────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=ReviewResponse)
async def analyze_review(
    req: ReviewRequest,
    _: str = Depends(get_current_user_id),
):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="원고 내용이 비어 있습니다.")

    llm = get_llm(temperature=0.2)

    from langchain_core.messages import SystemMessage, HumanMessage
    system_prompt = _build_system_prompt(req.genre, req.platform, req.tags)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=_build_user_prompt(req)),
    ]

    try:
        response = await llm.ainvoke(messages)
        parsed = _parse_response(response.content)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 서비스 오류: {str(e)}")

    try:
        raw_scores = parsed.get("scores", {})
        scores = ScoreDetail(
            story=         _clamp(raw_scores.get("story",         3.0)),
            character=     _clamp(raw_scores.get("character",     3.0)),
            tempo=         _clamp(raw_scores.get("tempo",         3.0)),
            style=         _clamp(raw_scores.get("style",         3.0)),
            emotion=       _clamp(raw_scores.get("emotion",       3.0)),
            marketability= _clamp(raw_scores.get("marketability", 3.0)),
            world=         _clamp(raw_scores.get("world",         3.0)),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"응답 파싱 오류: {str(e)}")

    vals = [scores.story, scores.character, scores.tempo,
            scores.style, scores.emotion, scores.marketability, scores.world]
    overall = round(sum(vals) / len(vals), 1)

    return ReviewResponse(
        overall=overall,
        scores=scores,
        sections=parsed.get("sections", {}),
    )
