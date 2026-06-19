"""Celery task hooks for trace context propagation."""

from __future__ import annotations

from celery.signals import task_postrun, task_prerun

from app.observability.tracing import TRACE_KWARG, bind_trace, clear_trace, new_trace_id


@task_prerun.connect
def _bind_celery_trace(task_id=None, task=None, args=None, kwargs=None, **extra) -> None:
    payload = kwargs or {}
    trace_id = payload.get(TRACE_KWARG) or new_trace_id()
    context = {
        key.removeprefix("_synapse_"): value
        for key, value in payload.items()
        if key.startswith("_synapse_") and key != TRACE_KWARG and isinstance(value, str)
    }
    bind_trace(trace_id, **context)


@task_postrun.connect
def _clear_celery_trace(**extra) -> None:
    clear_trace()
