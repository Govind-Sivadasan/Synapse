from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChatQueryRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class ChatMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    phi_redacted: bool | None = None
    used_fallback: bool | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageListResponse(BaseModel):
    total: int
    items: list[ChatMessageResponse]


class ChatQueryResponse(BaseModel):
    answer: str
    phi_redacted: bool
    used_fallback: bool
    model: str | None = None
    suggestions: list[str] = []
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse


class ChatbotStatusResponse(BaseModel):
    enabled: bool = True
    available: bool
    model: str
    model_ready: bool = False
    installed_models: list[str] = []
    error: str | None = None
