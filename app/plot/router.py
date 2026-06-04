"""
플롯 생성/추천 라우터 — OpenAI GPT-4o 사용

장르·플랫폼·태그를 받아 장르 전문가 관점의 지침을 시스템 프롬프트에 추가합니다.
기본 페르소나('한국 웹소설 전문 스토리 컨설턴트/작가')는 변경하지 않습니다.
"""
import os
import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.deps import get_current_user_id

router = APIRouter(prefix="/plot", tags=["Plot"])


class WikiContextItem(BaseModel):
    type: str = ""
    title: str = ""
    description: str = ""


class PlotRequest(BaseModel):
    content: str                         # 현재 회차 본문 (plain text)
    title: str = ""                      # 소설 제목
    genre: str = ""                      # 장르
    episode_no: int = 1                  # 현재 회차 번호
    mode: str = "recommend"              # "recommend" | "generate"
    platform: str = ""                   # 네이버 시리즈 / 카카오페이지 / 문피아 등 (선택)
    tags: list[str] = []                 # #대체역사, #현대판타지 등 (선택)
    wiki_context: list[WikiContextItem] = []  # 장기 기억 위키


class PlotSuggestion(BaseModel):
    title: str
    summary: str
    detail: str
    mood: str


# ── 장르별 전개 추천 지침 ─────────────────────────────────────────────────────

_GENRE_RECOMMEND_GUIDE: dict[str, str] = {
    "회귀": (
        "회귀물 전개 지침: 주인공의 전생 지식 활용 포인트, 역사 수정 딜레마, "
        "원래 결말을 피하려는 시도와 예상치 못한 변수를 중심으로 제안하세요."
    ),
    "빙의": (
        "빙의물 전개 지침: 빙의 사실 은폐와 노출 위기, "
        "원래 인물과의 감정·관계 차이에서 오는 갈등을 중심으로 제안하세요."
    ),
    "환생": (
        "환생물 전개 지침: 전생 기억과 현재 능력의 상호작용, "
        "전생의 인연이 현생에서 재등장하는 복선을 중심으로 제안하세요."
    ),
    "로판": (
        "로맨스 판타지 전개 지침: 설렘 지수를 높이는 감정선 전환점, "
        "귀족 정치·음모와 로맨스의 교차, 신분 갈등 해소 장면을 중심으로 제안하세요."
    ),
    "판타지": (
        "판타지 전개 지침: 마법·능력 성장 단계, 세계관 핵심 비밀 해금 타이밍, "
        "주요 적대 세력과의 갈등 고조를 중심으로 제안하세요."
    ),
    "무협": (
        "무협 전개 지침: 내공·무공 돌파 계기, 강호 세력 간 은원 전개, "
        "의리와 복수의 갈림길, 숨겨진 고수 등장 시점을 중심으로 제안하세요."
    ),
    "현대": (
        "현대물 전개 지침: 일상의 균열과 비일상적 사건의 충돌, "
        "현실적 공감대를 잃지 않는 선에서의 갈등 심화를 중심으로 제안하세요."
    ),
    "sf": (
        "SF 전개 지침: 세계관 설정의 논리적 파장(기술·사건의 2차 영향), "
        "인류·AI·세력 간 이념 충돌, 반전 복선을 중심으로 제안하세요."
    ),
    "스릴러": (
        "스릴러·미스터리 전개 지침: 긴장감 정점 타이밍, 반전 복선의 자연스러운 배치, "
        "독자가 눈치채지 못할 단서 심기를 중심으로 제안하세요."
    ),
    "로맨스": (
        "로맨스 전개 지침: 두 인물의 감정 발전 단계, 오해와 화해의 설렘 포인트, "
        "독자가 응원하게 만드는 계기를 중심으로 제안하세요."
    ),
    "역사": (
        "역사·대체역사 전개 지침: 실제 역사 분기점의 허구적 변형, "
        "시대 고증과 허구의 균형, 역사적 인물과의 교차를 중심으로 제안하세요."
    ),
}

