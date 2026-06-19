"""Tests for partition maintenance helpers."""

from datetime import date

from app.services.partition_maintenance import add_months, iter_month_starts, partition_table_name


def test_add_months_wraps_year():
    assert add_months(date(2026, 11, 15), 2) == date(2027, 1, 1)


def test_iter_month_starts_inclusive():
    months = list(iter_month_starts(date(2026, 1, 1), date(2026, 3, 1)))
    assert months == [date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1)]


def test_partition_table_name():
    assert partition_table_name("audit_logs", date(2026, 6, 1)) == "audit_logs_2026_06"
    assert partition_table_name("routing_transactions", date(2026, 6, 1)) == "routing_transactions_2026_06"


def test_partitioned_tables_include_routing_and_migration():
    from app.services.partition_maintenance import PARTITIONED_TABLES

    assert PARTITIONED_TABLES["routing_transactions"] == "received_at"
    assert PARTITIONED_TABLES["migration_study_records"] == "created_at"
