"""Throttled WebSocket event batching (Phase 3.3)."""

from __future__ import annotations

import asyncio
from typing import Any

import structlog

from app.config import settings
from app.websocket.manager import ws_manager

logger = structlog.get_logger()


class EventBatcher:
    """Coalesce Redis pub/sub events into periodic WS batches."""

    def __init__(
        self,
        *,
        flush_interval_ms: int | None = None,
        max_batch_size: int | None = None,
    ) -> None:
        self._flush_interval_ms = flush_interval_ms or settings.ws_event_batch_interval_ms
        self._max_batch_size = max_batch_size or settings.ws_event_batch_max_size
        self._buffer: list[tuple[str, dict[str, Any]]] = []
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._flush_task is not None:
            return
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info(
            "ws_event_batcher_started",
            flush_interval_ms=self._flush_interval_ms,
            max_batch_size=self._max_batch_size,
        )

    async def stop(self) -> None:
        if self._flush_task is None:
            return
        self._flush_task.cancel()
        try:
            await self._flush_task
        except asyncio.CancelledError:
            pass
        self._flush_task = None
        await self.flush()
        logger.info("ws_event_batcher_stopped")

    async def enqueue(self, event_type: str, data: dict[str, Any]) -> None:
        async with self._lock:
            self._buffer.append((event_type, data))
            if len(self._buffer) >= self._max_batch_size:
                await self._flush_locked()

    async def flush(self) -> None:
        async with self._lock:
            await self._flush_locked()

    async def _flush_loop(self) -> None:
        interval = max(self._flush_interval_ms, 1) / 1000.0
        try:
            while True:
                await asyncio.sleep(interval)
                await self.flush()
        except asyncio.CancelledError:
            raise

    async def _flush_locked(self) -> None:
        if not self._buffer:
            return
        events = [{"event_type": event_type, "data": data} for event_type, data in self._buffer]
        self._buffer.clear()
        await ws_manager.broadcast("event_batch", {"events": events})


event_batcher = EventBatcher()
