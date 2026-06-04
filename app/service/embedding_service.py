from typing import List
from dotenv import load_dotenv
from app.core.llm import get_embeddings

load_dotenv()


class EmbeddingService:
    def __init__(self):
        self._embeddings = get_embeddings()

    def create_embeddings(self, texts: List[str]) -> List[List[float]]:
        return self._embeddings.embed_documents(texts)

    def create_embedding(self, text: str) -> List[float]:
        return self._embeddings.embed_query(text)
