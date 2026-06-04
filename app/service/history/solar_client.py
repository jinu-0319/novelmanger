# app/service/history/history_client.py
from __future__ import annotations
import json
import os
import requests
from typing import Any, Dict, List
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

class HistoryLLMClient:
    def __init__(self) -> None:
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

    def parse_history_command(self, text: str) -> List[Dict[str, Any]]:
        """
        사용자 입력을 분석하여 다수의 역사 엔티티 변경 명령을 리스트로 반환합니다.
        """

        # --- [한국어 프롬프트] ---
        system_prompt = """
        당신은 역사적 사실을 데이터베이스에 정리하는 '역사학자 AI'입니다.
        사용자의 입력 텍스트를 정밀 분석하여, 포함된 **모든** 역사적 엔티티(인물, 사건, 유물, 장소 등)를 추출하세요.

        ### 🎯 분석 규칙 (반드시 준수)
        1. **다중 추출 (Multi-Entity):** 입력에 서로 다른 주제(예: '이순신'과 '프랑스 대혁명')가 섞여 있다면, 반드시 **별개의 항목으로 분리**하여 리스트에 담으세요.
        2. **관계 파악:** 텍스트 내에서 엔티티끼리 연관성이 명확하다면(예: '이순신'이 '거북선'을 만듦), `related_entities` 필드에 상호 연결 정보를 포함하세요.
        3. **불필요한 정보 무시:** 저장할 가치가 없는 단순한 인사말, 잡담, 질문 등은 무시하고 빈 리스트 `[]`를 반환하세요.
        4. **JSON 포맷:** 결과는 오직 **JSON 리스트(`[]`)** 형태여야 합니다. 마크다운 코드 블록(```json)을 사용하지 말고 순수 JSON만 출력하세요.

        ### 📋 출력 데이터 구조 (JSON List)
        [
          {
            "action": "create" | "update" | "delete",  // 문맥에 따라 판단 (기본은 create)
            "target": {
                "name": "엔티티 이름 (식별용)", 
                "id": null // 신규 생성 시 null
            },
            "payload": {
              "name": "공식 명칭",
              "entity_type": "Person" | "Event" | "Artifact" | "Location" | "Organization" | "Unknown",
              "era": "시대 (예: 조선 초기, 18세기 프랑스)",
              "summary": "한 줄 요약 (50자 이내)",
              "description": "상세 설명 (텍스트 내용 기반)",
              "tags": ["태그1", "태그2"],
              "related_entities": [
                  {
                      "relation_type": "관계 유형 (예: Creator, Participant, Enemy)",
                      "target_name": "연관된 대상의 이름",
                      "description": "관계에 대한 간략 설명"
                  }
              ]
            }
          }
        ]
        """

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"입력 텍스트: {text}")
        ]

        try:
            response = self.llm.invoke(messages)
            content = response.content.strip()

            # 마크다운 코드 블록 제거 (혹시 몰라서 처리)
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]

            parsed_data = json.loads(content)

            # 만약 LLM이 실수로 리스트가 아니라 딕셔너리 하나만 줬을 경우를 대비해 리스트로 감쌈
            if isinstance(parsed_data, dict):
                return [parsed_data]

            return parsed_data

        except json.JSONDecodeError:
            print(f"❌ LLM 응답 파싱 실패: {response.content}")
            return []
        except Exception as e:
            print(f"❌ Solar API 호출 오류: {e}")
            return []

    def _request(self, system_prompt: str, user_prompt: str) -> str:
        """LangChain 기반 호출로 위임 (하위 호환 유지용)"""
        response = self.llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        return response.content

    def _strip_code_fences(self, s: str) -> str:
        s = s.strip()
        if s.startswith("```"):
            lines = s.splitlines()
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].strip() == "```": lines = lines[:-1]
            return "\n".join(lines).strip()
        return s