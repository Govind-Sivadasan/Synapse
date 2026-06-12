"""Unit tests for STOW-RS multipart body builder."""

from pathlib import Path

import pydicom
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.dicomweb.stow_rs import build_multipart_body, parse_stow_response


def _minimal_dicom(path: Path) -> None:
    sop_class = "1.2.840.10008.5.1.4.1.1.2"
    sop_uid = generate_uid()
    ds = Dataset()
    ds.file_meta = FileMetaDataset()
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.file_meta.MediaStorageSOPClassUID = sop_class
    ds.file_meta.MediaStorageSOPInstanceUID = sop_uid
    ds.SOPClassUID = sop_class
    ds.SOPInstanceUID = sop_uid
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.save_as(path, enforce_file_format=True)


def test_build_multipart_body(tmp_path):
    f1 = tmp_path / "a.dcm"
    f2 = tmp_path / "b.dcm"
    _minimal_dicom(f1)
    _minimal_dicom(f2)

    body, content_type = build_multipart_body([f1, f2], boundary="testboundary")
    assert b"--testboundary" in body
    assert b"application/dicom" in body
    assert b"--testboundary--" in body
    assert 'boundary=testboundary' in content_type


def test_parse_stow_response_success():
    result = parse_stow_response(200, '{"ID":"abc"}')
    assert result.http_status == 200
    assert len(result.accepted_instances) == 1


def test_parse_stow_response_failure():
    result = parse_stow_response(500, "error")
    assert result.http_status == 500
    assert len(result.failed_instances) == 1
