from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Tuple, Union

# 🛑 절대 경로로 고정하여 프론트엔드와 위치를 맞춥니다.
DB_PATH = "/app/app/data/characters.json"

from app.service.characters.solar_client import SolarClient


# =========================================================
# 1. 파일 IO 및 기초 유틸 (원래 코드 100% 유지)
# =========================================================
def _read_json_safe(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_json(path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


def _norm(s: Any) -> str:
    if not isinstance(s, str):
        if isinstance(s, (dict, list)):
            return json.dumps(s, sort_keys=True, ensure_ascii=False)
        return str(s)
    return re.sub(r"\s+", " ", (s or "").strip())


def _clean_value(v: str) -> str:
    v = _norm(v)
    return v if v else "none"


def _strip_bullet(line: str) -> str:
    line = line.strip()
    line = re.sub(r"^[\-\*\•]\s*", "", line)
    line = re.sub(r"^\d+[\.\)]\s*", "", line)
    return line.strip()


def _split_bullets(block: str) -> List[str]:
    if not block:
        return []
    lines = [x.strip() for x in block.splitlines() if x.strip()]
    out: List[str] = []
    for ln in lines:
        ln = _strip_bullet(ln)
        if ln:
            out.append(ln)
    return out


def _remove_footnotes(text: str) -> str:
    return re.sub(r"\[\d+\]", "", text)


def _clean_name(name: str) -> str:
    name = _remove_footnotes(name)
    name = re.sub(r"[\(\)【】\[\]]", "", name).strip()
    name = re.sub(r"\s+", " ", name).strip()
    return name


# =========================================================
# 2. 정규식 기반 섹션 파싱 (원래 코드 100% 유지)
# =========================================================
SECTION_ALIASES = {
    "age_gender": ["나이(생년월일, 없으면 나이만) /성별", "나이/성별", "나이", "생년월일", "성별"],
    "job_status": ["직업/신분", "직업", "신분"],
    "core_traits": ["핵심 특징", "핵심특징", "특징"],
    "personality": ["성격"],
    "outer_goal": ["외적 목표"],
    "inner_goal": ["내적 목표"],
    "trauma_weakness": ["트라우마/약점", "트라우마", "약점"],
    "speech_habit": ["말버릇이나 습관", "말버릇", "습관"],
    "relationships": ["다른 주요 인물과의 관계", "주요 인물과의 관계", "관계"],
}


def _detect_section(line: str) -> Tuple[str | None, str]:
    s = line.strip()
    s_no_paren = re.sub(r"\(.*?\)", "", s).strip()

    for key, aliases in SECTION_ALIASES.items():
        for a in aliases:
            if s_no_paren.startswith(a):
                if ":" in s:
                    return key, s.split(":", 1)[1].strip()
                rest = s_no_paren[len(a):].strip()
                rest = rest.lstrip("-").strip()
                return key, rest
    return None, ""


def _collect_sections(text: str) -> Dict[str, str]:
    lines = [ln.rstrip() for ln in (text or "").splitlines()]
    lines = [ln for ln in lines if ln.strip()]

    buckets: Dict[str, List[str]] = {k: [] for k in SECTION_ALIASES.keys()}
    current: str | None = None

    for ln in lines:
        key, inline = _detect_section(ln)
        if key:
            current = key
            if inline:
                buckets[current].append(inline)
            continue
        if current:
            buckets[current].append(ln.strip())

    return {k: "\n".join(v).strip() for k, v in buckets.items()}


def _parse_personality(block: str) -> Dict[str, Any]:
    if not block:
        return {"pros": "none", "cons": "none"}

    lines = [x.strip() for x in block.splitlines() if x.strip()]
    mode = None
    pros: List[str] = []
    cons: List[str] = []
    misc: List[str] = []

    for ln in lines:
        s = _strip_bullet(ln)
        if not s: continue

        if s.startswith("장점"):
            mode = "pros"
            after = s.split(":", 1)[1].strip() if ":" in s else s.replace("장점", "", 1).strip()
            if after: pros.extend(_split_bullets(after))
            continue

        if s.startswith("단점"):
            mode = "cons"
            after = s.split(":", 1)[1].strip() if ":" in s else s.replace("단점", "", 1).strip()
            if after: cons.extend(_split_bullets(after))
            continue

        if mode == "pros":
            pros.append(s)
        elif mode == "cons":
            cons.append(s)
        else:
            misc.append(s)

    if (not pros and not cons) and misc:
        items = _split_bullets("\n".join(misc))
        pros = items[:3]
        cons = items[3:6]

    return {"pros": pros[:3] if pros else "none", "cons": cons[:3] if cons else "none"}


# =========================================================
# 3. 휴리스틱(키워드) 추출 로직 (원래 코드 100% 유지)
# =========================================================
def _extract_job_status(text: str) -> str:
    candidates: List[str] = []
    keywords = [
        "외상외과의", "외과의", "일반외과", "의사", "전임 조교수", "조교수", "교수", "군의관",
        "의대", "UCL", "면허", "런던대 교수",
    ]
    for kw in keywords:
        if kw in text: candidates.append(kw)

    uniq: List[str] = []
    for x in candidates:
        if x not in uniq: uniq.append(x)

    if not uniq: return "none"
    return ", ".join(uniq[:5])


def _extract_trauma_weakness(text: str) -> str:
    if "뇌종양" in text and "판정" in text: return "뇌종양 판정 경험"
    if "결핵" in text: return "전쟁 중 결핵으로 죽을 뻔함"
    if "죽을 뻔" in text: return "생명 위협 경험"
    return "none"


def _extract_speech_habit(text: str) -> str:
    if "조선 의학" in text and ("거짓말" in text or "구라" in text):
        return "현대지식 출처를 '조선 의학'이라고 둘러대는 습관"
    return "none"


def _extract_core_traits(text: str) -> List[str] | str:
    traits: List[str] = []
    if "21세기" in text and "19세기" in text and ("다시 태어난다" in text or "환생" in text):
        traits.append("21세기 한국 출신으로 19세기 영국에서 조선인으로 다시 태어남")
    if "외상외과" in text or "일반외과" in text or "외과의" in text:
        traits.append("현대 외과(일반/외상) 전문 지식과 수술 실력 보유")
    if "조선 의학" in text and ("거짓말" in text or "구라" in text):
        traits.append("현대 지식 사용 시 '조선 의학에서 배웠다'고 위장")
    if "군의관" in text or "참전" in text or "전쟁" in text:
        traits.append("전쟁에 군의관으로 참여하며 치료/임상 경험 축적")

    uniq: List[str] = []
    for t in traits:
        if t not in uniq: uniq.append(t)
    return uniq if uniq else "none"


def _extract_relationships(text: str) -> List[str] | str:
    rels: List[str] = []
    if "리스턴" in text:
        if "추천" in text:
            rels.append("로버트 리스턴: 강력 추천/동료(혹은 스승급 인맥)")
        else:
            rels.append("리스턴: 동료/협업 인물(본문 기반)")
    if "나이팅게일" in text: rels.append("나이팅게일: 크림 전쟁 야전병원 체계 구축 협업")
    if "후원" in text or "지역 유지" in text: rels.append("지역 유지: 인종차별 시대에 후원자")

    uniq: List[str] = []
    for r in rels:
        if r not in uniq: uniq.append(r)
    return uniq if uniq else "none"


def _extract_goals(text: str) -> Tuple[str, str]:
    outer = "none"
    inner = "none"
    if "망연자실" in text or "뇌종양" in text:
        inner = "죽음/질병 경험 이후 생존과 성장에 집착하게 됨(서술 기반)"
    return outer, inner


def _extract_age_gender(text: str) -> str:
    age = ""
    gender = ""
    m_age = re.search(r"(\d{1,3})\s*세(?!기)", text)
    if m_age: age = f"{m_age.group(1)}세"
    m_gender = re.search(r"(남자|여자|남성|여성)", text)
    if m_gender:
        g = m_gender.group(1)
        gender = "남자" if g in ("남자", "남성") else "여자"
    if not age and not gender: return "none"
    if age and gender: return f"{age} / {gender}"
    return age or gender


# =========================================================
# 4. 데이터 추출 통합 (AI 우선 -> Fallback)
# =========================================================
def _extract_from_text(text: str) -> Any:
    print("\n" + "=" * 50)
    print("🚀 [1단계] _extract_from_text 시작")

    if not text or not text.strip():
        return {}

    if SolarClient is not None:
        try:
            print("   🔌 CharacterLLM 호출 중...")
            client = SolarClient()
            result = client.parse_character(text)
            if result:
                print(f"   ✅ [Gemini 응답 성공] 타입: {type(result)}")
                return result
        except Exception as e:
            print(f"   🔥 [Gemini 호출 에러] {e}")

    print("   ⚠️ Gemini 실패 -> 정규식 Fallback 실행")
    sections = _collect_sections(text)

    h_age_gender = _extract_age_gender(text)
    h_job = _extract_job_status(text)
    h_traits = _extract_core_traits(text)
    h_rels = _extract_relationships(text)
    _, h_inner = _extract_goals(text)
    h_trauma = _extract_trauma_weakness(text)
    h_habit = _extract_speech_habit(text)

    fallback_result = {
        "name": "Unknown",
        "age_gender": _clean_value(sections.get("age_gender")) if sections.get("age_gender") else h_age_gender,
        "job_status": _clean_value(sections.get("job_status")) if sections.get("job_status") else h_job,
        "core_traits": _split_bullets(sections.get("core_traits", "")) or h_traits,
        "personality": _parse_personality(sections.get("personality", "")),
        "relationships": _split_bullets(sections.get("relationships", "")) or h_rels,
        "outer_goal": _clean_value(sections.get("outer_goal", "none")),
        "inner_goal": _clean_value(sections.get("inner_goal")) if sections.get("inner_goal") else h_inner,
        "trauma_weakness": _clean_value(sections.get("trauma_weakness")) if sections.get(
            "trauma_weakness") else h_trauma,
        "speech_habit": _clean_value(sections.get("speech_habit")) if sections.get("speech_habit") else h_habit,
    }

    return fallback_result


# =========================================================
# 5. MERGE(보완/수정) 로직 (원래 코드 100% 유지)
# =========================================================
def _uniq_keep_order(items: List[str]) -> List[str]:
    out: List[str] = []
    for x in items:
        x = _norm(x)
        if not x or x == "none": continue
        if x not in out: out.append(x)
    return out


def _merge_comma_tags(old: str, new: str) -> str:
    old = _clean_value(old)
    new = _clean_value(new)
    if old == "none": return new
    if new == "none": return old
    old_parts = [p.strip() for p in old.split(",") if p.strip()]
    new_parts = [p.strip() for p in new.split(",") if p.strip()]
    return ", ".join(_uniq_keep_order(new_parts + old_parts))


def _merge_age_gender(old: str, new: str) -> str:
    return new if new and new != "none" else old


def _merge_list_field(old_val: Any, new_val: Any, *, max_items: int = 10) -> Any:
    old_list = old_val if isinstance(old_val, list) else ([old_val] if old_val and old_val != "none" else [])
    new_list = new_val if isinstance(new_val, list) else ([new_val] if new_val and new_val != "none" else [])
    merged = _uniq_keep_order(new_list + old_list)
    return merged[:max_items] if merged else "none"


def _merge_personality(old: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    old = old if isinstance(old, dict) else {"pros": "none", "cons": "none"}
    new = new if isinstance(new, dict) else {"pros": "none", "cons": "none"}
    def to_l(v): return v if isinstance(v, list) else ([v] if v and v != "none" else [])
    pros = _uniq_keep_order(to_l(new.get("pros")) + to_l(old.get("pros")))
    cons = _uniq_keep_order(to_l(new.get("cons")) + to_l(old.get("cons")))
    return {"pros": pros[:3] if pros else "none", "cons": cons[:3] if cons else "none"}


def _merge_character(old: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(old)
    merged["name"] = old.get("name") or new.get("name")
    merged["age_gender"] = _merge_age_gender(old.get("age_gender", "none"), new.get("age_gender", "none"))
    merged["job_status"] = _merge_comma_tags(old.get("job_status", "none"), new.get("job_status", "none"))
    merged["core_traits"] = _merge_list_field(old.get("core_traits"), new.get("core_traits"), max_items=10)
    merged["relationships"] = _merge_list_field(old.get("relationships"), new.get("relationships"), max_items=20)
    merged["personality"] = _merge_personality(old.get("personality", {}), new.get("personality", {}))
    for k in ["outer_goal", "inner_goal", "trauma_weakness", "speech_habit"]:
        nv = _clean_value(new.get(k, "none"))
        merged[k] = nv if nv != "none" else _clean_value(old.get(k, "none"))
    return merged


# =========================================================
# 6. 공개 함수 & Ingest Entry Point (절대 경로 수정 완료)
# =========================================================
def summarize_character_info(text: str) -> Dict[str, Any]:
    print("🚀 [Character Module] 분석 요청 수신...")
    extracted = _extract_from_text(text)
    targets = []
    if isinstance(extracted, list): targets = extracted
    elif isinstance(extracted, dict) and extracted: targets = [extracted]

    if not targets:
        print("   ⚠️ 캐릭터 정보를 찾을 수 없습니다.")
        return {"status": "error", "message": "No character detected"}

    print(f"   ✅ 감지된 캐릭터 수: {len(targets)}명")
    saved_names = []
    for char_info in targets:
        if not isinstance(char_info, dict): continue
        raw_name = char_info.get("name")
        if not raw_name or raw_name in ["none", "Unknown", ""]: continue
        key = _clean_name(raw_name)
        char_info["name"] = key
        upsert_character(key, char_info)
        saved_names.append(key)
        print(f"      - 저장 완료: {key}")

    return {"status": "success", "names": saved_names, "count": len(saved_names)}


def upsert_character(name: str, features: Union[str, Dict[str, Any]], *, db_path: str = DB_PATH) -> Dict[str, Any]:
    key = _clean_name(name)
    if isinstance(features, dict):
        new_obj = features
        new_obj["name"] = key
    else:
        extracted = _extract_from_text(features)
        if isinstance(extracted, list) and extracted: new_obj = extracted[0]
        elif isinstance(extracted, dict): new_obj = extracted
        else: new_obj = {"name": key}

    db = _read_json_safe(db_path)
    if key in db:
        db[key] = _merge_character(db[key], new_obj)
        action = "merged"
    else:
        db[key] = new_obj
        action = "inserted"
    _write_json(db_path, db)
    return {"status": "success", "action": action, "name": key}

def parse_character_with_name(name: str, features: str) -> Dict[str, Any]:
    return {"name": name, "raw_text": features}

__all__ = ["upsert_character", "summarize_character_info", "DB_PATH"]