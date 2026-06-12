"""Unit tests for routing condition evaluation."""

from app.services.rule_evaluator import evaluate_condition


def test_equals_operator():
    metadata = {"Modality": "CT"}
    assert evaluate_condition(metadata, "Modality", "equals", "CT")
    assert not evaluate_condition(metadata, "Modality", "equals", "MR")


def test_contains_operator():
    metadata = {"StudyDescription": "Cardiac CT Angiography"}
    assert evaluate_condition(metadata, "StudyDescription", "contains", "Cardiac")
    assert not evaluate_condition(metadata, "StudyDescription", "contains", "Brain")


def test_starts_with_operator():
    metadata = {"PatientID": "TEST_PATIENT_001"}
    assert evaluate_condition(metadata, "PatientID", "starts_with", "TEST")


def test_regex_operator():
    metadata = {"AccessionNumber": "ACC-2026-001"}
    assert evaluate_condition(metadata, "AccessionNumber", "regex", r"ACC-\d{4}-\d+")
