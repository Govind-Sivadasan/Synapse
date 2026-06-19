"""Tests for Phase 1 metric rollup counters."""

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock

import pytest

from app.services.metrics_rollup import (
    migration_study_metric_key,
    record_migration_study_completion,
    record_routing_completion,
    routing_status_metric_key,
)


def test_routing_status_metric_key():
    assert routing_status_metric_key("success") == "routing.success"


def test_migration_study_metric_key():
    assert migration_study_metric_key("failed") == "migration.study.failed"


@pytest.mark.asyncio
async def test_record_routing_completion_executes_counters():
    session = AsyncMock()
    when = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)
    await record_routing_completion(session, "success", when)
    assert session.execute.await_count == 4


@pytest.mark.asyncio
async def test_record_migration_study_completion_executes_counters():
    session = AsyncMock()
    when = datetime(2026, 6, 19, 8, 0, tzinfo=timezone.utc)
    await record_migration_study_completion(session, "success", when)
    assert session.execute.await_count == 2


@pytest.mark.asyncio
async def test_record_migration_study_completion_uses_today_when_missing():
    session = AsyncMock()
    await record_migration_study_completion(session, "failed", None)
    assert session.execute.await_count == 2
