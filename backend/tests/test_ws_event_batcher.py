"""Tests for WebSocket event batching (Phase 3.3)."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.websocket import event_batcher as batcher_module


@pytest.fixture
def batcher(monkeypatch):
    monkeypatch.setattr(batcher_module.settings, "ws_event_batch_interval_ms", 1000)
    monkeypatch.setattr(batcher_module.settings, "ws_event_batch_max_size", 3)
    sent: list[tuple[str, dict[str, Any]]] = []

    async def fake_broadcast(event_type: str, data: dict[str, Any]) -> None:
        sent.append((event_type, data))

    monkeypatch.setattr(batcher_module.ws_manager, "broadcast", fake_broadcast)
    batcher = batcher_module.EventBatcher(flush_interval_ms=1000, max_batch_size=3)
    return batcher, sent


@pytest.mark.asyncio
async def test_flush_on_max_batch_size(batcher):
    instance, sent = batcher
    await instance.enqueue("study_received", {"study_uid": "1.2.3"})
    await instance.enqueue("study_received", {"study_uid": "1.2.4"})
    assert sent == []
    await instance.enqueue("routing_completed", {"study_uid": "1.2.3"})
    assert len(sent) == 1
    assert sent[0][0] == "event_batch"
    assert len(sent[0][1]["events"]) == 3


@pytest.mark.asyncio
async def test_manual_flush_drains_buffer(batcher):
    instance, sent = batcher
    await instance.enqueue("migration_study_completed", {"job_id": "abc"})
    await instance.flush()
    assert sent[0][1]["events"][0]["event_type"] == "migration_study_completed"


@pytest.mark.asyncio
async def test_flush_loop_periodic(batcher):
    instance, sent = batcher
    monkeypatch_interval = 0.05
    instance._flush_interval_ms = int(monkeypatch_interval * 1000)
    await instance.start()
    await instance.enqueue("study_received", {"study_uid": "1.2.5"})
    await asyncio.sleep(0.12)
    await instance.stop()
    assert sent
    assert sent[-1][0] == "event_batch"
