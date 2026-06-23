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
TAG_STUDY_TIME = "00080030"
TAG_PATIENT_NAME = "00100010"
TAG_STUDY_DESCRIPTION = "00081030"
TAG_ACCESSION_NUMBER = "00080050"
TAG_NUMBER_OF_STUDY_RELATED_SERIES = "00201206"
TAG_NUMBER_OF_STUDY_RELATED_INSTANCES = "00201208"
TAG_PATIENT_BIRTH_DATE = "00100030"
TAG_ACQUISITION_DATE = "00080022"
TAG_REFERRING_PHYSICIAN_NAME = "00080090"
TAG_STATION_NAME = "00081010"
TAG_BODY_PART_EXAMINED = "00180015"
TAG_PROTOCOL_NAME = "00181030"
TAG_ACQUISITION_DESCRIPTION = "00181400"
TAG_REQUESTED_PROCEDURE_DESCRIPTION = "00321060"
TAG_CURRENT_PATIENT_LOCATION = "00380300"

# Study-level QIDO uses ModalitiesInStudy (0008,0061); Modality (0008,0060) is series-level.
STUDY_MODALITY_QUERY_KEYS = ("ModalitiesInStudy", "Modality")

TAG_TO_NAME = {
    TAG_STUDY_INSTANCE_UID: "StudyInstanceUID",
    TAG_SERIES_INSTANCE_UID: "SeriesInstanceUID",
    TAG_SOP_INSTANCE_UID: "SOPInstanceUID",
    TAG_PATIENT_ID: "PatientID",
    TAG_PATIENT_NAME: "PatientName",
    TAG_MODALITY: "Modality",
    TAG_MODALITIES_IN_STUDY: "ModalitiesInStudy",
    TAG_STUDY_DATE: "StudyDate",
    TAG_STUDY_TIME: "StudyTime",
    TAG_STUDY_DESCRIPTION: "StudyDescription",
    TAG_ACCESSION_NUMBER: "AccessionNumber",
    TAG_NUMBER_OF_STUDY_RELATED_SERIES: "NumberOfStudyRelatedSeries",
    TAG_NUMBER_OF_STUDY_RELATED_INSTANCES: "NumberOfStudyRelatedInstances",
    TAG_PATIENT_BIRTH_DATE: "PatientBirthDate",
    TAG_ACQUISITION_DATE: "AcquisitionDate",
    TAG_REFERRING_PHYSICIAN_NAME: "ReferringPhysicianName",
    TAG_STATION_NAME: "StationName",
    TAG_BODY_PART_EXAMINED: "BodyPartExamined",
    TAG_PROTOCOL_NAME: "ProtocolName",
    TAG_ACQUISITION_DESCRIPTION: "AcquisitionDeviceProcessingDescription",
    TAG_REQUESTED_PROCEDURE_DESCRIPTION: "RequestedProcedureDescription",
    TAG_CURRENT_PATIENT_LOCATION: "CurrentPatientLocation",
}

# QIDO includefield keywords for study search (standard tags only).
QIDO_STUDY_INCLUDE_KEYWORDS = tuple(TAG_TO_NAME.values())

KEYWORD_TO_TAG = {name: tag for tag, name in TAG_TO_NAME.items()}


def tag_entry(item: dict, tag_hex: str) -> dict | None:
    """Return a DICOM JSON attribute entry by hex tag or keyword."""
    keyword = TAG_TO_NAME.get(tag_hex)
    if keyword and keyword in item:
        return item[keyword]
    return item.get(tag_hex)


def tag_value(item: dict, tag_hex: str) -> str | None:
    """Extract first string value for a DICOM JSON tag entry."""
    values = tag_values(item, tag_hex)
    if not values:
        return None
    return values[0]


def tag_values(item: dict, tag_hex: str) -> list[str]:
    """Extract all string values for a DICOM JSON tag entry."""
    entry = tag_entry(item, tag_hex)
    if not entry:
        return []
    raw = entry.get("Value")
    if not raw:
        return []
    values: list[str] = []
    for value in raw:
        if isinstance(value, dict):
            pn = value.get("Alphabetic") or value.get("Ideographic") or value.get("Phonetic")
            if pn:
                values.append(str(pn))
                continue
        values.append(str(value))
    return values


def parse_person_name(item: dict) -> str | None:
    """Read PatientName from DICOM JSON (PN may be a string or PersonName object)."""
    return parse_dicom_person_name(item, TAG_PATIENT_NAME)


