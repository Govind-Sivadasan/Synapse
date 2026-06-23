"""Tests for source/destination node pair validation."""

import uuid

import pytest
from fastapi import HTTPException

from app.services.node_pair_validation import ensure_distinct_endpoints


def test_ensure_distinct_endpoints_allows_different_nodes():
    ensure_distinct_endpoints(uuid.uuid4(), uuid.uuid4())


def test_ensure_distinct_endpoints_rejects_same_node():
    node_id = uuid.uuid4()
    with pytest.raises(HTTPException) as exc:
        ensure_distinct_endpoints(node_id, node_id)
    assert exc.value.status_code == 400
    assert "different nodes" in exc.value.detail
