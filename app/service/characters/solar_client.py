from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Union

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage


class SolarClient:
    """캐릭터 파싱 클라이언트 (내부적으로 Gemini 사용)"""

    def __init__(self) -> None:
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1)

    # =========================================================
    # 1. 파일 업로드용: 캐릭터 추출 (강력한 다중 추출)
    # =========================================================
    def parse_character(self, text: str) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
        if not text or not text.strip():
            return {}

        # 🔍 [디버깅] 입력 텍스트 길이 확인 (너무 짧으면 프론트 문제)
        print(f"🔍 [SolarClient] 분석 요청 텍스트 길이: {len(text)}자")
        if len(text) < 100:
            print(f"⚠️ 텍스트가 너무 짧습니다! 앞부분: {text}")

        system_prompt = """
당신은 꼼꼼한 웹소설 캐릭터 데이터베이스 관리자입니다.
제공된 텍스트를 **끝까지 정독**하고, 등장하는 **모든 인물**의 정보를 추출하세요.

[필수 규칙 - 어기면 안 됨]
1. **절대 주인공 한 명만 찾고 멈추지 마세요.** 텍스트에 언급된 조연, 악역, 주변 인물까지 **전부** 리스트에 담아야 합니다.
2. 결과는 반드시 **JSON 리스트 `[...]`** 형식이어야 합니다.
   - 예시: `[{"name": "김태평", ...}, {"name": "리스턴", ...}, {"name": "콜린", ...}]`
3. 텍스트가 길더라도 **마지막 문장까지** 확인해서 새로운 인물이 없는지 찾으세요.
4. 모든 값은 **한국어**로 작성하세요.

[JSON 키 가이드]
   - "name": 이름 (필수)
   - "age_gender": 나이/성별
   - "job_status": 직업/신분
   - "core_traits": 핵심 특징 (리스트)
   - "personality": 성격 (pros/cons 객체)
   - "outer_goal": 외적 목표
   - "inner_goal": 내적 목표
   - "trauma_weakness": 트라우마/약점
   - "speech_habit": 말버릇
   - "relationships": 인간관계 (리스트)
   - "additional_settings": 기타 설정
"""
        # 텍스트가 너무 길 경우를 대비해 중요 부분 강조
        user_prompt = f"분석할 텍스트:\n{text}"

        # ⏳ 타임아웃 90초로 증가 (여러 명 찾으려면 시간 더 걸림)
        content = self._request(system_prompt, user_prompt, timeout=90)

        # 전처리
        content = self._strip_code_fences(content)
        content = self._clean_json_string(content)

        # 🔍 [디버깅] AI가 실제로 뱉은 앞부분 확인 (리스트인지 확인용)
        print(f"🤖 [Solar Response Preview]: {content[:100]}...")

        try:
            # 리스트 파싱 우선 시도
            start = content.find("[")
            dict_start = content.find("{")

            if start != -1 and (dict_start == -1 or start < dict_start):
                end = content.rfind("]")
                if end != -1:
                    data = json.loads(content[start:end + 1])
                    print(f"✅ [SolarClient] 파싱 성공: {len(data)}명의 캐릭터 감지")
                    return data

            # 딕셔너리 파싱 시도 (AI가 말을 안 듣고 하나만 줬을 때)
            json_str = self._extract_json_object(content)
            data = json.loads(json_str)
            print(f"⚠️ [SolarClient] 단일 객체 감지됨 (1명만 추출됨)")
            return data

        except json.JSONDecodeError as e:
            print(f"⚠️ [SolarClient] JSON 파싱 실패: {e}")
            print(f"📄 [Raw Content]: {content}")  # 실패 시 전체 내용 출력
            return {}

    # =========================================================
    # 2. 채팅용: 사용자 명령어(Create/Update/Delete) 판단
    # =========================================================
    def parse_command(self, text: str) -> Dict[str, Any]:
        if not text or not text.strip(): raise ValueError("text is empty")
        # (기존 스키마 유지)
        command_schema = {
            "action": "create|update|delete",
            "target": {"id": None, "name": None},
            "payload": {},
            "patch": {},
            "reason": "string"
        }
        character_payload_schema = {
            "name": "string", "age_gender": "string", "job_status": "string",
            "core_traits": ["string"], "personality": {"pros": "string", "cons": "string"},
            "relationships": [{"target_name": "string", "type": "string", "summary": "string"}]
        }

        system_prompt = (
            "너는 웹소설 데이터 정리 도우미다. JSON만 출력하라.\n"
            f"출력 스키마:\n{json.dumps(command_schema, ensure_ascii=False)}\n"
        )
        user_prompt = f"사용자 입력:\n{text}"

        content = self._request(system_prompt, user_prompt)
        content = self._strip_code_fences(content)
        content = self._clean_json_string(content)
        content = self._extract_json_object(content)

        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise ValueError(f"Solar output is not valid JSON: {e}")

    # =========================================================
    # 3. 내부 유틸리티 함수들
    # =========================================================
    def _request(self, system_prompt: str, user_prompt: str, timeout: int = 60) -> str:
        response = self.llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        return response.content or ""

    def _strip_code_fences(self, s: str) -> str:
        s = (s or "").strip()
        if s.startswith("```"):
            lines = s.splitlines()
            if lines and lines[0].startswith("```"): lines = lines[1:]
            if lines and lines[-1].strip() == "```": lines = lines[:-1]
            s = "\n".join(lines).strip()
        return s

    def _extract_json_object(self, s: str) -> str:
        s = (s or "").strip()
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            return s[start:end + 1]
        return s

    def _clean_json_string(self, s: str) -> str:
        return "".join(ch for ch in s if (ord(ch) >= 32 or ch in "\n\r\t"))