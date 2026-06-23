"""Helpers for node source/destination role checks."""

from __future__ import annotations

NODE_TYPE_SOURCE = "source"
NODE_TYPE_DESTINATION = "destination"
NODE_TYPE_BOTH = "both"

VALID_NODE_TYPES = frozenset({NODE_TYPE_SOURCE, NODE_TYPE_DESTINATION, NODE_TYPE_BOTH})


def node_is_source(node_type: str) -> bool:
    return node_type in (NODE_TYPE_SOURCE, NODE_TYPE_BOTH)


def node_is_destination(node_type: str) -> bool:
    return node_type in (NODE_TYPE_DESTINATION, NODE_TYPE_BOTH)


def node_matches_role(node_type: str, role: str) -> bool:
    if role == NODE_TYPE_SOURCE:
        return node_is_source(node_type)
    if role == NODE_TYPE_DESTINATION:
        return node_is_destination(node_type)
    return node_type == role
