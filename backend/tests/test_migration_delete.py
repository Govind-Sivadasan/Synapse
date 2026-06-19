"""Tests for migration job delete guards."""

DELETABLE_JOB_STATUSES = frozenset({"not_started", "completed", "failed", "partial", "cancelled"})


def can_delete_job(status: str) -> bool:
    return status not in ("in_progress", "discovering") and status in DELETABLE_JOB_STATUSES


def test_delete_allowed_for_terminal_statuses():
    for status in ("not_started", "completed", "failed", "partial", "cancelled"):
        assert can_delete_job(status)


def test_delete_blocked_while_in_progress():
    assert not can_delete_job("in_progress")


def test_delete_blocked_while_discovering():
    assert not can_delete_job("discovering")
