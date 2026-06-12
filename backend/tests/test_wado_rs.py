"""Unit tests for WADO-RS multipart response parsing."""

from app.dicomweb.wado_rs import _extract_multipart_dicom


def test_extract_multipart_dicom_single_part():
    dicom_payload = b"\x00\x01\x02DICM\xff\xfe"
    body = (
        b"--boundary123\r\n"
        b"Content-Type: application/dicom\r\n\r\n"
        + dicom_payload
        + b"\r\n--boundary123--\r\n"
    )
    content_type = 'multipart/related; type="application/dicom"; boundary=boundary123'

    assert _extract_multipart_dicom(body, content_type) == dicom_payload
