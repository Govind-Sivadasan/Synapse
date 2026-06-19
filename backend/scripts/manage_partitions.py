"""Ensure PostgreSQL monthly partitions and apply retention for high-volume tables."""

from __future__ import annotations

import argparse
import asyncio

from app.config import settings
from app.database import engine
from app.services.partition_maintenance import ensure_all_partitions
from app.services.partition_retention import apply_partition_retention, retention_summary


async def _run(*, months_ahead: int, apply_retention: bool, dry_run: bool) -> tuple[dict, dict | None]:
    retention_results: dict | None = None
    async with engine.begin() as connection:
        ensure_results = await connection.run_sync(
            lambda sync_conn: ensure_all_partitions(sync_conn, months_ahead=months_ahead)
        )
        if apply_retention and settings.partition_retention_enabled:
            retention_results = await connection.run_sync(
                lambda sync_conn: apply_partition_retention(sync_conn, dry_run=dry_run)
            )
    return ensure_results, retention_results


def main() -> int:
    parser = argparse.ArgumentParser(description="Ensure Synapse monthly table partitions")
    parser.add_argument(
        "--months-ahead",
        type=int,
        default=settings.partition_months_ahead,
        help="Number of future months to pre-create partitions for",
    )
    parser.add_argument(
        "--skip-retention",
        action="store_true",
        help="Do not drop expired partitions (ensure-only)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report partitions that would be dropped without dropping",
    )
    args = parser.parse_args()

    ensure_results, retention_results = asyncio.run(
        _run(
            months_ahead=args.months_ahead,
            apply_retention=not args.skip_retention,
            dry_run=args.dry_run,
        )
    )
    for table, partitions in ensure_results.items():
        print(f"{table}: {len(partitions)} partition(s) checked")
    if retention_results is not None:
        mode = "dry-run" if args.dry_run else "applied"
        for table, partitions in retention_results.items():
            if partitions:
                print(f"{table}: {len(partitions)} partition(s) {mode} ({', '.join(partitions)})")
            else:
                print(f"{table}: no expired partitions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
