"""STOW-RS multipart request builder and response parser."""

import uuid
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class StowRsResult:
    http_status: int
    accepted_instances: list[str] = field(default_factory=list)
    failed_instances: list[str] = field(default_factory=list)
    raw_response: str = ""


def build_multipart_body(dicom_files: list[Path], boundary: str | None = None) -> tuple[bytes, str]:
    boundary = boundary or f"synapse-{uuid.uuid4().hex}"
    lines: list[bytes] = []

    for file_path in dicom_files:
        data = file_path.read_bytes()
        lines.append(f"--{boundary}\r\n".encode())
        lines.append(b'Content-Type: application/dicom\r\n\r\n')
        lines.append(data)
        lines.append(b"\r\n")

    lines.append(f"--{boundary}--\r\n".encode())
    body = b"".join(lines)
    content_type = f'multipart/related; type="application/dicom"; boundary={boundary}'
    return body, content_type


def chunk_paths(dicom_files: list[Path], batch_size: int) -> list[list[Path]]:
    """Split instance files into STOW batches (single batch when batch_size <= 0)."""
    if not dicom_files:
        return []
    if batch_size <= 0 or batch_size >= len(dicom_files):
        return [dicom_files]
    return [dicom_files[index : index + batch_size] for index in range(0, len(dicom_files), batch_size)]


def parse_stow_response(http_status: int, response_text: str) -> StowRsResult:
    accepted: list[str] = []
    failed: list[str] = []

    if 200 <= http_status < 300:
        # Orthanc returns JSON with ID on success; treat 2xx as accepted
        accepted.append("study_uploaded")
    else:
        failed.append("upload_failed")

    return StowRsResult(
        http_status=http_status,
        accepted_instances=accepted,
        failed_instances=failed,
        raw_response=response_text[:2000],
    )
