"""Pipeline trace / correlation IDs (Phase 3)."""

from __future__ import annotations

import contextvars
import uuid
from contextlib import contextmanager
from typing import Iterator

import structlog

trace_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("synapse_trace_id", default=None)

TRACE_KWARG = "_synapse_trace_id"


def new_trace_id() -> str:
    return uuid.uuid4().hex[:16]


def get_trace_id() -> str | None:
    return trace_id_var.get()


def bind_trace(trace_id: str | None = None, **context: str) -> str:
    """Bind trace id and optional fields to structlog context."""
    effective = trace_id or new_trace_id()
    trace_id_var.set(effective)
    structlog.contextvars.bind_contextvars(trace_id=effective, **context)
    return effective


def clear_trace() -> None:
    trace_id_var.set(None)
    structlog.contextvars.clear_contextvars()


@contextmanager
def trace_context(trace_id: str | None = None, **context: str) -> Iterator[str]:
    bind_trace(trace_id, **context)
    try:
        yield get_trace_id() or ""
    finally:
        clear_trace()


def trace_kwargs(trace_id: str | None = None, **context: str) -> dict[str, str]:
    """Extra kwargs for Celery ``.delay`` / ``send_task``."""
    effective = trace_id or get_trace_id() or new_trace_id()
    payload = {TRACE_KWARG: effective}
    for key, value in context.items():
        if value:
            payload[f"_synapse_{key}"] = value
    return payload
