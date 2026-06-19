"""Pre-flight checks before starting a migration job."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.migration import MigrationJob
from app.models.node import Node
from app.services.node_connectivity import probe_node_connectivity


async def ensure_no_other_active_migration_job(
    db: AsyncSession,
    job_id: uuid.UUID,
) -> None:
    if not settings.migration_single_active_job:
        return

    active_count = await db.scalar(
        select(func.count())
        .select_from(MigrationJob)
        .where(
            MigrationJob.id != job_id,
            MigrationJob.status.in_(("in_progress", "discovering", "paused")),
        )
    )
    if active_count:
        raise HTTPException(
            status_code=409,
            detail="Another migration job is already running. Cancel it or wait for completion.",
        )


async def verify_migration_node_connectivity(source: Node, destination: Node) -> dict:
    if not settings.migration_preflight_echo:
        return {"source": None, "destination": None}

    source_result = await probe_node_connectivity(source)
    if not source_result["success"]:
        raise HTTPException(
            status_code=422,
            detail=f"Source node unreachable: {source_result['message']}",
        )

    dest_result = await probe_node_connectivity(destination)
    if not dest_result["success"]:
        raise HTTPException(
            status_code=422,
            detail=f"Destination node unreachable: {dest_result['message']}",
        )

    return {"source": source_result, "destination": dest_result}
