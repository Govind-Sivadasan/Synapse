"""Service chatbot API powered by Ollama."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.chatbot.engine import ChatbotEngine, SUGGESTED_PROMPTS
from app.chatbot.ollama_client import check_ollama_health
from app.database import get_db
from app.schemas.chatbot import (
    ChatMessageListResponse,
    ChatMessageResponse,
    ChatQueryRequest,
    ChatQueryResponse,
    ChatbotStatusResponse,
)
from app.services.chat_history import append_message, clear_user_messages, count_user_messages, list_user_messages

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])

from app.services.runtime_config import get_runtime_config

_engine = ChatbotEngine()


@router.get("/status", response_model=ChatbotStatusResponse)
async def get_chatbot_status(
    _: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> ChatbotStatusResponse:
    config = get_runtime_config()
    enabled = bool(config.get("chatbot_enabled", True))
    status = await check_ollama_health()
    return ChatbotStatusResponse(
        enabled=enabled,
        available=status.get("available", False),
        model=status.get("model", ""),
        model_ready=status.get("model_ready", False),
        installed_models=status.get("installed_models", []),
        error=status.get("error"),
    )


@router.get("/suggestions")
async def get_suggestions(
    _: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> dict:
    return {"suggestions": SUGGESTED_PROMPTS}


@router.get("/messages", response_model=ChatMessageListResponse)
async def get_chat_messages(
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> ChatMessageListResponse:
    items = await list_user_messages(db, user.sub, limit=limit)
    total = await count_user_messages(db, user.sub)
    return ChatMessageListResponse(
        total=total,
        items=[ChatMessageResponse.model_validate(m) for m in items],
    )


@router.delete("/messages", status_code=204)
async def clear_chat_messages(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> None:
    await clear_user_messages(db, user.sub)


@router.post("/query", response_model=ChatQueryResponse)
async def chat_query(
    payload: ChatQueryRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> ChatQueryResponse:
    text = payload.message.strip()
    user_row = await append_message(db, user_id=user.sub, role="user", content=text)
    await db.flush()

    result = await _engine.query(
        db,
        text,
        user_id=user.sub,
        username=user.username,
        roles=user.roles,
    )

    assistant_row = await append_message(
        db,
        user_id=user.sub,
        role="assistant",
        content=result["answer"],
        phi_redacted=result["phi_redacted"],
        used_fallback=result["used_fallback"],
    )
    await db.flush()

    return ChatQueryResponse(
        **result,
        user_message=ChatMessageResponse.model_validate(user_row),
        assistant_message=ChatMessageResponse.model_validate(assistant_row),
    )
