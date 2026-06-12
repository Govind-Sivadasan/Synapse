"""PHI redaction for chatbot context and responses."""

import re

STUDY_UID_PATTERN = re.compile(r"\b1\.\d[\d.]{4,}\b")
PATIENT_ID_PATTERN = re.compile(r"\b(Patient\s*ID[:\s]+)([^\s,;]+)", re.IGNORECASE)
ACCESSION_PATTERN = re.compile(r"\b(Accession[:\s#]+)([^\s,;]+)", re.IGNORECASE)

PHI_KEYS = frozenset(
    {
        "patient_id",
        "PatientID",
        "accession_number",
        "AccessionNumber",
        "study_uid",
        "StudyInstanceUID",
        "subtitle",
    }
)


def mask_study_uid(uid: str) -> str:
    if len(uid) <= 12:
        return uid
    return f"{uid[:8]}…{uid[-4:]}"


def redact_text(text: str) -> str:
    text = STUDY_UID_PATTERN.sub(lambda m: mask_study_uid(m.group()), text)
    text = PATIENT_ID_PATTERN.sub(r"\1[REDACTED]", text)
    text = ACCESSION_PATTERN.sub(r"\1[REDACTED]", text)
    return text


def redact_value(key: str, value):
    if value is None:
        return None
    if key in PHI_KEYS or key.lower().endswith("patient_id"):
        if isinstance(value, str):
            if "study" in key.lower() or key.endswith("uid") or key.endswith("UID"):
                return mask_study_uid(value)
            return "[REDACTED]"
        return "[REDACTED]"
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return redact_structure(value)
    if isinstance(value, list):
        return [redact_structure(item) if isinstance(item, dict) else redact_text(str(item)) if isinstance(item, str) else item for item in value]
    return value


def redact_structure(data: dict | list) -> dict | list:
    if isinstance(data, list):
        return [redact_structure(item) if isinstance(item, (dict, list)) else item for item in data]
    result = {}
    for key, value in data.items():
        if isinstance(value, dict):
            result[key] = redact_structure(value)
        elif isinstance(value, list):
            result[key] = [
                redact_structure(v) if isinstance(v, dict) else redact_value(key, v) for v in value
            ]
        else:
            result[key] = redact_value(key, value)
    return result


def should_redact_phi(roles: list[str]) -> bool:
    """Viewers without elevated roles receive redacted chatbot output."""
    elevated = {"admin", "operator", "service_user"}
    return "viewer" in roles and not roles_intersect(roles, elevated)


def roles_intersect(roles: list[str], allowed: set[str]) -> bool:
    return any(r in allowed for r in roles)
