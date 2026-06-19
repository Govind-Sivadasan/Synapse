"""WADO-RS instance retrieval client."""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
import structlog

from app.config import settings
from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.dicom_json import TAG_SERIES_INSTANCE_UID, TAG_SOP_INSTANCE_UID, tag_value
from app.dicomweb.http_pool import get_dicomweb_client
from app.observability.metrics import observe_histogram

logger = structlog.get_logger()

WADO_ACCEPT_PREFERENCES = (
    'multipart/related; type="application/dicom"; transfer-syntax=*',
    "application/dicom",
)


class WadoRsError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class _InstanceRef:
    sop_uid: str
    url: str


async def _get_json(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
) -> list[dict]:
    started = time.perf_counter()
    response = await client.get(url, headers={**headers, "Accept": "application/dicom+json"})
    if response.status_code >= 400:
        observe_histogram(
            "synapse_dicomweb_request_duration_seconds",
            time.perf_counter() - started,
            {"operation": "wado_rs", "status": "error"},
        )
        raise WadoRsError(
            f"WADO-RS metadata request failed: HTTP {response.status_code}: {response.text[:300]}",
            response.status_code,
        )
    observe_histogram(
        "synapse_dicomweb_request_duration_seconds",
        time.perf_counter() - started,
        {"operation": "wado_rs", "status": "success"},
    )
    data = response.json()
    return data if isinstance(data, list) else [data]


def _extract_multipart_dicom(body: bytes, content_type: str) -> bytes:
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
    started = time.perf_counter()
    last_status = 0
    for accept in WADO_ACCEPT_PREFERENCES:
        response = await client.get(url, headers={**headers, "Accept": accept})
        last_status = response.status_code
        if response.status_code < 400:
            observe_histogram(
                "synapse_dicomweb_request_duration_seconds",
                time.perf_counter() - started,
                {"operation": "wado_rs", "status": "success"},
            )
            return _decode_wado_instance(response)

    observe_histogram(
        "synapse_dicomweb_request_duration_seconds",
        time.perf_counter() - started,
        {"operation": "wado_rs", "status": "error"},
    )
    raise WadoRsError(
        f"WADO-RS retrieve failed for {sop_uid}: HTTP {last_status}",
        last_status,
    )


async def _collect_instance_refs(
    client: httpx.AsyncClient,
    base_url: str,
    study_uid: str,
    headers: dict[str, str],
) -> list[_InstanceRef]:
    refs: list[_InstanceRef] = []
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
            refs.append(
                _InstanceRef(
                    sop_uid=sop_uid,
                    url=f"{base_url}/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}",
                )
            )

    return refs


async def _download_one_instance(
    ref: _InstanceRef,
    client: httpx.AsyncClient,
    headers: dict[str, str],
    output_dir: Path,
    semaphore: asyncio.Semaphore,
) -> Path:
    async with semaphore:
        dicom_bytes = await _retrieve_instance(client, ref.url, headers, ref.sop_uid)
        file_path = output_dir / f"{ref.sop_uid}.dcm"
        file_path.write_bytes(dicom_bytes)
        return file_path


async def retrieve_study_instances(
    dicomweb_url: str,
    study_uid: str,
    auth: AuthHandler,
    output_dir: Path,
    timeout: float | None = None,
    *,
    parallel_instances: int | None = None,
) -> list[Path]:
    """Download all instances for a study via WADO-RS (parallel instance fetch in Phase 2)."""
    effective_timeout = timeout if timeout is not None else settings.dicomweb_http_timeout
    concurrency = parallel_instances if parallel_instances is not None else settings.wado_parallel_instances
    concurrency = max(1, concurrency)

    base_url = dicomweb_url.rstrip("/")
    headers = auth.get_headers()
    output_dir.mkdir(parents=True, exist_ok=True)

    client = get_dicomweb_client(base_url, effective_timeout)
    refs = await _collect_instance_refs(client, base_url, study_uid, headers)

    if not refs:
        raise WadoRsError(f"No instances retrieved for study {study_uid}")

    semaphore = asyncio.Semaphore(concurrency)
    saved = await asyncio.gather(
        *[_download_one_instance(ref, client, headers, output_dir, semaphore) for ref in refs]
    )

    logger.info(
        "wado_retrieve_complete",
        study_uid=study_uid,
        instances=len(saved),
        parallel_instances=concurrency,
    )
    return list(saved)
