"""Unit tests for DICOM JSON parsing helpers."""

from datetime import date

from app.dicomweb.dicom_json import (
    QIDO_STUDY_INCLUDE_KEYWORDS,
    parse_modality_from_study,
    parse_study_date,
    parse_study_metadata,
    tag_value,
)
from app.dicomweb.qido_rs import build_qido_params


def test_tag_value_extracts_first_value():
    item = {"0020000D": {"vr": "UI", "Value": ["1.2.3.4"]}}
    assert tag_value(item, "0020000D") == "1.2.3.4"


def test_parse_study_metadata_modalities_in_study():
    item = {
        "0020000D": {"vr": "UI", "Value": ["1.2.3"]},
        "00100020": {"vr": "LO", "Value": ["P001"]},
        "00080061": {"vr": "CS", "Value": ["CT", "SR"]},
        "00080020": {"vr": "DA", "Value": ["20240115"]},
    }
    meta = parse_study_metadata(item)
    assert meta["study_uid"] == "1.2.3"
    assert meta["patient_id"] == "P001"
    assert meta["modality"] == "CT, SR"
    assert meta["study_date"] == "2024-01-15"


def test_parse_modality_from_study_prefers_modalities_in_study():
    item = {
        "00080061": {"vr": "CS", "Value": ["mr"]},
        "00080060": {"vr": "CS", "Value": ["CT"]},
    }
    assert parse_modality_from_study(item) == ("MR", None)


def test_parse_study_metadata_series_modality_fallback():
    item = {
        "0020000D": {"vr": "UI", "Value": ["1.2.3"]},
        "00080060": {"vr": "CS", "Value": ["CT"]},
    }
    meta = parse_study_metadata(item)
    assert meta["modality"] == "CT"


def test_parse_study_date():
    assert parse_study_date("2024-01-15") == date(2024, 1, 15)
    assert parse_study_date("20240115") == date(2024, 1, 15)
    assert parse_study_date(None) is None


def test_parse_study_metadata_extended_fields():
    item = {
        "0020000D": {"vr": "UI", "Value": ["1.2.3"]},
        "00100020": {"vr": "LO", "Value": ["P001"]},
        "00100010": {"vr": "PN", "Value": [{"Alphabetic": "DOE^JOHN"}]},
        "00100030": {"vr": "DA", "Value": ["19800115"]},
        "00080061": {"vr": "CS", "Value": ["MG"]},
        "00080020": {"vr": "DA", "Value": ["20260313"]},
        "00080030": {"vr": "TM", "Value": ["073525"]},
        "00080022": {"vr": "DA", "Value": ["20260312"]},
        "00081030": {"vr": "LO", "Value": ["BREAST IMAGING"]},
        "00080050": {"vr": "SH", "Value": ["ACC401356"]},
        "00080090": {"vr": "PN", "Value": [{"Alphabetic": "SMITH^JANE"}]},
        "00081010": {"vr": "SH", "Value": ["CT01"]},
        "00180015": {"vr": "CS", "Value": ["BREAST"]},
        "00181030": {"vr": "LO", "Value": ["MG ROUTINE"]},
        "00181400": {"vr": "LO", "Value": ["TOMO SYNTHESIS"]},
        "00321060": {"vr": "LO", "Value": ["SCREENING MAMMO"]},
        "00380300": {"vr": "LO", "Value": ["WARD-A"]},
        "00201206": {"vr": "IS", "Value": ["7"]},
        "00201208": {"vr": "IS", "Value": ["20"]},
    }
    meta = parse_study_metadata(item)
    assert meta["patient_name"] == "DOE JOHN"
    assert meta["patient_birth_date"] == "1980-01-15"
    assert meta["study_time"] == "07:35:25"
    assert meta["acquisition_date"] == "2026-03-12"
    assert meta["study_description"] == "BREAST IMAGING"
    assert meta["accession_number"] == "ACC401356"
    assert meta["referring_physician"] == "SMITH JANE"
    assert meta["station_name"] == "CT01"
    assert meta["body_part_examined"] == "BREAST"
    assert meta["protocol_name"] == "MG ROUTINE"
    assert meta["acquisition_description"] == "TOMO SYNTHESIS"
    assert meta["requested_procedure"] == "SCREENING MAMMO"
    assert meta["patient_location"] == "WARD-A"
    assert meta["num_series"] == 7
    assert meta["num_instances"] == 20


def test_tag_value_supports_keyword_keys():
    item = {"StudyInstanceUID": {"vr": "UI", "Value": ["1.2.3.4"]}}
    assert tag_value(item, "0020000D") == "1.2.3.4"


def test_parse_modality_rejects_free_text_and_joins_codes():
    item = {
        "00080061": {"vr": "CS", "Value": ["SC, CT"]},
    }
    assert parse_modality_from_study(item) == ("SC, CT", None)

    garbage = {
        "00080061": {"vr": "CS", "Value": ["ABNORMAL FINDINGS/DIAG IMAGIN/75ML"]},
    }
    assert parse_modality_from_study(garbage) == (None, "ABNORMAL FINDINGS/DIAG IMAGIN/75ML")


def test_parse_study_metadata_uses_modality_overflow_as_description():
    item = {
        "0020000D": {"vr": "UI", "Value": ["1.2.3"]},
        "00080061": {"vr": "CS", "Value": ["ABNORMAL FINDINGS/DIAG IMAGIN/75ML"]},
    }
    meta = parse_study_metadata(item)
    assert meta["modality"] is None
    assert meta["study_description"] == "ABNORMAL FINDINGS/DIAG IMAGIN/75ML"


def test_qido_study_include_keywords_cover_standard_study_tags():
    assert "PatientBirthDate" in QIDO_STUDY_INCLUDE_KEYWORDS
    assert "ReferringPhysicianName" in QIDO_STUDY_INCLUDE_KEYWORDS
    assert "CurrentPatientLocation" in QIDO_STUDY_INCLUDE_KEYWORDS


def test_build_qido_params_with_filters():
    params = build_qido_params(
        {"modality": "CT", "patient_id": "P1", "date_from": "20240101", "date_to": "20241231"},
        limit=50,
        offset=10,
    )
    assert params["ModalitiesInStudy"] == "CT"
    assert params["PatientID"] == "P1"
    assert params["StudyDate"] == "20240101-20241231"
    assert params["limit"] == 50
    assert params["offset"] == 10
