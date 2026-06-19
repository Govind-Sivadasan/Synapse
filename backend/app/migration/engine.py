"""Bulk migration engine: QIDO-RS discovery → WADO-RS retrieve → morph → STOW-RS."""

import shutil
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

import pydicom
import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.client import DICOMwebClient, StowRsUploadError
from app.dicomweb.dicom_json import parse_study_date
from app.dicomweb.qido_rs import QidoRsError, QidoStudy, resolve_modality_query_key, search_studies
from app.dicomweb.wado_rs import WadoRsError, retrieve_study_instances
from app.models.migration import MigrationJob, MigrationStudyRecord
from app.models.node import Node
from app.models.tag_morphing import TagMorphingRule
from app.morphing.tag_morpher import TagMorpher
from app.observability.metrics import inc_counter, timed_phase
from app.services.audit_logger import AuditLogger
from app.services.event_publisher import publish_event
from app.services.metrics_rollup import record_migration_study_completion

logger = structlog.get_logger()


class MigrationEngine:
    def __init__(self) -> None:
        self.dicomweb_client = DICOMwebClient()
        self.tag_morpher = TagMorpher()

    async def discover_studies_for_job(self, job_id: uuid.UUID) -> list[QidoStudy]:
        async with async_session_factory() as session:
            job = await self._get_job(session, job_id)
            if job.status == "cancelled":
                return []

            source = await self._get_source_node(session, job.source_node_id)
            config = job.job_config or {}
            filters = config.get("filters") or {}
            limit = int(config.get("qido_limit", 100))

            if job.job_type == "batch" and filters.get("study_uids"):
                return [
                    QidoStudy(study_uid=uid)
                    for uid in filters["study_uids"]
                    if isinstance(uid, str) and uid.strip()
                ]

            auth = AuthHandler.from_node(source)
            return await self._paginate_qido_search(source.dicomweb_url, auth, filters, limit)

    async def _paginate_qido_search(
        self,
        dicomweb_url: str,
        auth: AuthHandler,
        filters: dict,
        limit: int,
    ) -> list[QidoStudy]:
        modality_key: str | None = None
        if filters.get("modality"):
            modality_key = await resolve_modality_query_key(
                dicomweb_url,
                auth,
                str(filters["modality"]),
            )

        all_studies: list[QidoStudy] = []
        offset = 0
        while True:
            page = await search_studies(
                dicomweb_url,
                auth,
                filters=filters,
                limit=limit,
                offset=offset,
                modality_query_key=modality_key,
            )
            if not page:
                break
            all_studies.extend(page)
            if len(page) < limit:
                break
            offset += limit
        return all_studies

    async def enqueue_study_records(self, job_id: uuid.UUID, studies: list[QidoStudy]) -> int:
        async with async_session_factory() as session:
            job = await self._get_job(session, job_id)
            if job.status == "cancelled":
                return 0

            created = 0
            for study in studies:
                existing = await session.scalar(
                    select(MigrationStudyRecord).where(
                        MigrationStudyRecord.job_id == job_id,
                        MigrationStudyRecord.study_uid == study.study_uid,
                    )
                )
                if existing:
                    continue

                record = MigrationStudyRecord(
                    id=uuid.uuid4(),
                    job_id=job_id,
                    study_uid=study.study_uid,
                    patient_id=study.patient_id,
                    modality=study.modality,
                    study_date=parse_study_date(study.study_date),
                    status="pending",
                )
                session.add(record)
                created += 1

            job.total_studies = await session.scalar(
                select(func.count())
                .select_from(MigrationStudyRecord)
                .where(MigrationStudyRecord.job_id == job_id)
            )
            job.status = "in_progress"
            job.start_time = job.start_time or datetime.now(timezone.utc)
            await session.commit()
            return created

    async def migrate_study(self, job_id: uuid.UUID, study_uid: str) -> dict:
        morph_dir: Path | None = None
        download_dir: Path | None = None

        async with async_session_factory() as session:
            job = await self._get_job(session, job_id)
            if job.status in ("cancelled", "not_started"):
                return {"status": "skipped", "reason": f"job_{job.status}"}

            record = await session.scalar(
                select(MigrationStudyRecord).where(
                    MigrationStudyRecord.job_id == job_id,
                    MigrationStudyRecord.study_uid == study_uid,
                )
            )
            if not record:
                return {"status": "skipped", "reason": "record_not_found"}
            if record.status == "success":
                return {"status": "skipped", "reason": "already_success"}

            record.status = "in_progress"
            await session.commit()

        try:
            async with async_session_factory() as session:
                job = await self._get_job(session, job_id)
                if job.status == "cancelled":
                    await self._mark_study(session, job_id, study_uid, "skipped", "Job cancelled")
                    return {"status": "skipped", "reason": "job_cancelled"}

                source = await self._get_source_node(session, job.source_node_id)
                destination = await self._get_destination_node(session, job.destination_node_id)
                record = await session.scalar(
                    select(MigrationStudyRecord).where(
                        MigrationStudyRecord.job_id == job_id,
                        MigrationStudyRecord.study_uid == study_uid,
                    )
                )

            download_dir = Path(settings.temp_storage_path) / "migration" / str(job_id) / study_uid
            source_auth = AuthHandler.from_node(source)
            with timed_phase("migration", "wado", study_uid=study_uid):
                file_paths = await retrieve_study_instances(
                    source.dicomweb_url,
                    study_uid,
                    source_auth,
                    download_dir,
                )

            metadata = self._extract_metadata(file_paths[0], record)
            upload_paths = file_paths
            morph_rule_ids = (job.job_config or {}).get("tag_morphing_rule_ids") or []

            if morph_rule_ids:
                async with async_session_factory() as session:
                    rules = list(
                        (
                            await session.execute(
                                select(TagMorphingRule).where(
                                    TagMorphingRule.id.in_(morph_rule_ids),
                                    TagMorphingRule.is_active.is_(True),
                                )
                            )
                        ).scalars()
                    )
                if rules:
                    morph_dir = download_dir / f"morphed_{uuid.uuid4().hex[:8]}"
                    with timed_phase("migration", "morph", study_uid=study_uid):
                        upload_paths, audit = self.tag_morpher.apply_to_files(
                            file_paths, rules, metadata, output_dir=morph_dir
                        )
                    async with async_session_factory() as session:
                        await AuditLogger.log(
                            session,
                            "TAG_MORPHING_APPLIED",
                            entity_type="MigrationStudyRecord",
                            entity_id=record.id,
                            details={
                                "study_uid": study_uid,
                                "job_id": str(job_id),
                                "rules": audit.rules_applied,
                                "changes": [
                                    {"tag": c.tag, "from": c.original_value, "to": c.new_value}
                                    for c in audit.changes
                                ],
                            },
                        )
                        await session.commit()

            dest_auth = AuthHandler.from_node(destination)
            with timed_phase("migration", "stow", study_uid=study_uid):
                await self.dicomweb_client.stow_rs(upload_paths, destination.dicomweb_url, dest_auth)

            async with async_session_factory() as session:
                with timed_phase("migration", "db_finalize", study_uid=study_uid):
                    await self._mark_study(session, job_id, study_uid, "success")
                    await self._refresh_job_counters(session, job_id)
                    await AuditLogger.log(
                        session,
                        "JOB_STATUS_CHANGE",
                        entity_type="MigrationStudyRecord",
                        entity_id=record.id,
                        details={"study_uid": study_uid, "status": "success", "instances": len(upload_paths)},
                    )
                    await session.commit()

            inc_counter("synapse_migration_studies_total", {"status": "success"})

            publish_event(
                "migration_study_completed",
                {"job_id": str(job_id), "study_uid": study_uid, "status": "success"},
            )
            return {"status": "success", "instances": len(upload_paths)}

        except (QidoRsError, WadoRsError, StowRsUploadError) as exc:
            error = str(exc)
            inc_counter("synapse_migration_studies_total", {"status": "failed"})
            logger.error("migrate_study_failed", job_id=str(job_id), study_uid=study_uid, error=error)
            async with async_session_factory() as session:
                record = await self._mark_study(session, job_id, study_uid, "failed", error)
                if record:
                    record.retry_count += 1
                await self._refresh_job_counters(session, job_id)
                await session.commit()
            publish_event(
                "migration_study_completed",
                {"job_id": str(job_id), "study_uid": study_uid, "status": "failed", "error": error},
            )
            raise
        except Exception as exc:
            error = str(exc)
            logger.error("migrate_study_error", job_id=str(job_id), study_uid=study_uid, error=error)
            async with async_session_factory() as session:
                await self._mark_study(session, job_id, study_uid, "failed", error)
                await self._refresh_job_counters(session, job_id)
                await session.commit()
            raise
        finally:
            if morph_dir and morph_dir.exists():
                TagMorpher.cleanup_dir(morph_dir)
            if download_dir and download_dir.exists():
                shutil.rmtree(download_dir, ignore_errors=True)

    async def _mark_study(
        self,
        session: AsyncSession,
        job_id: uuid.UUID,
        study_uid: str,
        status: str,
        failure_reason: str | None = None,
    ) -> MigrationStudyRecord | None:
        record = await session.scalar(
            select(MigrationStudyRecord).where(
                MigrationStudyRecord.job_id == job_id,
                MigrationStudyRecord.study_uid == study_uid,
            )
        )
        if not record:
            return None
        record.status = status
        record.failure_reason = failure_reason
        if status in ("success", "failed", "skipped"):
            record.completed_at = datetime.now(timezone.utc)
        if status in ("success", "failed"):
            await record_migration_study_completion(session, status, record.completed_at)
        return record

    async def _refresh_job_counters(self, session: AsyncSession, job_id: uuid.UUID) -> None:
        job = await self._get_job(session, job_id)
        total = await session.scalar(
            select(func.count())
            .select_from(MigrationStudyRecord)
            .where(MigrationStudyRecord.job_id == job_id)
        )
        completed = await session.scalar(
            select(func.count())
            .select_from(MigrationStudyRecord)
            .where(
                MigrationStudyRecord.job_id == job_id,
                MigrationStudyRecord.status == "success",
            )
        )
        failed = await session.scalar(
            select(func.count())
            .select_from(MigrationStudyRecord)
            .where(
                MigrationStudyRecord.job_id == job_id,
                MigrationStudyRecord.status == "failed",
            )
        )
        pending = await session.scalar(
            select(func.count())
            .select_from(MigrationStudyRecord)
            .where(
                MigrationStudyRecord.job_id == job_id,
                MigrationStudyRecord.status.in_(("pending", "in_progress")),
            )
        )

        job.total_studies = total or 0
        job.completed_studies = completed or 0
        job.failed_studies = failed or 0

        if pending == 0 and (completed or failed):
            if failed and completed:
                job.status = "partial"
            elif failed and not completed:
                job.status = "failed"
            else:
                job.status = "completed"
            job.end_time = datetime.now(timezone.utc)
            publish_event(
                "migration_job_completed",
                {
                    "job_id": str(job_id),
                    "status": job.status,
                    "completed_studies": job.completed_studies,
                    "failed_studies": job.failed_studies,
                },
            )

    async def _get_job(self, session: AsyncSession, job_id: uuid.UUID) -> MigrationJob:
        job = await session.get(MigrationJob, job_id)
        if not job:
            raise ValueError(f"Migration job not found: {job_id}")
        return job

    async def _get_source_node(self, session: AsyncSession, node_id: uuid.UUID) -> Node:
        node = await session.get(Node, node_id)
        if not node or not node.is_active:
            raise ValueError("Source node not found or inactive")
        if not node.dicomweb_url:
            raise ValueError("Source node has no DICOMweb URL configured")
        return node

    async def _get_destination_node(self, session: AsyncSession, node_id: uuid.UUID) -> Node:
        node = await session.get(Node, node_id)
        if not node or not node.is_active:
            raise ValueError("Destination node not found or inactive")
        if not node.dicomweb_url:
            raise ValueError("Destination node has no DICOMweb URL configured")
        return node

    def _extract_metadata(self, sample_file: Path, record: MigrationStudyRecord | None) -> dict[str, str]:
        try:
            ds = pydicom.dcmread(sample_file, stop_before_pixels=True)
            return {
                "Modality": str(getattr(ds, "Modality", record.modality if record else "") or ""),
                "PatientID": str(getattr(ds, "PatientID", record.patient_id if record else "") or ""),
                "StudyInstanceUID": str(getattr(ds, "StudyInstanceUID", record.study_uid if record else "") or ""),
                "AccessionNumber": str(getattr(ds, "AccessionNumber", "") or ""),
            }
        except Exception:
            return {
                "Modality": record.modality or "" if record else "",
                "PatientID": record.patient_id or "" if record else "",
                "StudyInstanceUID": record.study_uid if record else "",
                "AccessionNumber": "",
            }
