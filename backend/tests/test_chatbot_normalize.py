"""Unit tests for chatbot answer normalization."""

from app.chatbot.ollama_client import normalize_chat_answer


def test_normalize_plain_text_unchanged():
    text = "Migration completed 101 studies with no failures."
    assert normalize_chat_answer(text) == text


def test_normalize_json_message_field():
    raw = '{\n  "message": "You\'re welcome! Ask if you need anything else."\n}'
    assert normalize_chat_answer(raw) == "You're welcome! Ask if you need anything else."


def test_normalize_json_answer_field():
    raw = '{"answer": "The DIMSE listener is online."}'
    assert normalize_chat_answer(raw) == "The DIMSE listener is online."


def test_normalize_fenced_json():
    raw = """```json
{"message": "Hello from Synapse."}
```"""
    assert normalize_chat_answer(raw) == "Hello from Synapse."


def test_normalize_invalid_json_returns_original():
    raw = "{not valid json"
    assert normalize_chat_answer(raw) == raw
