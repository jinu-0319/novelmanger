import os
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv
from app.repository.client.base import BaseLLMClient

if os.getenv("KUBERNETES_SERVICE_HOST") is None:
    load_dotenv()

class GeminiClient(BaseLLMClient):
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY")
        self.chat_model_name = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash")
        self.embedding_model_name = os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")
        self._chat_instance = None
        self._embedding_instance = None

    def get_chat_model(self):
        if self._chat_instance is None:
            self._chat_instance = ChatGoogleGenerativeAI(
                google_api_key=self.api_key, model=self.chat_model_name
            )
        return self._chat_instance

    def get_embedding_mode(self) -> GoogleGenerativeAIEmbeddings:
        if self._embedding_instance is None:
            self._embedding_instance = GoogleGenerativeAIEmbeddings(
                google_api_key=self.api_key, model=self.embedding_model_name
            )
        return self._embedding_instance

# 하위 호환 alias
UpstageClinet = GeminiClient