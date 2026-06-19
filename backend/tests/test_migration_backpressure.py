"""Tests for migration queue backpressure."""

from unittest.mock import patch

import pytest

from app.services import migration_backpressure


@pytest.fixture(autouse=True)
def reset_metrics(monkeypatch):
    monkeypatch.setattr("app.services.migration_backpressure.settings.metrics_enabled", False)


def test_wait_skipped_when_backpressure_disabled(monkeypatch):
    monkeypatch.setattr(
        "app.services.migration_backpressure.settings.migration_queue_backpressure_max",
        0,
    )
    with patch("app.services.migration_backpressure.get_queue_depths_sync") as mock_depth:
        migration_backpressure.wait_for_migration_queue_slot()
        mock_depth.assert_not_called()


def test_wait_returns_when_queue_below_limit(monkeypatch):
    monkeypatch.setattr(
        "app.services.migration_backpressure.settings.migration_queue_backpressure_max",
        50,
    )
    with patch(
        "app.services.migration_backpressure.get_queue_depths_sync",
        return_value={"migration_queue": 10},
    ):
        migration_backpressure.wait_for_migration_queue_slot()


def test_wait_blocks_until_queue_drains(monkeypatch):
    monkeypatch.setattr(
        "app.services.migration_backpressure.settings.migration_queue_backpressure_max",
        20,
    )
    monkeypatch.setattr("app.services.migration_backpressure.time.sleep", lambda _: None)
    depths = iter([25, 22, 18])

    with patch(
        "app.services.migration_backpressure.get_queue_depths_sync",
        side_effect=lambda: {"migration_queue": next(depths)},
    ):
        migration_backpressure.wait_for_migration_queue_slot()
