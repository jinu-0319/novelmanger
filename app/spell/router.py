"""
맞춤법 검사 라우터 — Naver 맞춤법 검사기 직접 호출
"""
import asyncio
import re
import json
import urllib.request
import urllib.parse
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.deps import get_current_user_id

router = APIRouter(prefix="/spell", tags=["Spell"])


class SpellRequest(BaseModel):
    text: str


def _call_naver_spell(text: str) -> dict:
    """Naver 맞춤법 검사 API 호출 (500자 이하) — 동기 블로킹"""
    encoded = urllib.parse.quote(text)
    url = (
        "https://m.search.naver.com/p/csearch/content/spellchecker.nhtml"
        f"?_callback=_cb&q={encoded}"
    )
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": "https://search.naver.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")

    match = re.search(r"_cb\((.*)\)", body, re.DOTALL)
    if not match:
        raise ValueError("응답 파싱 실패")

    data = json.loads(match.group(1))
    html = data.get("message", {}).get("result", {}).get("html", "")

    corrections = []
    corr_pattern = re.compile(
        r'<span[^>]+class=["\']red_text["\'][^>]*>(.*?)</span>'
        r'.*?<span[^>]+class=["\']green_text["\'][^>]*>(.*?)</span>',
        re.DOTALL,
    )
    for m in corr_pattern.finditer(html):
        orig = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        corr = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if orig and corr and orig != corr:
            corrections.append({"original": orig, "corrected": corr})

    checked_html = data.get("message", {}).get("result", {}).get("notag_html", html)
    checked_text = re.sub(r"<[^>]+>", "", checked_html).strip()
    if not checked_text:
        checked_text = text

    return {
        "checked": checked_text,
        "corrections": corrections,
        "error_count": len(corrections),
    }


def _chunk_text(text: str, max_len: int = 490) -> list[str]:
    """490자 이하로 문장 단위 분할"""
    if len(text) <= max_len:
        return [text]
    chunks = []
    while len(text) > max_len:
        cut = max_len
        for sep in ["다.\n", "요.\n", ".\n", "다. ", "요. ", ". ", "\n"]:
            pos = text.rfind(sep, 0, max_len)
            if pos != -1:
                cut = pos + len(sep)
                break
        chunks.append(text[:cut])
        text = text[cut:]
    if text.strip():
        chunks.append(text)
    return chunks


def _check_all_chunks(text: str) -> dict:
    """청크 분할 후 전체 맞춤법 검사 수행 (동기, executor에서 실행됨)"""
    chunks = _chunk_text(text)
    checked_parts: list[str] = []
    all_corrections: list[dict] = []
    seen_originals: set[str] = set()

    for chunk in chunks:
        if not chunk.strip():
            continue
        result = _call_naver_spell(chunk)
        checked_parts.append(result["checked"])
        for c in result["corrections"]:
            if c["original"] not in seen_originals:
                all_corrections.append(c)
                seen_originals.add(c["original"])

    return {
        "checked": " ".join(checked_parts),
        "corrections": all_corrections,
        "error_count": len(all_corrections),
        "error": None,
    }


@router.post("/check")
async def check_spell(
    req: SpellRequest,
    _: str = Depends(get_current_user_id),
):
    text = req.text.strip()
    if not text:
        return {"checked": "", "corrections": [], "error_count": 0, "error": None}

    try:
        # urllib.request.urlopen은 블로킹 I/O → executor로 오프로드
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _check_all_chunks, text)
    except Exception as e:
        return {
            "checked": text,
            "corrections": [],
            "error_count": 0,
            "error": f"맞춤법 검사 중 오류: {str(e)}",
        }
