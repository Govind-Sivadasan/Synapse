"""Reset Synapse cumulative performance metrics in Redis."""

from __future__ import annotations

import argparse
import sys

from app.observability.metrics import reset_cumulative_metrics, save_baseline_marker


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Reset Synapse cumulative performance metrics stored in Redis",
    )
    parser.add_argument(
        "--mark-first",
        action="store_true",
        help="Save a baseline marker before reset (prints marker id)",
    )
    parser.add_argument(
        "--label",
        default=None,
        help="Optional label when using --mark-first",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    args = parser.parse_args()

    if not args.yes:
        prompt = "Delete all Synapse cumulative performance metrics and markers? [y/N] "
        if input(prompt).strip().lower() not in {"y", "yes"}:
            print("Cancelled.")
            return 1

    if args.mark_first:
        marker = save_baseline_marker(label=args.label)
        print(f"Saved marker: {marker['marker_id']}")
        if marker.get("label"):
            print(f"Label: {marker['label']}")

    deleted = reset_cumulative_metrics()
    print(f"Deleted {deleted} Redis keys.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
