"""Ollama HTTP client for chat completions."""

import json

import httpx
import structlog

from app.config import settings
from app.services.runtime_config import get_runtime_config

logger = structlog.get_logger()


class OllamaError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


def _ollama_settings() -> tuple[str, str]:
    config = get_runtime_config()
    return config.get("ollama_base_url", settings.ollama_base_url), config.get(
        "ollama_model", settings.ollama_model
    )


async def check_ollama_health() -> dict:
    base_url, model = _ollama_settings()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{base_url.rstrip('/')}/api/tags")
        if response.status_code >= 400:
            return {"available": False, "model": model, "error": response.text[:200]}
        tags = response.json().get("models", [])
        model_names = [m.get("name", "") for m in tags]
        model_ready = any(model in name for name in model_names)
        return {
            "available": True,
            "model": model,
            "model_ready": model_ready,
            "installed_models": model_names[:10],
        }
    except Exception as exc:
        return {"available": False, "model": model, "error": str(exc)}


async def chat_completion(system_prompt: str, user_message: str, timeout: float = 90.0) -> str:
    base_url, model = _ollama_settings()
    url = f"{base_url.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 512},
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload)

    if response.status_code >= 400:
        raise OllamaError(f"Ollama error HTTP {response.status_code}: {response.text[:300]}", response.status_code)

    data = response.json()
    message = data.get("message", {})
    content = message.get("content", "").strip()
    if not content:
        raise OllamaError("Empty response from Ollama")
    return normalize_chat_answer(content)


def normalize_chat_answer(text: str) -> str:
    """Extract human-readable text when the model returns JSON or fenced JSON."""
    cleaned = text.strip()
    if not cleaned:
        return text

    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 2 and lines[0].startswith("```"):
            cleaned = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()

    parsed = _try_parse_json_object(cleaned)
    if parsed is not None:
        for key in ("message", "answer", "response", "content", "text", "reply"):
            value = parsed.get(key)
            if isinstance(value, str) and value.strip():
                return normalize_chat_answer(value.strip())

    return text.strip()


def _try_parse_json_object(raw: str) -> dict | None:
    if not raw.startswith("{"):
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def fallback_response(user_message: str, context: dict) -> str:
    """Rule-based answer when Ollama is unavailable."""
    summary = context.get("system_summary", {})
    lines = [
        "Ollama is currently unavailable. Here is a summary from live Synapse data:",
        "",
        f"• Routing: {summary.get('routing_total', 0)} studies processed "
        f"({summary.get('routing_success_rate_pct', 0)}% success, "
        f"{summary.get('routing_failed', 0)} failed)",
        f"• Migration: {summary.get('migration_studies_migrated', 0)} studies migrated, "
        f"{summary.get('migration_active_jobs', 0)} active jobs",
        f"• DIMSE listener: {'online' if summary.get('dimse_listening') else 'offline'}, "
        f"{summary.get('dimse_studies_assembled', 0)} studies assembled",
    ]

    if "study_lookup" in context:
        lookup = context["study_lookup"]
        if lookup.get("found"):
            lines.append(f"• Study lookup: found records for {lookup.get('study_uid', 'unknown')}")
            if "routing" in lookup:
                lines.append(f"  Routing status: {lookup['routing'].get('status')}")
            if "migration" in lookup:
                lines.append(f"  Migration status: {lookup['migration'].get('status')}")
        else:
            lines.append("• Study lookup: no matching records found")

    if "recent_activity" in context:
        act = context["recent_activity"]
        lines.append(
            f"• Last 24h: {act.get('last_24h_routed', 0)} routed, "
            f"{act.get('last_24h_migrated', 0)} migrated, "
            f"{act.get('last_24h_routing_failed', 0)} failed"
        )

    lines.append("")
    lines.append(f'Your question was: "{user_message}"')
    return "\n".join(lines)


def build_system_prompt(context: dict) -> str:
    context_json = json.dumps(context, indent=2, default=str)
    return f"""You are Synapse Assistant, a read-only operations chatbot for a DICOM Data Migration Router.
You help staff understand routing, migration jobs, and system status. You never modify configuration.

Rules:
- Answer ONLY using the JSON context below. If data is missing, say you don't have that information.
- Respond in plain conversational text only. Never wrap your reply in JSON, markdown code blocks, or structured objects.
- Be concise (2-5 sentences unless listing items).
- Use plain language suitable for healthcare IT operators.
- When citing counts or statuses, use exact numbers from context.
- Do not invent study UIDs, patient IDs, or destinations not in context.
- This is a read-only assistant; never claim you performed an action.

Operational context (JSON):
{context_json}"""
