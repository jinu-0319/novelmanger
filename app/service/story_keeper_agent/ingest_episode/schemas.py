from pydantic import BaseModel, Field
from typing import List

class IngestEpisodeRequest(BaseModel):
    episode_no: int = Field(..., ge=1)
    text_chunks: List[str] = Field(..., min_items=1)
    user_id: str = "default"
    novel_id: str = "default"

class IngestEpisodeResponse(BaseModel):
    episode_no: int
    full_text: str
