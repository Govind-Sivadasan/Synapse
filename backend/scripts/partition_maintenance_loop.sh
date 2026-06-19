#!/bin/sh
set -e

INTERVAL="${PARTITION_MAINTENANCE_INTERVAL_SECONDS:-86400}"

echo "Partition maintenance loop started (interval=${INTERVAL}s)"

while true; do
  python scripts/manage_partitions.py || echo "partition maintenance failed; will retry"
  sleep "$INTERVAL"
done
