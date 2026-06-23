"""Study browser: QIDO search on source nodes with migrate/route actions."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.qido_rs import QidoRsError, QidoStudy, resolve_modality_query_key, search_studies
from app.models.migration import MigrationJob
from app.models.node import Node
from app.schemas.migration import MigrationFilters, MigrationJobConfig
from app.schemas.source_studies import (
    SourceStudyActionResponse,
    SourceStudyListResponse,
    SourceStudyMigrateRequest,
    SourceStudyResponse,
    SourceStudyRouteRequest,
)
from app.config import settings
from app.services.audit_logger import AuditLogger
from app.services.migration_job_counters import init_job_counters
from app.services.migration_preflight import (
    ensure_no_other_active_migration_job,
    verify_migration_node_connectivity,
)
from app.services.node_pair_validation import ensure_distinct_endpoints
from app.services.node_roles import node_is_destination, node_is_source
from app.workers.dispatch import (
    enqueue_fetch_and_enqueue_studies,
    enqueue_route_study_from_source,
)

router = APIRouter(prefix="/source-studies", tags=["source-studies"])


def _normalize_date(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip().replace("-", "")
    if len(cleaned) != 8 or not cleaned.isdigit():
        raise HTTPException(status_code=400, detail=f"Invalid date '{value}'; use YYYYMMDD")
    return cleaned


async def _get_source_node(db: AsyncSession, node_id: UUID) -> Node:
    node = await db.get(Node, node_id)
    if not node or not node.is_active:
        raise HTTPException(status_code=400, detail="Source node not found or inactive")
    if not node_is_source(node.node_type):
        raise HTTPException(status_code=400, detail="Node must be a source node")
    if not node.dicomweb_url:
        raise HTTPException(status_code=400, detail="Source node requires a DICOMweb URL")
    return node


def _study_response(study: QidoStudy) -> SourceStudyResponse:
    return SourceStudyResponse(
        study_uid=study.study_uid,
        patient_id=study.patient_id,
        patient_name=study.patient_name,
        patient_birth_date=study.patient_birth_date,
        modality=study.modality,
        study_date=study.study_date,
        study_time=study.study_time,
        acquisition_date=study.acquisition_date,
        study_description=study.study_description,
        accession_number=study.accession_number,
        referring_physician=study.referring_physician,
        station_name=study.station_name,
        body_part_examined=study.body_part_examined,
        protocol_name=study.protocol_name,
        acquisition_description=study.acquisition_description,
        requested_procedure=study.requested_procedure,
        patient_location=study.patient_location,
        num_series=study.num_series,
        num_instances=study.num_instances,
    )


@router.get("", response_model=SourceStudyListResponse)
async def list_source_studies(
    source_node_id: UUID = Query(...),
    modality: str | None = None,
    patient_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("operator", "admin")),
) -> SourceStudyListResponse:
    source = await _get_source_node(db, source_node_id)
    filters: dict[str, str] = {}
    if modality:
        filters["modality"] = modality.strip().upper()
    if patient_id:
        filters["patient_id"] = patient_id.strip()
    if date_from:
        filters["date_from"] = _normalize_date(date_from)
    if date_to:
        filters["date_to"] = _normalize_date(date_to)

    auth = AuthHandler.from_node(source)
    modality_key: str | None = None
    if filters.get("modality"):
        try:
            modality_key = await resolve_modality_query_key(source.dicomweb_url, auth, filters["modality"])
        except QidoRsError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        page = await search_studies(
            source.dicomweb_url,
            auth,
            filters=filters or None,
            limit=limit,
            offset=offset,
            modality_query_key=modality_key,
        )
    except QidoRsError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return SourceStudyListResponse(
        source_node_id=source.id,
        source_node_name=source.name,
        items=[_study_response(study) for study in page],
        limit=limit,
        offset=offset,
        has_more=len(page) >= limit,
    )


@router.post("/migrate", response_model=SourceStudyActionResponse, status_code=status.HTTP_201_CREATED)
async def migrate_source_studies(
    payload: SourceStudyMigrateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("operator", "admin")),
) -> SourceStudyActionResponse:
    source = await _get_source_node(db, payload.source_node_id)
    dest = await db.get(Node, payload.destination_node_id)
    if not dest or not dest.is_active:
        raise HTTPException(status_code=400, detail="Destination node not found or inactive")
    if not node_is_destination(dest.node_type):
        raise HTTPException(status_code=400, detail="Node must be a destination node")
    if not dest.dicomweb_url:
        raise HTTPException(status_code=400, detail="Destination node requires a DICOMweb URL")

    ensure_distinct_endpoints(source.id, dest.id, context="study browser migration")

    study_uids = [uid.strip() for uid in payload.study_uids if uid.strip()]
    if not study_uids:
        raise HTTPException(status_code=400, detail="At least one study UID is required")

    job_config = MigrationJobConfig(
        filters=MigrationFilters(study_uids=study_uids),
        tag_morphing_rule_ids=payload.tag_morphing_rule_ids,
    )
    job = MigrationJob(
        name=payload.name,
        source_node_id=source.id,
        destination_node_id=dest.id,
        job_type="batch",
        status="not_started",
        job_config=job_config.model_dump(mode="json"),
        created_by=user.username,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task_ids: list[str] = []
    if payload.start:
        await ensure_no_other_active_migration_job(db, job.id)
        await verify_migration_node_connectivity(source, dest)
        task_id = enqueue_fetch_and_enqueue_studies(str(job.id))
        job.celery_task_id = task_id
        job.status = "discovering" if settings.migration_streaming_discovery else "in_progress"
        init_job_counters(job.id, completed=job.completed_studies or 0, failed=job.failed_studies or 0)
        task_ids.append(task_id)

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role=",".join(user.roles),
        entity_type="MigrationJob",
        entity_id=job.id,
        details={
            "action": "create_from_study_browser",
            "study_count": len(study_uids),
            "started": payload.start,
        },
        ip_address=request.client.host if request.client else None,
    )

    return SourceStudyActionResponse(
        enqueued=len(study_uids) if payload.start else 0,
        study_uids=study_uids,
        job_id=job.id,
        task_ids=task_ids,
    )


@router.post("/route", response_model=SourceStudyActionResponse)
async def route_source_studies(
    payload: SourceStudyRouteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("operator", "admin")),
) -> SourceStudyActionResponse:
    source = await _get_source_node(db, payload.source_node_id)
    study_uids = [uid.strip() for uid in payload.study_uids if uid.strip()]
    if not study_uids:
        raise HTTPException(status_code=400, detail="At least one study UID is required")

    task_ids: list[str] = []
    for study_uid in study_uids:
        task_ids.append(enqueue_route_study_from_source(str(source.id), study_uid))

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role=",".join(user.roles),
        entity_type="Node",
        entity_id=source.id,
        details={
            "action": "route_from_study_browser",
            "study_count": len(study_uids),
            "study_uids": study_uids,
        },
        ip_address=request.client.host if request.client else None,
    )

    return SourceStudyActionResponse(
        enqueued=len(study_uids),
        study_uids=study_uids,
        task_ids=task_ids,
    )
