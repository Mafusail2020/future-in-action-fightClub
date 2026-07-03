from pydantic import BaseModel, Field

from app.schemas.citations import CitationModel
from app.schemas.geo import MapPayload


class ChatRequest(BaseModel):
    session_id: str | None = Field(default=None, description="Omit on the first message; "
                                   "reuse the returned value to keep conversation context")
    message: str = Field(min_length=1)


class ChatResponse(BaseModel):
    session_id: str
    intent: str
    answer: str                     # markdown with [n] citation markers
    citations: list[CitationModel] = []
    map: MapPayload
    meta: dict = {}
