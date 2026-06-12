"""Service chatbot API powered by Ollama."""

from fastapi import APIRouter, Depends, Request

from app.auth.keycloak import CurrentUser, require_roles
from app.chatbot.engine import ChatbotEngine, SUGGESTED_PROMPTS
from app.chatbot.ollama_client import check_ollama_health
from app.database import get_db
from app.schemas.chatbot import ChatQueryRequest, ChatQueryResponse, ChatbotStatusResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])

_engine = ChatbotEngine()


@router.get("/status", response_model=ChatbotStatusResponse)
async def get_chatbot_status(
    _: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> ChatbotStatusResponse:
    status = await check_ollama_health()
    return ChatbotStatusResponse(
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


@router.post("/query", response_model=ChatQueryResponse)
async def chat_query(
    payload: ChatQueryRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> ChatQueryResponse:
    result = await _engine.query(
        db,
        payload.message.strip(),
        user_id=user.sub,
        username=user.username,
        roles=user.roles,
    )
    return ChatQueryResponse(**result)
