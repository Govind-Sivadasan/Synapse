"""Unit tests for DICOM JSON parsing helpers."""

from datetime import date

from app.dicomweb.dicom_json import parse_study_date, parse_study_metadata, tag_value
from app.dicomweb.qido_rs import build_qido_params


def test_tag_value_extracts_first_value():
    item = {"0020000D": {"vr": "UI", "Value": ["1.2.3.4"]}}
    assert tag_value(item, "0020000D") == "1.2.3.4"


def test_parse_study_metadata():
    item = {
        "0020000D": {"vr": "UI", "Value": ["1.2.3"]},
        "00100020": {"vr": "LO", "Value": ["P001"]},
        "00080060": {"vr": "CS", "Value": ["CT"]},
        "00080020": {"vr": "DA", "Value": ["20240115"]},
    }
    meta = parse_study_metadata(item)
    assert meta["study_uid"] == "1.2.3"
    assert meta["patient_id"] == "P001"
    assert meta["modality"] == "CT"
    assert meta["study_date"] == "2024-01-15"


def test_parse_study_date():
    assert parse_study_date("2024-01-15") == date(2024, 1, 15)
    assert parse_study_date("20240115") == date(2024, 1, 15)
    assert parse_study_date(None) is None


def test_build_qido_params_with_filters():
    params = build_qido_params(
        {"modality": "CT", "patient_id": "P1", "date_from": "20240101", "date_to": "20241231"},
        limit=50,
        offset=10,
    )
    assert params["Modality"] == "CT"
    assert params["PatientID"] == "P1"
    assert params["StudyDate"] == "20240101-20241231"
    assert params["limit"] == 50
    assert params["offset"] == 10
