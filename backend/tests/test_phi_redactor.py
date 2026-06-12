"""Unit tests for chatbot PHI redaction."""

from app.chatbot.phi_redactor import mask_study_uid, redact_structure, redact_text, should_redact_phi


def test_mask_study_uid():
    uid = "1.2.840.113619.2.55.3.604688433.802.1715000000.123"
    masked = mask_study_uid(uid)
    assert "…" in masked
    assert uid not in masked


def test_redact_text_study_uid():
    text = "Study 1.2.840.113619.2.55.3.604688433.802.1715000000.123 failed."
    result = redact_text(text)
    assert "1.2.840.113619" not in result


def test_redact_structure_patient_id():
    data = {"routing": {"patient_id": "P12345", "modality": "CT"}}
    result = redact_structure(data)
    assert result["routing"]["patient_id"] == "[REDACTED]"
    assert result["routing"]["modality"] == "CT"


def test_should_redact_phi_viewer_only():
    assert should_redact_phi(["viewer"]) is True
    assert should_redact_phi(["service_user"]) is False
    assert should_redact_phi(["viewer", "admin"]) is False
