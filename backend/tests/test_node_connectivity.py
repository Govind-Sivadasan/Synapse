"""Unit tests for node connectivity checks."""

import pytest

from app.models.node import Node
from app.services.node_connectivity import probe_node_connectivity


@pytest.mark.asyncio
async def test_dimse_node_requires_port():
    node = Node(
        name="Test",
        node_type="source",
        protocol="DIMSE",
        host="pacs.local",
        port=None,
        ae_title="PACS",
        is_active=True,
    )
    result = await probe_node_connectivity(node)
    assert result["success"] is False
    assert "port" in result["message"].lower()


@pytest.mark.asyncio
async def test_dicomweb_node_requires_url():
    node = Node(
        name="Test",
        node_type="destination",
        protocol="DICOMweb",
        host="pacs.local",
        dicomweb_url=None,
        is_active=True,
    )
    result = await probe_node_connectivity(node)
    assert result["success"] is False
    assert "dicomweb" in result["message"].lower()
