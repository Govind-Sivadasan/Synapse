from pydantic import BaseModel, Field


class ChatQueryRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class ChatQueryResponse(BaseModel):
    answer: str
    phi_redacted: bool
    used_fallback: bool
    model: str | None = None
    suggestions: list[str] = []


class ChatbotStatusResponse(BaseModel):
    available: bool
    model: str
    model_ready: bool = False
    installed_models: list[str] = []
    error: str | None = None
