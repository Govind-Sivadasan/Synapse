"""Migration job naming helpers for batch creates and uniqueness."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.migration import MigrationJob

_MAX_NAME_LEN = 200


def batch_migration_job_names(base_name: str, destination_count: int) -> list[str]:
    """Build per-destination job names (#1, #2, …) when count > 1."""
    base = (base_name or "Migration job").strip() or "Migration job"
    if destination_count <= 0:
        return []
    if destination_count == 1:
        return [base[:_MAX_NAME_LEN]]
    names: list[str] = []
    for index in range(1, destination_count + 1):
        suffix = f" #{index}"
        names.append(f"{base[: _MAX_NAME_LEN - len(suffix)]}{suffix}")
    return names


async def reserve_unique_migration_job_name(db: AsyncSession, desired: str) -> str:
    """Return a job name that is not already used (append (2), (3), … if needed)."""
    candidate = desired.strip()[:_MAX_NAME_LEN] or "Migration job"
    if not await _name_taken(db, candidate):
        return candidate

    stem = candidate
    for duplicate_index in range(2, 1000):
        suffix = f" ({duplicate_index})"
        candidate = f"{stem[: _MAX_NAME_LEN - len(suffix)]}{suffix}"
        if not await _name_taken(db, candidate):
            return candidate

    raise ValueError("Could not allocate a unique migration job name")


async def _name_taken(db: AsyncSession, name: str) -> bool:
    existing = await db.scalar(select(MigrationJob.id).where(MigrationJob.name == name).limit(1))
    return existing is not None
