"""QIDO-RS study search client."""

from dataclasses import dataclass

import httpx
import structlog

from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.dicom_json import STUDY_MODALITY_QUERY_KEYS, parse_study_metadata
from app.dicomweb.http_pool import get_dicomweb_client

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


def build_qido_params(
    filters: dict | None,
    limit: int = 100,
    offset: int = 0,
    *,
    modality_query_key: str = STUDY_MODALITY_QUERY_KEYS[0],
) -> dict[str, str | int]:
    params: dict[str, str | int] = {"limit": limit, "offset": offset}
    if not filters:
        return params

    if filters.get("modality"):
        params[modality_query_key] = str(filters["modality"]).strip().upper()
    if filters.get("patient_id"):
        params["PatientID"] = filters["patient_id"]
    if filters.get("date_from") and filters.get("date_to"):
        params["StudyDate"] = f"{filters['date_from']}-{filters['date_to']}"
    elif filters.get("date_from"):
        params["StudyDate"] = f"{filters['date_from']}-"
    elif filters.get("date_to"):
        params["StudyDate"] = f"-{filters['date_to']}"

    return params


async def _search_studies_page(
    dicomweb_url: str,
    auth: AuthHandler,
    filters: dict | None,
    limit: int,
    offset: int,
    timeout: float,
    modality_query_key: str,
) -> list[QidoStudy]:
    base_url = dicomweb_url.rstrip("/")
    url = f"{base_url}/studies"
    headers = {"Accept": "application/dicom+json"}
    headers.update(auth.get_headers())
    params = build_qido_params(
        filters,
        limit=limit,
        offset=offset,
        modality_query_key=modality_query_key,
    )

    client = get_dicomweb_client(url, timeout)
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

    return studies


async def search_studies(
    dicomweb_url: str,
    auth: AuthHandler,
    filters: dict | None = None,
    limit: int = 100,
    offset: int = 0,
    timeout: float = 60.0,
    modality_query_key: str | None = None,
) -> list[QidoStudy]:
    """Search studies via QIDO-RS with cross-PACS modality matching."""
    modality_filter = (filters or {}).get("modality")
    keys_to_try: tuple[str, ...]
    if modality_filter and modality_query_key:
        keys_to_try = (modality_query_key,)
    elif modality_filter:
        keys_to_try = STUDY_MODALITY_QUERY_KEYS
    else:
        keys_to_try = (STUDY_MODALITY_QUERY_KEYS[0],)

    last_error: QidoRsError | None = None
    for key in keys_to_try:
        try:
            studies = await _search_studies_page(
                dicomweb_url,
                auth,
                filters,
                limit,
                offset,
                timeout,
                key,
            )
        except QidoRsError as exc:
            last_error = exc
            if modality_filter and key != keys_to_try[-1]:
                logger.info("qido_modality_query_retry", failed_key=key, error=str(exc))
                continue
            raise

        if studies or not modality_filter or key == keys_to_try[-1]:
            logger.info(
                "qido_search_complete",
                count=len(studies),
                offset=offset,
                limit=limit,
                modality_query_key=key if modality_filter else None,
            )
            return studies

        logger.info("qido_modality_query_retry", failed_key=key, next_key=keys_to_try[-1])

    if last_error:
        raise last_error
    return []


async def resolve_modality_query_key(
    dicomweb_url: str,
    auth: AuthHandler,
    modality: str,
    timeout: float = 60.0,
) -> str:
    """Pick the modality QIDO parameter supported by the source PACS."""
    filters = {"modality": modality}
    for key in STUDY_MODALITY_QUERY_KEYS:
        try:
            page = await _search_studies_page(
                dicomweb_url,
                auth,
                filters,
                limit=1,
                offset=0,
                timeout=timeout,
                modality_query_key=key,
            )
            if page:
                return key
        except QidoRsError as exc:
            if key != STUDY_MODALITY_QUERY_KEYS[-1] and exc.status_code >= 400:
                logger.info("qido_modality_query_unsupported", key=key, status=exc.status_code)
                continue
            raise
    return STUDY_MODALITY_QUERY_KEYS[0]
