"""Ensure PostgreSQL monthly partitions for audit_logs and dimse_events."""

from __future__ import annotations

import argparse
import asyncio

from app.config import settings
from app.database import engine
from app.services.partition_maintenance import ensure_all_partitions


async def _ensure(months_ahead: int) -> dict[str, list[str]]:
    async with engine.begin() as connection:
        return await connection.run_sync(
            lambda sync_conn: ensure_all_partitions(sync_conn, months_ahead=months_ahead)
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Ensure Synapse monthly table partitions")
    parser.add_argument(
        "--months-ahead",
        type=int,
        default=settings.partition_months_ahead,
        help="Number of future months to pre-create partitions for",
    )
    args = parser.parse_args()

    results = asyncio.run(_ensure(args.months_ahead))
    for table, partitions in results.items():
        print(f"{table}: {len(partitions)} partition(s) checked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
