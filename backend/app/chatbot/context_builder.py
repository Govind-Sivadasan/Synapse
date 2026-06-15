"""Build operational context from Synapse data for LLM prompts."""

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dimse.stats import get_dimse_runtime
from app.models.audit_log import AuditLog
from app.models.migration import MigrationJob, MigrationStudyRecord
from app.models.routing import RoutingTransaction
from app.services.dashboard_metrics import get_dashboard_metrics
from app.services.dimse_event_store import get_dimse_statistics

STUDY_UID_RE = re.compile(r"1\.\d[\d.]{4,}")


async def build_chat_context(db: AsyncSession, query: str) -> dict:
    q = query.lower()
    ctx: dict = {"generated_at": datetime.now(timezone.utc).isoformat()}

    metrics = await get_dashboard_metrics(db)
    ctx["system_summary"] = {
        "routing_total": metrics.routing.total,
        "routing_success_rate_pct": metrics.routing.success_rate,
        "routing_failed": metrics.routing.failed,
        "routing_partial": metrics.routing.partial,
        "migration_active_jobs": metrics.migration.active_jobs,
        "migration_studies_migrated": metrics.migration.studies_migrated,
        "migration_studies_failed": metrics.migration.studies_failed,
        "dimse_listening": metrics.dimse.listening,
        "dimse_studies_assembled": metrics.dimse.studies_assembled,
    }

    if any(k in q for k in ("migration", "migrate", "job")):
        ctx["migration"] = await _migration_context(db)

    if any(k in q for k in ("routing", "rout", "stow", "dimse", "failed", "success")):
        ctx["routing"] = await _routing_context(db, include_failures="fail" in q)

    if any(k in q for k in ("today", "recent", "latest")):
        ctx["recent_activity"] = await _recent_activity(db)

    if any(k in q for k in ("audit", "log", "event")):
        ctx["audit"] = await _audit_context(db)

    uid_match = STUDY_UID_RE.search(query)
    if uid_match:
        ctx["study_lookup"] = await _study_lookup(db, uid_match.group())

    if "health" in q or "status" in q:
        runtime = get_dimse_runtime()
        dimse_stats = await get_dimse_statistics(db)
        ctx["dimse_listener"] = {
            "listening": runtime.listening,
            "ae_title": runtime.ae_title,
            "port": runtime.port,
            "studies_assembled": dimse_stats["studies_assembled"],
            "instances_received": dimse_stats["instances_received"],
        }

    return ctx


async def _migration_context(db: AsyncSession) -> dict:
    jobs = (
        await db.execute(
            select(MigrationJob).order_by(MigrationJob.created_at.desc()).limit(5)
        )
    ).scalars().all()

    return {
        "recent_jobs": [
            {
                "name": j.name,
                "status": j.status,
                "completed_studies": j.completed_studies,
                "failed_studies": j.failed_studies,
                "total_studies": j.total_studies,
            }
            for j in jobs
        ],
        "active_jobs": sum(1 for j in jobs if j.status == "in_progress"),
    }


async def _routing_context(db: AsyncSession, include_failures: bool = False) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    today_count = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(RoutingTransaction.received_at >= cutoff)
    ) or 0

    recent = (
        await db.execute(
            select(RoutingTransaction)
            .order_by(RoutingTransaction.received_at.desc())
            .limit(8 if include_failures else 5)
        )
    ).scalars().all()

    if include_failures:
        recent = [t for t in recent if t.overall_status in ("failed", "partial")] or list(recent)

    return {
        "studies_last_24h": today_count,
        "recent_transactions": [
            {
                "study_uid": t.study_uid,
                "modality": t.modality,
                "patient_id": t.patient_id,
                "status": t.overall_status,
                "instances": t.instances_count,
                "received_at": t.received_at.isoformat() if t.received_at else None,
            }
            for t in recent
        ],
    }


async def _recent_activity(db: AsyncSession) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    routed = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(RoutingTransaction.received_at >= cutoff)
    ) or 0
    migrated = await db.scalar(
        select(func.count())
        .select_from(MigrationStudyRecord)
        .where(
            MigrationStudyRecord.completed_at >= cutoff,
            MigrationStudyRecord.status == "success",
        )
    ) or 0
    failed = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(
            RoutingTransaction.received_at >= cutoff,
            RoutingTransaction.overall_status == "failed",
        )
    ) or 0
    return {"last_24h_routed": routed, "last_24h_migrated": migrated, "last_24h_routing_failed": failed}


async def _audit_context(db: AsyncSession) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (
        await db.execute(
            select(AuditLog.event_type, func.count())
            .where(AuditLog.created_at >= cutoff)
            .group_by(AuditLog.event_type)
            .order_by(func.count().desc())
            .limit(8)
        )
    ).all()
    return {"events_last_7_days": {row[0]: row[1] for row in rows}}


async def _study_lookup(db: AsyncSession, study_uid: str) -> dict:
    txn = await db.scalar(
        select(RoutingTransaction)
        .where(RoutingTransaction.study_uid == study_uid)
        .order_by(RoutingTransaction.received_at.desc())
        .limit(1)
    )
    migration = await db.scalar(
        select(MigrationStudyRecord)
        .where(MigrationStudyRecord.study_uid == study_uid)
        .order_by(MigrationStudyRecord.created_at.desc())
        .limit(1)
    )

    result: dict = {"study_uid": study_uid, "found": False}
    if txn:
        result["found"] = True
        result["routing"] = {
            "status": txn.overall_status,
            "modality": txn.modality,
            "patient_id": txn.patient_id,
            "accession_number": txn.accession_number,
            "instances": txn.instances_count,
            "received_at": txn.received_at.isoformat() if txn.received_at else None,
        }
    if migration:
        result["found"] = True
        result["migration"] = {
            "status": migration.status,
            "patient_id": migration.patient_id,
            "modality": migration.modality,
            "failure_reason": migration.failure_reason,
        }
    return result
