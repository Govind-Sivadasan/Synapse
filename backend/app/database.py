"""Async SQLAlchemy database session management."""

import asyncio
from collections.abc import AsyncGenerator, Coroutine
from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

T = TypeVar("T")


def run_async_task(coro: Coroutine[object, object, T]) -> T:
    """Run async code from a Celery task.

    Each asyncio.run() creates a new event loop; dispose the connection pool afterward
    so asyncpg connections are not reused across loops (RuntimeError).
    """

    async def _runner() -> T:
        try:
            return await coro
        finally:
            await engine.dispose()

    return asyncio.run(_runner())


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
