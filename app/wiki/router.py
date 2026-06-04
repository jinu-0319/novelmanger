"""
app/wiki/router.py — 장기 기억 위키 자동 추출 API

글을 쓰면 Gemini 2.5 Flash가 등장인물·세계관·주요 설정을
자동으로 구조화해 프론트엔드 Zustand에 저장할 수 있도록 반환합니다.

장르·플랫폼·태그를 받으면 장르 특화 카테고리가 프롬프트에 추가됩니다.
"""
import json
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import get_current_user_id

router = APIRouter(prefix="/wiki", tags=["Wiki"])


class WikiExtractRequest(BaseModel):
    content: str                    # 에피소드 본문 (plain text)
    episode_no: int = 1
    novel_title: str = ""
    genre: str = ""                 # 장르 (선택)
    platform: str = ""              # 플랫폼 (선택)
    tags: list[str] = []            # #대체역사, #현대판타지 등 (선택)
    existing_wiki: list[dict] = []  # 중복 방지용 기존 위키


# ── 장르별 추가 추출 카테고리 힌트 ────────────────────────────────────────────

_GENRE_EXTRA_CATEGORIES: dict[str, str] = {
    "회귀": (
        "- timeline: 회귀 시점, 전생 기억, 타임라인 분기점\n"
        "- past_life: 전생의 주요 인물·사건 정보"
    ),
    "빙의": (
        "- identity: 빙의 대상 원래 인물 정보, 빙의 인물과의 성격 차이\n"
        "- hidden_identity: 빙의 사실 인지 여부·은폐 방법"
    ),
    "환생": (
        "- timeline: 전생 기억·환생 이후 시점\n"
        "- past_life: 전생 핵심 인물·사건"
    ),
    "로판": (
        "- noble: 귀족 가문명, 신분, 작위, 가문 문장\n"
        "- magic: 마법 체계, 능력 등급, 마법사 서열\n"
        "- romance: 주요 로맨스 플래그, 감정 발전 단계"
    ),
    "판타지": (
        "- magic: 마법·능력 체계, 등급 구분, 속성\n"
        "- faction: 주요 세력·조직·종족 관계\n"
        "- artifact: 핵심 아이템·마법 도구"
    ),
    "무협": (
        "- martial: 문파명, 무공명, 초식, 내공 단계\n"
        "- faction: 정파·마파·사파 세력 관계, 강호 지도\n"
        "- rivalry: 은원 관계, 사제 관계, 복수 대상"
    ),
    "현대": (
        "- organization: 학교·직장·조직 등 현대 배경 설정\n"
        "- ability: 능력자 설정, 능력 규칙·한계"
    ),
    "sf": (
        "- technology: 핵심 미래 기술·장치·AI 이름\n"
        "- faction: 세력·국가·기업·우주 조직\n"
        "- rule: 세계관 내 물리 법칙·금기 사항"
    ),
    "역사": (
        "- era: 시대적 배경, 실제 역사 사건과의 연계\n"
        "- historical_figure: 실존 인물 설정 및 허구와의 차이점"
    ),
    "스릴러": (
        "- suspect: 용의자·범인 후보 인물\n"
        "- clue: 복선·단서·증거물\n"
        "- mystery: 핵심 수수께끼·미해결 사건"
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
    "대체역사": "역사", "역사": "역사", "시대극": "역사",
}


def _infer_genre_key(genre: str, tags: list[str]) -> str:
    """장르 문자열과 태그에서 _GENRE_EXTRA_CATEGORIES 키를 추론."""
    g = (genre or "").strip().lower().replace(" ", "").replace("#", "")
    for key in _GENRE_EXTRA_CATEGORIES:
        if key in g:
            return key
    for tag in tags:
        t = tag.strip().lower().replace("#", "").replace(" ", "")
        if t in _TAG_GENRE_MAP:
            return _TAG_GENRE_MAP[t]
        for key in _GENRE_EXTRA_CATEGORIES:
            if key in t:
                return key
    return ""


def _build_extra_categories(genre: str, tags: list[str]) -> str:
    """장르·태그 기반 추가 카테고리 블록 반환. 없으면 빈 문자열."""
    key = _infer_genre_key(genre, tags)
    if key and key in _GENRE_EXTRA_CATEGORIES:
        return (
            "\n장르 특화 추가 카테고리 (위 카테고리와 병행해서 해당 항목도 추출):\n"
            + _GENRE_EXTRA_CATEGORIES[key]
        )
    return ""


# ── 응답 파싱 ──────────────────────────────────────────────────────────────────

def _parse_wiki_items(raw: str, episode_no: int) -> list[dict]:
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
            items = json.loads(text[start:end])
            result = []
            ts = int(time.time() * 1000)
            for i, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                if not item.get("title") or not item.get("type"):
                    continue
                item["id"] = item.get("id") or f"wiki-{episode_no}-{i}-{ts}"
                item["episode_no"] = episode_no
                item.setdefault("description", "")
                result.append(item)
            return result
    except Exception:
        pass
    return []


# ── 엔드포인트 ───────────────────────────────────────────────────────────────

@router.post("/extract")
async def extract_wiki(
    req: WikiExtractRequest,
    _: str = Depends(get_current_user_id),
):
    """
    에피소드 본문에서 등장인물·세계관·주요 설정을 자동 추출

    - genre·tags 제공 시 장르 특화 카테고리 추가 인식
    - 이미 기록된 설정(existing_wiki)과 중복되는 항목은 제외
    - 중요도 높은 항목 최대 6개 반환
    - 실패 시 { items: [], error: "..." } 반환 (서버 중단 없음)
    """
    try:
        from app.core.llm import get_llm
        from langchain_core.messages import HumanMessage

        existing_entries = [
            f"{item.get('type', '')}:{item.get('title', '')}"
            for item in req.existing_wiki
            if item.get("title")
        ]
        existing_str = ", ".join(existing_entries[:30]) if existing_entries else "없음"
        content_preview = req.content[:3000] if req.content else "(내용 없음)"

        # 장르·태그 기반 컨텍스트 조립
        genre_display = req.genre or ""
        if req.tags:
            tag_str = " ".join(t if t.startswith("#") else f"#{t}" for t in req.tags[:10])
            genre_display = f"{genre_display} {tag_str}".strip()
        extra_categories = _build_extra_categories(req.genre, req.tags)

        llm = get_llm(temperature=0.2)

        prompt = f"""당신은 소설 분석 AI입니다. 소설 회차 본문을 읽고 중요한 설정 요소를 추출하세요.

소설 제목: {req.novel_title or "미정"}
현재 회차: 제{req.episode_no}화{f"{chr(10)}장르/태그: {genre_display}" if genre_display else ""}
이미 기록된 설정: {existing_str}

[본문]
{content_preview}

위 본문에서 다음 카테고리의 중요 정보를 추출하세요:
- character: 등장인물 (성격, 관계, 특징, 외모 등)
- world: 세계관 설정 (마법 체계, 사회 구조, 배경 설정 등)
- event: 주요 사건·전환점 (이야기 흐름에 중요한 사건)
- theme: 주제·소재 (반복 상징, 핵심 주제, 모티프)
- location: 주요 장소·배경 (지명, 공간 설명)
- setting: 기타 중요 설정 (규칙, 법칙, 중요 물건 등){extra_categories}

규칙:
1. 이미 기록된 설정과 정확히 같은 내용(type+title 동일)은 반드시 제외
2. 중요도가 높은 것 위주로 최대 6개만 추출
3. 본문에 명확히 등장한 내용만 추출 (추측 금지)
4. 추출할 내용이 없으면 반드시 빈 배열 [] 반환

반드시 아래 JSON 배열 형식으로만 답변:
[
  {{
    "type": "character",
    "title": "항목 제목 (15자 이내)",
    "description": "핵심 설명 (60자 이내)"
  }}
]"""

        response = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = response.content if hasattr(response, "content") else str(response)

        items = _parse_wiki_items(raw, req.episode_no)
        return {"items": items, "error": None}

    except Exception as e:
        return {"items": [], "error": str(e)}
