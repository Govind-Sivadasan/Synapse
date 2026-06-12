"""Unit tests for chatbot fallback responses."""

from app.chatbot.ollama_client import fallback_response


def test_fallback_includes_summary():
    context = {
        "system_summary": {
            "routing_total": 10,
            "routing_success_rate_pct": 80.0,
            "routing_failed": 2,
            "migration_studies_migrated": 5,
            "migration_active_jobs": 1,
            "dimse_listening": True,
            "dimse_studies_assembled": 10,
        }
    }
    answer = fallback_response("What is the migration status?", context)
    assert "10" in answer
    assert "Ollama is currently unavailable" in answer