def parse_dicom_person_name(item: dict, tag_hex: str) -> str | None:
    value = tag_value(item, tag_hex)
    if not value:
        return None
    return value.replace("^", " ").strip() or None


def format_dicom_date(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.replace("-", "").strip()
    if len(cleaned) == 8 and cleaned.isdigit():
        return f"{cleaned[:4]}-{cleaned[4:6]}-{cleaned[6:8]}"
    return value


def format_study_time(value: str | None) -> str | None:
    if not value:
        return None
    digits = value.split(".")[0]
    if len(digits) == 6 and digits.isdigit():
        return f"{digits[:2]}:{digits[2:4]}:{digits[4:6]}"
    return value


def parse_int_tag(item: dict, tag_hex: str) -> int | None:
    value = tag_value(item, tag_hex)
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _is_modality_token(token: str) -> bool:
    """True when value looks like a DICOM modality code (CS), not free text."""
    cleaned = token.strip().upper()
    if not cleaned or len(cleaned) > 16:
        return False
    if any(ch in cleaned for ch in " /\\"):
        return False
    return cleaned.isalnum()


def _modality_tokens_from_values(values: list[str]) -> tuple[list[str], list[str]]:
    """Split QIDO modality values into valid codes and rejected free-text."""
    valid: list[str] = []
    rejected: list[str] = []
    for value in values:
        for part in value.split(","):
            token = part.strip()
            if not token:
                continue
            upper = token.upper()
            if _is_modality_token(token):
                if upper not in valid:
                    valid.append(upper)
            elif len(token) > 8:
                rejected.append(token)
    return valid, rejected


def parse_modality_from_study(item: dict) -> tuple[str | None, str | None]:
    """Read modality codes from study-level QIDO metadata (PACS-varying tags)."""
    values = tag_values(item, TAG_MODALITIES_IN_STUDY) or tag_values(item, TAG_MODALITY)
    if not values:
        return None, None
    valid, rejected = _modality_tokens_from_values(values)
    modality = ", ".join(valid) if valid else None
    overflow_description = rejected[0] if rejected and not modality else None
    return modality, overflow_description


def parse_study_metadata(item: dict) -> dict[str, str | int | None]:
    study_uid = tag_value(item, TAG_STUDY_INSTANCE_UID)
    patient_id = tag_value(item, TAG_PATIENT_ID)
    modality, modality_overflow = parse_modality_from_study(item)
    study_description = tag_value(item, TAG_STUDY_DESCRIPTION) or modality_overflow

    return {
        "study_uid": study_uid,
        "patient_id": patient_id,
        "patient_name": parse_person_name(item),
        "patient_birth_date": format_dicom_date(tag_value(item, TAG_PATIENT_BIRTH_DATE)),
        "modality": modality,
        "study_date": format_dicom_date(tag_value(item, TAG_STUDY_DATE)),
        "study_time": format_study_time(tag_value(item, TAG_STUDY_TIME)),
        "acquisition_date": format_dicom_date(tag_value(item, TAG_ACQUISITION_DATE)),
        "study_description": study_description,
        "accession_number": tag_value(item, TAG_ACCESSION_NUMBER),
        "referring_physician": parse_dicom_person_name(item, TAG_REFERRING_PHYSICIAN_NAME),
        "station_name": tag_value(item, TAG_STATION_NAME),
        "body_part_examined": tag_value(item, TAG_BODY_PART_EXAMINED),
        "protocol_name": tag_value(item, TAG_PROTOCOL_NAME),
        "acquisition_description": tag_value(item, TAG_ACQUISITION_DESCRIPTION),
        "requested_procedure": tag_value(item, TAG_REQUESTED_PROCEDURE_DESCRIPTION),
        "patient_location": tag_value(item, TAG_CURRENT_PATIENT_LOCATION),
        "num_series": parse_int_tag(item, TAG_NUMBER_OF_STUDY_RELATED_SERIES),
        "num_instances": parse_int_tag(item, TAG_NUMBER_OF_STUDY_RELATED_INSTANCES),
    }


def parse_study_date(value: str | None) -> date | None:
    if not value:
        return None
    cleaned = value.replace("-", "")
    if len(cleaned) != 8 or not cleaned.isdigit():
        return None
    return date(int(cleaned[:4]), int(cleaned[4:6]), int(cleaned[6:8]))
