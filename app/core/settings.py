import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


class BaseSettings:
    """Base settings class for environment variable management"""
    
    def __init__(self):
        self._load_settings()
    
    def _load_settings(self):
        pass
    
    def get_env(self, key: str, default: Optional[str] = None, required: bool = False) -> str:
        """Get environment variable with optional validation"""
        value = os.getenv(key, default)
        if required and not value:
            raise ValueError(f"{key} environment variable is required")
        return value


class GeminiSettings(BaseSettings):
    """Google Gemini API settings"""

    def __init__(self):
        super().__init__()
        self.api_key = self.get_env("GOOGLE_API_KEY", required=True)
        self.chat_model = self.get_env("GEMINI_CHAT_MODEL", "gemini-2.5-flash")
        self.embedding_model = self.get_env("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")


class ChromaDBSettings(BaseSettings):
    """ChromaDB settings"""
    
    def __init__(self):
        super().__init__()
        self.host = self.get_env("CHROMA_HOST", "localhost")
        self.port = int(self.get_env("CHROMA_PORT", "8800"))
        self.collection_name = self.get_env("CHROMA_COLLECTION_NAME", "upstage_embeddings")


gemini_settings = GeminiSettings()
chromadb_settings = ChromaDBSettings()