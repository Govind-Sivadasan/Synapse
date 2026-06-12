"""Runtime system configuration with DB persistence over env defaults."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.system_settings import SystemSettings

SETTINGS_ROW_ID = None  # first row wins


def default_settings() -> dict:
    return {
        "dimse_ae_title": settings.dimse_ae_title,
        "dimse_port": settings.dimse_port,
        "dimse_promiscuous_mode": settings.dimse_promiscuous_mode,
        "celery_max_retries": settings.celery_max_retries,
        "celery_routing_concurrency": settings.celery_routing_concurrency,
        "celery_migration_concurrency": settings.celery_migration_concurrency,
        "logging_level": "INFO",
    }


async def get_system_config(db: AsyncSession) -> dict:
    result = await db.execute(select(SystemSettings).limit(1))
    row = result.scalar_one_or_none()
    merged = default_settings()
    if row and row.settings:
        merged.update(row.settings)
    return merged


async def save_system_config(db: AsyncSession, new_settings: dict, updated_by: str) -> dict:
    result = await db.execute(select(SystemSettings).limit(1))
    row = result.scalar_one_or_none()
    if row is None:
        row = SystemSettings(settings=new_settings, updated_by=updated_by)
        db.add(row)
    else:
        current = default_settings()
        current.update(row.settings or {})
        current.update(new_settings)
        row.settings = {k: current[k] for k in default_settings() if k in current}
        row.updated_by = updated_by
    await db.flush()
    return await get_system_config(db)
