import os
from dotenv import load_dotenv
from app.repository.client.base import BaseLLMClient
from app.core.llm import get_llm, get_embeddings

if os.getenv("KUBERNETES_SERVICE_HOST") is None:
    load_dotenv()


class GeminiClient(BaseLLMClient):
    """Upstage → Google Gemini 마이그레이션 래퍼"""

    def __init__(self):
        self._chat_instance = None
        self._embedding_instance = None

    def get_chat_model(self):
        if self._chat_instance is None:
            self._chat_instance = get_llm()
        return self._chat_instance

    def get_embedding_mode(self):
        if self._embedding_instance is None:
            self._embedding_instance = get_embeddings()
        return self._embedding_instance


# 기존 코드가 UpstageClinet 이름으로 임포트하는 경우를 위한 별칭
UpstageClinet = GeminiClient
