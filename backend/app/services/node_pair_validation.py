"""Validate source/destination node pairs for migration and related flows."""

from __future__ import annotations

import uuid

from fastapi import HTTPException


def ensure_distinct_endpoints(
    source_node_id: uuid.UUID,
    destination_node_id: uuid.UUID,
    *,
    context: str = "migration",
) -> None:
    """Reject using the same PACS node as both source and destination."""
    if source_node_id == destination_node_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "Source and destination must be different nodes. "
                f"Choose another destination for this {context}."
            ),
        )
