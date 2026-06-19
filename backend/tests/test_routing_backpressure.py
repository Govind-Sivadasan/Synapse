"""Tests for routing queue backpressure (Phase 2.3)."""

from unittest.mock import patch

import pytest

from app.services import routing_backpressure


@pytest.fixture(autouse=True)
def disable_metrics(monkeypatch):
    monkeypatch.setattr("app.services.routing_backpressure.settings.metrics_enabled", False)


def test_is_overloaded_when_at_limit(monkeypatch):
    monkeypatch.setattr(
        "app.services.routing_backpressure.settings.routing_queue_backpressure_max",
        100,
    )
    with patch(
        "app.services.routing_backpressure.get_queue_depths_sync",
        return_value={"routing_queue": 100},
    ):
        assert routing_backpressure.is_routing_queue_overloaded() is True


def test_is_not_overloaded_when_disabled(monkeypatch):
    monkeypatch.setattr(
        "app.services.routing_backpressure.settings.routing_queue_backpressure_max",
        0,
    )
    with patch(
        "app.services.routing_backpressure.get_queue_depths_sync",
        return_value={"routing_queue": 999},
    ):
        assert routing_backpressure.is_routing_queue_overloaded() is False


def test_wait_skipped_when_disabled(monkeypatch):
    monkeypatch.setattr(
        "app.services.routing_backpressure.settings.routing_queue_backpressure_max",
        0,
    )
    with patch("app.services.routing_backpressure.get_queue_depths_sync") as mock_depth:
        routing_backpressure.wait_for_routing_queue_slot()
    mock_depth.assert_not_called()


def test_wait_until_slot_available(monkeypatch):
    monkeypatch.setattr(
        "app.services.routing_backpressure.settings.routing_queue_backpressure_max",
        50,
    )
    monkeypatch.setattr("app.services.routing_backpressure.time.sleep", lambda _: None)
    depths = iter([60, 40])

    with patch(
        "app.services.routing_backpressure.get_queue_depths_sync",
        side_effect=lambda: {"routing_queue": next(depths)},
    ):
        routing_backpressure.wait_for_routing_queue_slot()