_GENRE_GENERATE_GUIDE: dict[str, str] = {
    "회귀": (
        "회귀물 플롯 생성 지침: 전형적인 '모든 것을 아는 주인공' 클리셰를 피하고, "
        "회귀해도 해결 못 하는 근본적 갈등이나 예상치 못한 변수를 포함한 아이디어를 제안하세요."
    ),
    "빙의": (
        "빙의물 플롯 생성 지침: 단순한 빙의체 이용 성공담보다, "
        "정체성 혼란·원래 인물과의 충돌·감정적 딜레마가 있는 독창적 아이디어를 제안하세요."
    ),
    "로판": (
        "로맨스 판타지 플롯 생성 지침: 귀족 정치와 로맨스가 교차하는 구조, "
        "상대역이 단순 완벽남이 아닌 결함 있는 매력을 가진 설정을 포함해 제안하세요."
    ),
    "판타지": (
        "판타지 플롯 생성 지침: '선택받은 자' 클리셰를 비틀거나, "
        "세계관 내 독창적인 마법·능력 체계를 활용한 아이디어를 제안하세요."
    ),
    "무협": (
        "무협 플롯 생성 지침: 단순 복수극보다 강호의 구조적 모순이나 "
        "의리와 이익의 충돌, 예상 밖의 스승·적 관계를 담은 아이디어를 제안하세요."
    ),
    "현대": (
        "현대물 플롯 생성 지침: 현실 공감대를 유지하면서도 "
        "독자가 경험하지 못한 상황(직업·사건·관계)을 신선하게 그리는 아이디어를 제안하세요."
    ),
    "sf": (
        "SF 플롯 생성 지침: 기술적 설정이 단순 배경이 아닌 핵심 갈등 원인이 되고, "
        "인간성·윤리·생존이 교차하는 독창적 아이디어를 제안하세요."
    ),
    "스릴러": (
        "스릴러 플롯 생성 지침: 독자가 예측하지 못할 반전의 씨앗을 초반부터 심고, "
        "긴장감이 회차 단위로 고조되는 구조의 아이디어를 제안하세요."
    ),
    "역사": (
        "역사·대체역사 플롯 생성 지침: 실제 역사 사건의 '만약에'를 탐구하거나, "
        "알려지지 않은 역사 틈새를 허구로 채우는 독창적 아이디어를 제안하세요."
    ),
}

# ── 플랫폼별 전개 제약 ─────────────────────────────────────────────────────────

_PLATFORM_PLOT_CONTEXT: dict[str, str] = {
    "네이버 시리즈": (
        "네이버 시리즈 고려: 각 제안에 '회차 말미 클리프행어 포인트'를 명시하고, "
        "20~30대 여성 독자의 공감을 끌 수 있는 감정선을 포함하세요."
    ),
    "카카오페이지": (
        "카카오페이지 고려: 1화~3화 무료 구간에 독자를 붙잡을 강력한 후킹 요소를 "
        "전개 제안의 초반부에 반드시 포함하세요."
    ),
    "문피아": (
        "문피아 고려: 독자 댓글을 유도할 수 있는 '논란 포인트'나 '응원/분노' 감정을 "
        "자극하는 전개 요소를 포함하세요. 장문 전개도 허용됩니다."
    ),
    "노벨피아": (
        "노벨피아 고려: 아마추어 창작자·커뮤니티 독자 중심 플랫폼입니다. "
        "독자 댓글과 추천을 유도할 수 있는 독창적 전개와 실험적 아이디어를 "
        "적극적으로 포함하세요. 팬덤 형성을 위한 개성 있는 캐릭터 묘사를 강조하세요."
    ),
}

# ── 태그 → 장르 키 매핑 ───────────────────────────────────────────────────────

_TAG_GENRE_MAP: dict[str, str] = {
    "회귀": "회귀", "회귀물": "회귀", "타임리셋": "회귀",
    "빙의": "빙의", "빙의물": "빙의",
    "환생": "환생", "전생": "환생",
    "로판": "로판", "로맨스판타지": "로판",
    "판타지": "판타지", "이세계": "판타지",
    "무협": "무협", "강호": "무협",
    "현대판타지": "현대", "현대물": "현대", "현대": "현대",
    "sf": "sf", "사이버펑크": "sf",
    "스릴러": "스릴러", "미스터리": "스릴러", "추리": "스릴러",
    "대체역사": "역사", "역사": "역사", "시대극": "역사",
}


