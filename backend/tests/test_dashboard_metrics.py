"""Unit tests for dashboard metric helpers."""

from datetime import date, datetime, timezone

from app.services.dashboard_metrics import _fill_daily_series


def test_fill_daily_series_zero_pads_gaps():
    end = datetime(2024, 6, 10, 12, 0, tzinfo=timezone.utc)
    rows = [(date(2024, 6, 8), 3), (date(2024, 6, 10), 5)]
    series = _fill_daily_series(rows, days=3, end=end)
    assert len(series) == 3
    assert series[0].label == "2024-06-08"
    assert series[0].value == 3
    assert series[1].value == 0
    assert series[2].value == 5
