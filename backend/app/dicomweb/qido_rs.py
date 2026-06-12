"""QIDO-RS study search client."""

from dataclasses import dataclass

import httpx
import structlog

from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.dicom_json import parse_study_metadata

logger = structlog.get_logger()


class QidoRsError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class QidoStudy:
    study_uid: str
    patient_id: str | None = None
    modality: str | None = None
    study_date: str | None = None


def build_qido_params(filters: dict | None, limit: int = 100, offset: int = 0) -> dict[str, str | int]:
    params: dict[str, str | int] = {"limit": limit, "offset": offset}
    if not filters:
        return params

    if filters.get("modality"):
        params["Modality"] = filters["modality"]
    if filters.get("patient_id"):
        params["PatientID"] = filters["patient_id"]
    if filters.get("date_from") and filters.get("date_to"):
        params["StudyDate"] = f"{filters['date_from']}-{filters['date_to']}"
    elif filters.get("date_from"):
        params["StudyDate"] = f"{filters['date_from']}-"
    elif filters.get("date_to"):
        params["StudyDate"] = f"-{filters['date_to']}"

    return params


async def search_studies(
    dicomweb_url: str,
    auth: AuthHandler,
    filters: dict | None = None,
    limit: int = 100,
    offset: int = 0,
    timeout: float = 60.0,
) -> list[QidoStudy]:
    base_url = dicomweb_url.rstrip("/")
    url = f"{base_url}/studies"
    headers = {"Accept": "application/dicom+json"}
    headers.update(auth.get_headers())
    params = build_qido_params(filters, limit=limit, offset=offset)

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(url, headers=headers, params=params)

    if response.status_code in (401, 403):
        raise QidoRsError(f"Authentication failed: HTTP {response.status_code}", response.status_code)
    if response.status_code >= 400:
        raise QidoRsError(
            f"QIDO-RS search failed: HTTP {response.status_code}: {response.text[:500]}",
            response.status_code,
        )

    items = response.json()
    if not isinstance(items, list):
        raise QidoRsError("Unexpected QIDO-RS response format")

    studies: list[QidoStudy] = []
    for item in items:
        meta = parse_study_metadata(item)
        study_uid = meta.get("study_uid")
        if not study_uid:
            continue
        studies.append(
            QidoStudy(
                study_uid=study_uid,
                patient_id=meta.get("patient_id"),
                modality=meta.get("modality"),
                study_date=meta.get("study_date"),
            )
        )

    logger.info("qido_search_complete", count=len(studies), offset=offset, limit=limit)
    return studies
