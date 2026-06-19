"""Tests for Phase 1.5 routing transactions summary."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.metrics_rollup import get_routing_summary


@pytest.mark.asyncio
async def test_routing_summary_all_time():
    session = AsyncMock()
    totals = {
        "total": 100,
        "success": 80,
        "failed": 10,
        "partial": 5,
        "no_match": 5,
    }
    with patch("app.services.metrics_rollup.get_routing_totals", new=AsyncMock(return_value=totals)):
        result = await get_routing_summary(session, days=0)

    assert result["period_days"] == 0
    assert result["total"] == 100
    assert result["success"] == 80
    assert result["success_rate"] == 80.0


@pytest.mark.asyncio
async def test_routing_summary_period_from_daily_rollups():
    session = AsyncMock()
    daily_rows = [
        ("routing.total", 12),
        ("routing.success", 10),
        ("routing.failed", 2),
    ]
    session.execute = AsyncMock(
        return_value=MagicMock(all=MagicMock(return_value=daily_rows))
    )

    result = await get_routing_summary(session, days=7)

    assert result["period_days"] == 7
    assert result["total"] == 12
    assert result["success"] == 10
    assert result["failed"] == 2
    assert result["partial"] == 0
