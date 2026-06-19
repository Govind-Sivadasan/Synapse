"""WADO-RS instance retrieval client."""

import re
from pathlib import Path

import httpx
import structlog

from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.dicom_json import TAG_SERIES_INSTANCE_UID, TAG_SOP_INSTANCE_UID, tag_value
from app.dicomweb.http_pool import get_dicomweb_client

logger = structlog.get_logger()

# Orthanc returns HTTP 400 for bare application/dicom; multipart is required.
WADO_ACCEPT_PREFERENCES = (
    'multipart/related; type="application/dicom"; transfer-syntax=*',
    "application/dicom",
)


class WadoRsError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


async def _get_json(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
) -> list[dict]:
    response = await client.get(url, headers={**headers, "Accept": "application/dicom+json"})
    if response.status_code >= 400:
        raise WadoRsError(
            f"WADO-RS metadata request failed: HTTP {response.status_code}: {response.text[:300]}",
            response.status_code,
        )
    data = response.json()
    return data if isinstance(data, list) else [data]


def _extract_multipart_dicom(body: bytes, content_type: str) -> bytes:
    """Parse a single-instance WADO-RS multipart/related response body."""
    match = re.search(r'boundary="?([^";\s]+)"?', content_type, re.IGNORECASE)
    if not match:
        raise WadoRsError(f"No multipart boundary in Content-Type: {content_type}")

    boundary = match.group(1)
    for part in body.split(f"--{boundary}".encode()):
        if b"\r\n\r\n" not in part:
            continue
        header_block, payload = part.split(b"\r\n\r\n", 1)
        if b"application/dicom" not in header_block.lower():
            continue
        payload = payload.rstrip(b"\r\n")
        if payload.endswith(b"--"):
            payload = payload[:-2].rstrip(b"\r\n")
        if payload:
            return payload

    raise WadoRsError("No application/dicom part found in WADO-RS multipart response")


def _decode_wado_instance(response: httpx.Response) -> bytes:
    content_type = response.headers.get("content-type", "")
    if content_type.lower().startswith("multipart/"):
        return _extract_multipart_dicom(response.content, content_type)
    return response.content


async def _retrieve_instance(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    sop_uid: str,
) -> bytes:
    last_status = 0
    for accept in WADO_ACCEPT_PREFERENCES:
        response = await client.get(url, headers={**headers, "Accept": accept})
        last_status = response.status_code
        if response.status_code < 400:
            return _decode_wado_instance(response)

    raise WadoRsError(
        f"WADO-RS retrieve failed for {sop_uid}: HTTP {last_status}",
        last_status,
    )


async def retrieve_study_instances(
    dicomweb_url: str,
    study_uid: str,
    auth: AuthHandler,
    output_dir: Path,
    timeout: float = 120.0,
) -> list[Path]:
    """Download all instances for a study via WADO-RS."""
    base_url = dicomweb_url.rstrip("/")
    headers = auth.get_headers()
    output_dir.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []

    client = get_dicomweb_client(base_url, timeout)

    series_url = f"{base_url}/studies/{study_uid}/series"
    series_list = await _get_json(client, series_url, headers)

    for series_item in series_list:
        series_uid = tag_value(series_item, TAG_SERIES_INSTANCE_UID)
        if not series_uid:
            continue

        instances_url = f"{base_url}/studies/{study_uid}/series/{series_uid}/instances"
        instances = await _get_json(client, instances_url, headers)

        for instance_item in instances:
            sop_uid = tag_value(instance_item, TAG_SOP_INSTANCE_UID)
            if not sop_uid:
                continue

            instance_url = (
                f"{base_url}/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}"
            )
            dicom_bytes = await _retrieve_instance(client, instance_url, headers, sop_uid)

            file_path = output_dir / f"{sop_uid}.dcm"
            file_path.write_bytes(dicom_bytes)
            saved.append(file_path)

    if not saved:
        raise WadoRsError(f"No instances retrieved for study {study_uid}")

    logger.info("wado_retrieve_complete", study_uid=study_uid, instances=len(saved))
    return saved
