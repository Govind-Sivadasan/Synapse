"""Tests for partition retention helpers (Phase 3.2)."""

from datetime import date

from app.services.partition_retention import (
    TABLE_RETENTION_MONTHS,
    expired_partitions,
    first_month_to_retain,
    parse_partition_month,
    retention_months_for_table,
)


def test_parse_partition_month():
    assert parse_partition_month("audit_logs_2026_06", "audit_logs") == date(2026, 6, 1)
    assert parse_partition_month("routing_transactions_2025_12", "routing_transactions") == date(2025, 12, 1)
    assert parse_partition_month("audit_logs_bad", "audit_logs") is None
    assert parse_partition_month("other_2026_06", "audit_logs") is None


def test_first_month_to_retain_twelve_months():
    assert first_month_to_retain(12, today=date(2026, 6, 15)) == date(2025, 7, 1)


def test_first_month_to_retain_zero_disables():
    assert first_month_to_retain(0, today=date(2026, 6, 15)) == date.max


def test_retention_months_per_table():
    assert retention_months_for_table("dimse_events") == TABLE_RETENTION_MONTHS["dimse_events"]
    assert retention_months_for_table("unknown_table") == 12


class FakeConnection:
    def __init__(self, partitions: dict[str, list[str]]) -> None:
        self.partitions = partitions

    def execute(self, statement, params=None):
        parent = (params or {}).get("parent")
        names = self.partitions.get(parent, [])

        class Result:
            def __init__(self, rows):
                self._rows = rows

            def all(self):
                return self._rows

        return Result([(name,) for name in names])


def test_expired_partitions_respects_retention_window():
    connection = FakeConnection(
        {
            "audit_logs": [
                "audit_logs_2025_05",
                "audit_logs_2025_06",
                "audit_logs_2025_07",
                "audit_logs_2026_06",
            ]
        }
    )
    expired = expired_partitions(
        connection,  # type: ignore[arg-type]
        "audit_logs",
        retention_months=12,
        today=date(2026, 6, 15),
    )
    assert expired == ["audit_logs_2025_05", "audit_logs_2025_06"]
