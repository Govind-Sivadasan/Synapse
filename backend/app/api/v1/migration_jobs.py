"""Migration job management API."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.models.migration import MigrationJob, MigrationStudyRecord
from app.models.node import Node
from app.schemas.migration import (
    MigrationJobCreate,
    MigrationJobListResponse,
    MigrationJobResponse,
    MigrationStudyListResponse,
    MigrationStudyRecordResponse,
)
from app.services.audit_logger import AuditLogger
from app.workers.dispatch import enqueue_fetch_and_enqueue_studies, enqueue_migrate_study

router = APIRouter(prefix="/migration-jobs", tags=["Migration Jobs"])

DELETABLE_JOB_STATUSES = frozenset({"not_started", "completed", "failed", "partial", "cancelled"})


def _job_response(job: MigrationJob, nodes: dict[UUID, Node]) -> MigrationJobResponse:
    source = nodes.get(job.source_node_id)
    dest = nodes.get(job.destination_node_id)
    return MigrationJobResponse(
        id=job.id,
        name=job.name,
        source_node_id=job.source_node_id,
        destination_node_id=job.destination_node_id,
        source_node_name=source.name if source else None,
        destination_node_name=dest.name if dest else None,
        job_type=job.job_type,
        status=job.status,
        total_studies=job.total_studies,
        completed_studies=job.completed_studies,
        failed_studies=job.failed_studies,
        retry_count=job.retry_count,
        job_config=job.job_config,
        celery_task_id=job.celery_task_id,
        created_by=job.created_by,
        start_time=job.start_time,
        end_time=job.end_time,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


async def _load_nodes(db: AsyncSession, jobs: list[MigrationJob]) -> dict[UUID, Node]:
    node_ids = {j.source_node_id for j in jobs} | {j.destination_node_id for j in jobs}
    if not node_ids:
        return {}
    result = await db.execute(select(Node).where(Node.id.in_(node_ids)))
    return {n.id: n for n in result.scalars()}


@router.get("", response_model=MigrationJobListResponse)
async def list_migration_jobs(
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("operator", "admin")),
) -> MigrationJobListResponse:
    count_query = select(func.count()).select_from(MigrationJob)
    list_query = select(MigrationJob)
    if search:
        pattern = f"%{search.strip()}%"
        name_filter = or_(
            MigrationJob.name.ilike(pattern),
            MigrationJob.job_type.ilike(pattern),
            MigrationJob.status.ilike(pattern),
            MigrationJob.created_by.ilike(pattern),
        )
        count_query = count_query.where(name_filter)
        list_query = list_query.where(name_filter)

    total = await db.scalar(count_query) or 0
    result = await db.execute(
        list_query.order_by(MigrationJob.created_at.desc()).limit(limit).offset(offset)
    )
    jobs = list(result.scalars().all())
    nodes = await _load_nodes(db, jobs)
    return MigrationJobListResponse(
        total=total or 0,
        items=[_job_response(j, nodes) for j in jobs],
    )


@router.post("", response_model=MigrationJobResponse, status_code=status.HTTP_201_CREATED)
async def create_migration_job(
    payload: MigrationJobCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("operator", "admin")),
) -> MigrationJobResponse:
    source = await db.get(Node, payload.source_node_id)
    dest = await db.get(Node, payload.destination_node_id)
    if not source or not source.is_active:
        raise HTTPException(status_code=400, detail="Source node not found or inactive")
    if not dest or not dest.is_active:
        raise HTTPException(status_code=400, detail="Destination node not found or inactive")
    if not source.dicomweb_url:
        raise HTTPException(status_code=400, detail="Source node requires a DICOMweb URL for migration")
    if not dest.dicomweb_url:
        raise HTTPException(status_code=400, detail="Destination node requires a DICOMweb URL")

    job = MigrationJob(
        name=payload.name,
        source_node_id=payload.source_node_id,
        destination_node_id=payload.destination_node_id,
        job_type=payload.job_type,
        status="not_started",
        job_config=payload.job_config.model_dump(mode="json") if payload.job_config else {},
        created_by=user.username,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role=",".join(user.roles),
        entity_type="MigrationJob",
        entity_id=job.id,
        details={"action": "create", "name": job.name, "job_type": job.job_type},
        ip_address=request.client.host if request.client else None,
    )
    nodes = await _load_nodes(db, [job])
    return _job_response(job, nodes)


@router.get("/{job_id}", response_model=MigrationJobResponse)
async def get_migration_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("operator", "admin")),
) -> MigrationJobResponse:
    job = await db.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")
    nodes = await _load_nodes(db, [job])
    return _job_response(job, nodes)


@router.get("/{job_id}/studies", response_model=MigrationStudyListResponse)
async def list_job_studies(
    job_id: UUID,
    limit: int = 100,
    offset: int = 0,
    status_filter: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("operator", "admin")),
) -> MigrationStudyListResponse:
    job = await db.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")

    count_q = select(func.count()).select_from(MigrationStudyRecord).where(
        MigrationStudyRecord.job_id == job_id
    )
    list_q = select(MigrationStudyRecord).where(MigrationStudyRecord.job_id == job_id)
    if status_filter:
        count_q = count_q.where(MigrationStudyRecord.status == status_filter)
        list_q = list_q.where(MigrationStudyRecord.status == status_filter)
    if search:
        pattern = f"%{search.strip()}%"
        study_filter = or_(
            MigrationStudyRecord.study_uid.ilike(pattern),
            MigrationStudyRecord.patient_id.ilike(pattern),
            MigrationStudyRecord.modality.ilike(pattern),
            MigrationStudyRecord.failure_reason.ilike(pattern),
        )
        count_q = count_q.where(study_filter)
        list_q = list_q.where(study_filter)

    total = await db.scalar(count_q)
    result = await db.execute(
        list_q.order_by(MigrationStudyRecord.created_at.desc()).limit(limit).offset(offset)
    )
    items = list(result.scalars().all())
    return MigrationStudyListResponse(
        total=total or 0,
        items=[MigrationStudyRecordResponse.model_validate(s) for s in items],
    )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_migration_job(
    job_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("operator", "admin")),
) -> None:
    job = await db.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")
    if job.status == "in_progress":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a job while it is in progress. Cancel it first.",
        )
    if job.status not in DELETABLE_JOB_STATUSES:
        raise HTTPException(status_code=400, detail=f"Cannot delete job in status '{job.status}'")

    study_count = await db.scalar(
        select(func.count())
        .select_from(MigrationStudyRecord)
        .where(MigrationStudyRecord.job_id == job_id)
    )
    await db.execute(delete(MigrationStudyRecord).where(MigrationStudyRecord.job_id == job_id))
    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role=",".join(user.roles),
        entity_type="MigrationJob",
        entity_id=job.id,
        details={
            "action": "delete",
            "name": job.name,
            "status": job.status,
            "study_records_removed": study_count or 0,
        },
        ip_address=request.client.host if request.client else None,
    )
    await db.delete(job)


@router.post("/{job_id}/start", response_model=MigrationJobResponse)
async def start_migration_job(
    job_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("operator", "admin")),
) -> MigrationJobResponse:
    job = await db.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")
    restartable = job.status in ("not_started", "failed", "partial") or (
        job.status == "completed" and (job.total_studies or 0) == 0
    )
    if not restartable:
        raise HTTPException(status_code=400, detail=f"Cannot start job in status '{job.status}'")

    task_id = enqueue_fetch_and_enqueue_studies(str(job_id))
    job.celery_task_id = task_id
    job.status = "in_progress"
    job.end_time = None
    await db.flush()
    await AuditLogger.log(
        db,
        "JOB_STATUS_CHANGE",
        user_id=user.sub,
        user_role=",".join(user.roles),
        entity_type="MigrationJob",
        entity_id=job.id,
        details={"action": "start", "celery_task_id": task_id},
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(job)
    nodes = await _load_nodes(db, [job])
    return _job_response(job, nodes)


@router.post("/{job_id}/cancel", response_model=MigrationJobResponse)
async def cancel_migration_job(
    job_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("operator", "admin")),
) -> MigrationJobResponse:
    job = await db.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")
    if job.status in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel job in status '{job.status}'")

    job.status = "cancelled"
    await AuditLogger.log(
        db,
        "JOB_STATUS_CHANGE",
        user_id=user.sub,
        user_role=",".join(user.roles),
        entity_type="MigrationJob",
        entity_id=job.id,
        details={"action": "cancel"},
        ip_address=request.client.host if request.client else None,
    )
    nodes = await _load_nodes(db, [job])
    return _job_response(job, nodes)


@router.post("/{job_id}/studies/{study_record_id}/retry")
async def retry_migration_study(
    job_id: UUID,
    study_record_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("operator", "admin")),
) -> dict:
    job = await db.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")

    record = await db.get(MigrationStudyRecord, study_record_id)
    if not record or record.job_id != job_id:
        raise HTTPException(status_code=404, detail="Study record not found")
    if record.status not in ("failed", "skipped"):
        raise HTTPException(status_code=400, detail="Only failed or skipped studies can be retried")

    record.status = "pending"
    record.failure_reason = None
    record.completed_at = None
    job.retry_count += 1
    if job.status in ("failed", "partial", "completed"):
        job.status = "in_progress"
        job.end_time = None

    task_id = enqueue_migrate_study(str(job_id), record.study_uid)
    await AuditLogger.log(
        db,
        "RETRY_ATTEMPT",
        user_id=user.sub,
        user_role=",".join(user.roles),
        entity_type="MigrationStudyRecord",
        entity_id=record.id,
        details={"study_uid": record.study_uid, "celery_task_id": task_id},
    )
    return {"status": "enqueued", "study_uid": record.study_uid, "task_id": task_id}
