"""Chatbot orchestration: context → Ollama → PHI-safe response."""

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.chatbot.context_builder import build_chat_context
from app.chatbot.ollama_client import OllamaError, build_system_prompt, chat_completion, fallback_response
from app.chatbot.phi_redactor import redact_structure, redact_text, should_redact_phi
from app.services.audit_logger import AuditLogger
from app.services.runtime_config import get_runtime_config

logger = structlog.get_logger()

SUGGESTED_PROMPTS = [
    "What is the current migration status?",
    "How many studies failed routing today?",
    "Is the DIMSE listener online?",
    "Summarize recent routing activity",
    "How many audit events occurred this week?",
]


class ChatbotEngine:
    async def query(
        self,
        db: AsyncSession,
        message: str,
        *,
        user_id: str,
        username: str,
        roles: list[str],
    ) -> dict:
        redact = should_redact_phi(roles)
        config = get_runtime_config()
        if not config.get("chatbot_enabled", True):
            return {
                "answer": "Synapse Assistant is disabled by an administrator.",
                "phi_redacted": redact,
                "used_fallback": True,
                "model": None,
                "suggestions": SUGGESTED_PROMPTS,
            }

        context = await build_chat_context(db, message)
        if redact:
            context = redact_structure(context)

        system_prompt = build_system_prompt(context)
        used_fallback = False
        model = None

        try:
            model = get_runtime_config().get("ollama_model")
            answer = await chat_completion(system_prompt, message)
        except OllamaError as exc:
            logger.warning("ollama_unavailable", error=str(exc))
            answer = fallback_response(message, context)
            used_fallback = True
        except Exception as exc:
            logger.error("chatbot_error", error=str(exc))
            answer = fallback_response(message, context)
            used_fallback = True

        if redact:
            answer = redact_text(answer)

        await AuditLogger.log(
            db,
            "CHATBOT_QUERY",
            user_id=user_id,
            user_role=",".join(roles),
            details={
                "username": username,
                "question": message[:500],
                "used_fallback": used_fallback,
                "phi_redacted": redact,
                "model": model,
            },
        )

        return {
            "answer": answer,
            "phi_redacted": redact,
            "used_fallback": used_fallback,
            "model": model,
            "suggestions": SUGGESTED_PROMPTS,
        }
