"""WADO-RS instance retrieval client."""

from pathlib import Path

import httpx
import structlog

from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.dicom_json import TAG_SERIES_INSTANCE_UID, TAG_SOP_INSTANCE_UID, tag_value

logger = structlog.get_logger()


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

    async with httpx.AsyncClient(timeout=timeout) as client:
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
                dicom_response = await client.get(
                    instance_url,
                    headers={**headers, "Accept": "application/dicom"},
                )
                if dicom_response.status_code >= 400:
                    raise WadoRsError(
                        f"WADO-RS retrieve failed for {sop_uid}: HTTP {dicom_response.status_code}",
                        dicom_response.status_code,
                    )

                file_path = output_dir / f"{sop_uid}.dcm"
                file_path.write_bytes(dicom_response.content)
                saved.append(file_path)

    if not saved:
        raise WadoRsError(f"No instances retrieved for study {study_uid}")

    logger.info("wado_retrieve_complete", study_uid=study_uid, instances=len(saved))
    return saved