# ── 헬퍼 ──────────────────────────────────────────────────────────────────────

def _infer_genre_key(genre: str, tags: list[str], guide_dict: dict) -> str:
    g = (genre or "").strip().lower().replace(" ", "").replace("#", "")
    for key in guide_dict:
        if key in g:
            return key
    for tag in tags:
        t = tag.strip().lower().replace("#", "").replace(" ", "")
        if t in _TAG_GENRE_MAP:
            return _TAG_GENRE_MAP[t]
        for key in guide_dict:
            if key in t:
                return key
    return ""


def _infer_platform_key(platform: str) -> str:
    p = (platform or "").strip()
    for key in _PLATFORM_PLOT_CONTEXT:
        if key in p:
            return key
    shortcuts = {"시리즈": "네이버 시리즈", "카카오": "카카오페이지"}
    for short, full in shortcuts.items():
        if short in p:
            return full
    return ""


def _get_async_openai_client():
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _parse_suggestions(raw: str) -> list[dict]:
    """LLM JSON 응답 파싱 (마크다운 포함 방어)"""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
    except Exception:
        pass
    return []


def _build_wiki_str(wiki_context: list[WikiContextItem]) -> str:
    if not wiki_context:
        return ""
    lines = [
        f"  - [{item.type}] {item.title}: {item.description}"
        for item in wiki_context[:12]
        if item.title
    ]
    return ("\n[소설 설정 기억]\n" + "\n".join(lines)) if lines else ""


def _build_genre_tag_str(genre: str, tags: list[str]) -> str:
    """장르 + 태그를 하나의 표시용 문자열로 조합."""
    parts = []
    if genre:
        parts.append(genre)
    if tags:
        parts.extend(t if t.startswith("#") else f"#{t}" for t in tags[:8])
    return " ".join(parts)


# ── 엔드포인트 ───────────────────────────────────────────────────────────────

@router.post("/suggest")
async def suggest_plot(
    req: PlotRequest,
    _: str = Depends(get_current_user_id),
):
    """현재 내용을 분석해 다음 전개 방향을 3가지 추천"""
    try:
        client = _get_async_openai_client()

        genre_tag_str = _build_genre_tag_str(req.genre, req.tags)
        content_preview = req.content[:2000] if req.content else "(내용 없음)"
        wiki_str = _build_wiki_str(req.wiki_context)

        # 장르·플랫폼 특화 지침 조립
        extra_lines: list[str] = []
        genre_key = _infer_genre_key(req.genre, req.tags, _GENRE_RECOMMEND_GUIDE)
        if genre_key:
            extra_lines.append(_GENRE_RECOMMEND_GUIDE[genre_key])
        platform_key = _infer_platform_key(req.platform)
        if platform_key:
            extra_lines.append(_PLATFORM_PLOT_CONTEXT[platform_key])
        extra_block = ("\n\n[장르·플랫폼 특화 지침]\n" + "\n".join(extra_lines)) if extra_lines else ""

        system_prompt = (
            "당신은 한국 웹소설 전문 스토리 컨설턴트입니다.\n"
            "작가의 현재 원고를 분석하여 다음 전개 방향을 3가지 제안하세요.\n"
            "각 제안은 현재 분위기와 캐릭터의 흐름을 자연스럽게 이어가면서도 독자의 흥미를 끄는 방향이어야 합니다.\n"
            "소설 설정 기억이 제공된 경우, 반드시 그 설정과 일관성을 유지하세요.\n"
            "\n반드시 아래 JSON 배열 형식으로만 답변하세요:\n"
            "[\n"
            "  {\n"
            '    "title": "전개 방향 제목 (10자 이내)",\n'
            '    "summary": "한 줄 요약 (30자 이내)",\n'
            '    "detail": "구체적인 전개 설명 (100자 이내)",\n'
            '    "mood": "분위기 키워드 (예: 긴장감 고조, 로맨스 발전, 반전, 갈등 심화)"\n'
            "  }\n"
            "]"
            + extra_block
        )

        user_prompt = (
            f"소설 제목: {req.title or '미정'}\n"
            + (f"장르/태그: {genre_tag_str}\n" if genre_tag_str else "")
            + (f"플랫폼: {req.platform}\n" if req.platform else "")
            + f"현재 회차: 제{req.episode_no}화\n"
            f"{wiki_str}\n"
            f"[현재 회차 내용]\n{content_preview}\n\n"
            "위 내용을 바탕으로 다음 회차의 전개 방향 3가지를 추천해주세요."
        )

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.8,
            max_tokens=1200,
        )

        raw = response.choices[0].message.content or ""
        suggestions = _parse_suggestions(raw)
        return {"suggestions": suggestions, "mode": "recommend", "error": None}

    except Exception as e:
        return {"suggestions": [], "mode": "recommend", "error": str(e)}


