"""Helpers for parsing DICOM JSON (application/dicom+json) responses."""

from datetime import date

# Common DICOM tag hex → name mapping for QIDO/WADO metadata
TAG_STUDY_INSTANCE_UID = "0020000D"
TAG_SERIES_INSTANCE_UID = "0020000E"
TAG_SOP_INSTANCE_UID = "00080018"
TAG_PATIENT_ID = "00100020"
TAG_MODALITY = "00080060"
TAG_STUDY_DATE = "00080020"

TAG_TO_NAME = {
    TAG_STUDY_INSTANCE_UID: "StudyInstanceUID",
    TAG_SERIES_INSTANCE_UID: "SeriesInstanceUID",
    TAG_SOP_INSTANCE_UID: "SOPInstanceUID",
    TAG_PATIENT_ID: "PatientID",
    TAG_MODALITY: "Modality",
    TAG_STUDY_DATE: "StudyDate",
}


def tag_value(item: dict, tag_hex: str) -> str | None:
    """Extract first string value for a DICOM JSON tag entry."""
    entry = item.get(tag_hex)
    if not entry:
        return None
    values = entry.get("Value")
    if not values:
        return None
    return str(values[0])


def parse_study_metadata(item: dict) -> dict[str, str | None]:
    study_uid = tag_value(item, TAG_STUDY_INSTANCE_UID)
    patient_id = tag_value(item, TAG_PATIENT_ID)
    modality = tag_value(item, TAG_MODALITY)
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
