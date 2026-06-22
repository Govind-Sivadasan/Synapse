"""Chatbot orchestration: context → Ollama → PHI-safe response."""

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.chatbot.chat_actions import (
    CANCELLATION_REPLY_RE,
    CONFIRMATION_REPLY_RE,
    action_followup_for_conversation,
    action_guidance_for_unmapped_request,
    build_conversation_action_text,
    detect_chat_action_intent_with_context,
    is_chat_action_request_with_context,
    is_informational_query,
    load_action_resources,
)
from app.chatbot.context_builder import build_chat_context
from app.chatbot.ollama_client import OllamaError, build_system_prompt, chat_completion, fallback_response
from app.chatbot.phi_redactor import redact_structure, redact_text, should_redact_phi
from app.services.audit_logger import AuditLogger
from app.services.chat_history import list_user_messages
from app.services.runtime_config import get_runtime_config

logger = structlog.get_logger()

SUGGESTED_PROMPTS = [
    "What is the current migration status?",
    "How many studies failed routing today?",
    "Is the DIMSE listener online?",
    "Summarize recent routing activity",
    "How many audit events occurred this week?",
]


def _can_execute_pending_action(roles: list[str], pending_action: dict | None) -> bool:
    if not pending_action:
        return False
    required = pending_action.get("role_required")
    if required == "admin":
        return "admin" in roles
    if required == "operator":
        return any(role in {"admin", "operator"} for role in roles)
    return False


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
                "pending_action": None,
            }

        context = await build_chat_context(db, message)
        if redact:
            context = redact_structure(context)

        is_admin = "admin" in roles
        can_operate = any(role in {"admin", "operator"} for role in roles)
        pending_action = None
        resources = await load_action_resources(db)
        recent_messages = await list_user_messages(db, user_id, limit=12)
        prior_messages = recent_messages[:-1] if recent_messages else []
        combined_text = build_conversation_action_text(recent_messages) or message.strip()
        change_request = is_chat_action_request_with_context(message, prior_messages)

        if can_operate and change_request:
            raw_action = detect_chat_action_intent_with_context(message, resources, recent_messages)
            if raw_action:
                if _can_execute_pending_action(roles, raw_action):
                    pending_action = raw_action
                else:
                    pending_action = None

        system_prompt = build_system_prompt(
            context,
            is_admin=is_admin,
            can_operate=can_operate,
            has_pending_action=bool(pending_action),
        )
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

        if pending_action:
            answer = pending_action["proposal_text"]
        elif change_request and not can_operate:
            answer = (
                "This chat can only apply operational changes for administrators and operators. "
                "Use the management UI or ask your IT team if you need help making the change."
            )
        elif CANCELLATION_REPLY_RE.match(message.strip()) and change_request:
            answer = "Okay, I won't apply that change."
        elif CONFIRMATION_REPLY_RE.match(message.strip()) and can_operate and not pending_action:
            answer = (
                "I don't have a pending change to confirm. Describe what you want to do and I'll show a "
                "confirmation card when the details are clear."
            )
        elif change_request and can_operate and not pending_action and not is_informational_query(message):
            answer = (
                action_followup_for_conversation(message, resources, recent_messages)
                or action_guidance_for_unmapped_request(combined_text)
                or action_guidance_for_unmapped_request(message)
                or (
                    "I couldn't map that to a specific change. Try being explicit, for example: "
                    "“Create a destination node named Demo PACS at http://10.2.1.10/dicom-web”, "
                    "“Duplicate migration job MW PACS → Local PACS”, "
                    "“Start the MW to Local migration job”, or "
                    "“Create a rule to route CT studies to Cloud PACS”."
                )
            )

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
            "pending_action": pending_action,
        }
