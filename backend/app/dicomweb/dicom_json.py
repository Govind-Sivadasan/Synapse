"""Helpers for parsing DICOM JSON (application/dicom+json) responses."""

from datetime import date

# Common DICOM tag hex → name mapping for QIDO/WADO metadata
TAG_STUDY_INSTANCE_UID = "0020000D"
TAG_SERIES_INSTANCE_UID = "0020000E"
TAG_SOP_INSTANCE_UID = "00080018"
TAG_PATIENT_ID = "00100020"
TAG_MODALITY = "00080060"
TAG_MODALITIES_IN_STUDY = "00080061"
TAG_STUDY_DATE = "00080020"

# Study-level QIDO uses ModalitiesInStudy (0008,0061); Modality (0008,0060) is series-level.
STUDY_MODALITY_QUERY_KEYS = ("ModalitiesInStudy", "Modality")

TAG_TO_NAME = {
    TAG_STUDY_INSTANCE_UID: "StudyInstanceUID",
    TAG_SERIES_INSTANCE_UID: "SeriesInstanceUID",
    TAG_SOP_INSTANCE_UID: "SOPInstanceUID",
    TAG_PATIENT_ID: "PatientID",
    TAG_MODALITY: "Modality",
    TAG_MODALITIES_IN_STUDY: "ModalitiesInStudy",
    TAG_STUDY_DATE: "StudyDate",
}


def tag_value(item: dict, tag_hex: str) -> str | None:
    """Extract first string value for a DICOM JSON tag entry."""
    values = tag_values(item, tag_hex)
    if not values:
        return None
    return values[0]


def tag_values(item: dict, tag_hex: str) -> list[str]:
    """Extract all string values for a DICOM JSON tag entry."""
    entry = item.get(tag_hex)
    if not entry:
        return []
    raw = entry.get("Value")
    if not raw:
        return []
    return [str(value) for value in raw]


def parse_modality_from_study(item: dict) -> str | None:
    """Read modality from study-level QIDO metadata (PACS-varying tags)."""
    values = tag_values(item, TAG_MODALITIES_IN_STUDY) or tag_values(item, TAG_MODALITY)
    if not values:
        return None
    # Store the primary modality; multi-modality studies keep the first CS value.
    return values[0].strip().upper() or None


def parse_study_metadata(item: dict) -> dict[str, str | None]:
    study_uid = tag_value(item, TAG_STUDY_INSTANCE_UID)
    patient_id = tag_value(item, TAG_PATIENT_ID)
    modality = parse_modality_from_study(item)
    study_date_raw = tag_value(item, TAG_STUDY_DATE)
    study_date: str | None = study_date_raw
    if study_date_raw and len(study_date_raw) == 8:
        study_date = f"{study_date_raw[:4]}-{study_date_raw[4:6]}-{study_date_raw[6:8]}"

    return {
        "study_uid": study_uid,
        "patient_id": patient_id,
        "modality": modality,
        "study_date": study_date,
    }


def parse_study_date(value: str | None) -> date | None:
    if not value:
        return None
    cleaned = value.replace("-", "")
    if len(cleaned) != 8 or not cleaned.isdigit():
        return None
    return date(int(cleaned[:4]), int(cleaned[4:6]), int(cleaned[6:8]))
