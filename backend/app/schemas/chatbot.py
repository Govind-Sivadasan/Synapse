from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatQueryRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class ChatPendingAction(BaseModel):
    entity_type: Literal["routing_rule", "migration_job", "node", "tag_morphing"]
    action_type: str
    target_id: UUID | None = None
    target_name: str | None = None
    summary: str
    confirm_label: str
    role_required: Literal["admin", "operator"]
    payload: dict[str, Any] = Field(default_factory=dict)
    details: list[dict[str, str]] = Field(default_factory=list)
    proposal_text: str


class ChatActionExecuteRequest(BaseModel):
    entity_type: Literal["routing_rule", "migration_job", "node", "tag_morphing"]
    action_type: str
    target_id: UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class ChatActionExecuteResponse(BaseModel):
    success: bool
    message: str
    entity_type: Literal["routing_rule", "migration_job", "node", "tag_morphing"]
    target_name: str | None = None


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
    pending_action: ChatPendingAction | None = None
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse


class ChatbotStatusResponse(BaseModel):
    enabled: bool = True
    available: bool
    model: str
    model_ready: bool = False
    installed_models: list[str] = []
    error: str | None = None
