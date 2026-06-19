"""Async DICOMweb client for STOW-RS uploads."""

import asyncio
import time
from pathlib import Path

import httpx
import structlog

from app.config import settings
from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.stow_rs import StowRsResult, build_multipart_body, parse_stow_response
from app.observability.metrics import observe_histogram

logger = structlog.get_logger()


class StowRsUploadError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


class DICOMwebClient:
    def __init__(self, max_retries: int | None = None, timeout: float = 120.0):
        self.max_retries = max_retries if max_retries is not None else settings.celery_max_retries
        self.timeout = timeout

    async def stow_rs(
        self,
        dicom_files: list[Path],
        endpoint_url: str,
        auth: AuthHandler,
    ) -> StowRsResult:
        if not dicom_files:
            raise StowRsUploadError("No DICOM files to upload")

        base_url = endpoint_url.rstrip("/")
        upload_url = f"{base_url}/studies"
        body, content_type = build_multipart_body(dicom_files)
        headers = {"Content-Type": content_type, "Accept": "application/dicom+json"}
        headers.update(auth.get_headers())

        last_error = ""
        for attempt in range(self.max_retries + 1):
            started = time.perf_counter()
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(upload_url, content=body, headers=headers)

                if response.status_code in (401, 403):
                    raise StowRsUploadError(
                        f"Authentication failed: HTTP {response.status_code}",
                        response.status_code,
                    )

                result = parse_stow_response(response.status_code, response.text)
                if 200 <= response.status_code < 300:
                    observe_histogram(
                        "synapse_dicomweb_request_duration_seconds",
                        time.perf_counter() - started,
                        {"operation": "stow_rs", "status": "success"},
                    )
                    logger.info(
                        "stow_rs_success",
                        url=upload_url,
                        files=len(dicom_files),
                        status=response.status_code,
                    )
                    return result

                last_error = f"HTTP {response.status_code}: {response.text[:500]}"
                observe_histogram(
                    "synapse_dicomweb_request_duration_seconds",
                    time.perf_counter() - started,
                    {"operation": "stow_rs", "status": "error"},
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(2**attempt)
            except httpx.RequestError as exc:
                last_error = str(exc)
                observe_histogram(
                    "synapse_dicomweb_request_duration_seconds",
                    time.perf_counter() - started,
                    {"operation": "stow_rs", "status": "error"},
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(2**attempt)

        raise StowRsUploadError(last_error or "STOW-RS upload failed")
