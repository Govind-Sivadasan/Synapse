"""Async DICOMweb client for STOW-RS uploads."""

import asyncio
import time
from pathlib import Path

import httpx
import structlog

from app.config import settings
from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.http_pool import get_dicomweb_client
from app.dicomweb.stow_rs import StowRsResult, build_multipart_body, chunk_paths, parse_stow_response
from app.observability.metrics import observe_histogram
from app.services.stow_rate_limiter import wait_for_stow_rate_limit

logger = structlog.get_logger()


class StowRsUploadError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


class DICOMwebClient:
    def __init__(self, max_retries: int | None = None, timeout: float = 120.0):
        self.max_retries = max_retries if max_retries is not None else settings.celery_max_retries
        self.timeout = timeout

    async def _upload_batch(
        self,
        batch: list[Path],
        upload_url: str,
        headers: dict[str, str],
        *,
        batch_index: int,
        batch_count: int,
    ) -> StowRsResult:
        await wait_for_stow_rate_limit(upload_url)
        body, content_type = build_multipart_body(batch)
        request_headers = {**headers, "Content-Type": content_type}
        last_error = ""

        for attempt in range(self.max_retries + 1):
            started = time.perf_counter()
            try:
                client = get_dicomweb_client(upload_url, self.timeout)
                response = await client.post(upload_url, content=body, headers=request_headers)

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
                        "stow_rs_batch_success",
                        url=upload_url,
                        files=len(batch),
                        batch_index=batch_index,
                        batch_count=batch_count,
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

    async def stow_rs(
        self,
        dicom_files: list[Path],
        endpoint_url: str,
        auth: AuthHandler,
        *,
        batch_size: int | None = None,
        parallel_batches: int | None = None,
    ) -> StowRsResult:
        if not dicom_files:
            raise StowRsUploadError("No DICOM files to upload")

        effective_batch_size = batch_size if batch_size is not None else settings.stow_batch_size
        effective_parallel = parallel_batches if parallel_batches is not None else settings.stow_parallel_batches
        effective_parallel = max(1, effective_parallel)

        base_url = endpoint_url.rstrip("/")
        upload_url = f"{base_url}/studies"
        headers = {"Accept": "application/dicom+json"}
        headers.update(auth.get_headers())

        batches = chunk_paths(dicom_files, effective_batch_size)
        semaphore = asyncio.Semaphore(effective_parallel)

        async def upload_one(batch_index: int, batch: list[Path]) -> StowRsResult:
            async with semaphore:
                return await self._upload_batch(
                    batch,
                    upload_url,
                    headers,
                    batch_index=batch_index,
                    batch_count=len(batches),
                )

        results = await asyncio.gather(
            *[upload_one(index, batch) for index, batch in enumerate(batches)]
        )

        logger.info(
            "stow_rs_complete",
            url=upload_url,
            files=len(dicom_files),
            batches=len(batches),
            parallel_batches=effective_parallel,
            batch_size=effective_batch_size,
        )

        if len(results) == 1:
            return results[0]

        return StowRsResult(
            http_status=200,
            accepted_instances=["study_uploaded"],
            raw_response=f"{len(batches)} batches",
        )
