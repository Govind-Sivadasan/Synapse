"""Tests for Phase 3 trace context."""

from app.observability.tracing import (
    clear_trace,
    get_trace_id,
    new_trace_id,
    trace_context,
    trace_kwargs,
)


def test_trace_context_lifecycle():
    assert get_trace_id() is None
    with trace_context("abc123", job_id="job-1") as trace_id:
        assert trace_id == "abc123"
        assert get_trace_id() == "abc123"
    assert get_trace_id() is None


def test_trace_kwargs_includes_trace_and_context():
    with trace_context("deadbeef"):
        payload = trace_kwargs(study_uid="1.2.3")
    assert payload["_synapse_trace_id"] == "deadbeef"
    assert payload["_synapse_study_uid"] == "1.2.3"


def test_new_trace_id_length():
    assert len(new_trace_id()) == 16


def test_clear_trace():
    with trace_context("trace-me"):
        clear_trace()
    assert get_trace_id() is None