@router.post("/generate")
async def generate_plot(
    req: PlotRequest,
    _: str = Depends(get_current_user_id),
):
    """새로운 플롯 아이디어를 3가지 생성 (기존 내용과 독립적으로)"""
    try:
        client = _get_async_openai_client()

        genre_tag_str = _build_genre_tag_str(req.genre, req.tags)
        genre_display = genre_tag_str or "판타지"
        content_hint = req.content[:500] if req.content else ""
        wiki_str = _build_wiki_str(req.wiki_context)

        # 장르·플랫폼 특화 지침 조립
        extra_lines: list[str] = []
        genre_key = _infer_genre_key(req.genre, req.tags, _GENRE_GENERATE_GUIDE)
        if genre_key:
            extra_lines.append(_GENRE_GENERATE_GUIDE[genre_key])
        platform_key = _infer_platform_key(req.platform)
        if platform_key:
            extra_lines.append(_PLATFORM_PLOT_CONTEXT[platform_key])
        extra_block = ("\n\n[장르·플랫폼 특화 지침]\n" + "\n".join(extra_lines)) if extra_lines else ""

        system_prompt = (
            "당신은 한국 웹소설 전문 작가입니다.\n"
            "독자들이 좋아하는 참신한 플롯 아이디어를 생성합니다.\n"
            "클리셰를 피하고, 장르의 매력을 살리면서 독창적인 아이디어를 제안하세요.\n"
            "소설 설정 기억이 제공된 경우, 등장인물·세계관 설정과 일관된 아이디어를 제안하세요.\n"
            "\n반드시 아래 JSON 배열 형식으로만 답변하세요:\n"
            "[\n"
            "  {\n"
            '    "title": "플롯 제목 (15자 이내)",\n'
            '    "summary": "한 줄 소개 (40자 이내)",\n'
            '    "detail": "플롯 상세 설명 — 주요 사건, 갈등, 결말 방향 포함 (150자 이내)",\n'
            '    "mood": "분위기 키워드"\n'
            "  }\n"
            "]"
            + extra_block
        )

        user_prompt = (
            f"장르/태그: {genre_display}\n"
            f"소설 제목: {req.title or '미정'}\n"
            + (f"플랫폼: {req.platform}\n" if req.platform else "")
            + f"{wiki_str}\n"
            + (f"현재 내용 힌트: {content_hint}\n" if content_hint else "")
            + "\n이 소설에 어울리는 새로운 플롯 아이디어 3가지를 만들어주세요.\n"
            "기존 내용에 없는 새로운 방향도 자유롭게 제안해도 됩니다."
        )

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=1.0,
            max_tokens=1500,
        )

        raw = response.choices[0].message.content or ""
        suggestions = _parse_suggestions(raw)
        return {"suggestions": suggestions, "mode": "generate", "error": None}

    except Exception as e:
        return {"suggestions": [], "mode": "generate", "error": str(e)}
