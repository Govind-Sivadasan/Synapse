"""Tests for migration job start pre-flight checks."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.node import Node
from app.services.migration_preflight import (
    ensure_no_other_active_migration_job,
    verify_migration_node_connectivity,
)


@pytest.mark.asyncio
async def test_ensure_no_other_active_job_blocks():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=1)

    with patch("app.services.migration_preflight.settings.migration_single_active_job", True):
        with pytest.raises(HTTPException) as exc:
            await ensure_no_other_active_migration_job(db, uuid4())

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_ensure_no_other_active_job_allows_when_disabled():
    db = AsyncMock()

    with patch("app.services.migration_preflight.settings.migration_single_active_job", False):
        await ensure_no_other_active_migration_job(db, uuid4())

    db.scalar.assert_not_awaited()


@pytest.mark.asyncio
async def test_verify_connectivity_fails_on_source():
    source = Node(
        id=uuid4(),
        name="src",
        node_type="source",
        protocol="DICOMweb",
        host="localhost",
        dicomweb_url="http://src/dicom-web",
        is_active=True,
    )
    dest = Node(
        id=uuid4(),
        name="dst",
        node_type="destination",
        protocol="DICOMweb",
        host="localhost",
        dicomweb_url="http://dst/dicom-web",
        is_active=True,
    )

    with patch("app.services.migration_preflight.settings.migration_preflight_echo", True):
        with patch(
            "app.services.migration_preflight.probe_node_connectivity",
            new=AsyncMock(return_value={"success": False, "message": "timeout"}),
        ):
            with pytest.raises(HTTPException) as exc:
                await verify_migration_node_connectivity(source, dest)

    assert exc.value.status_code == 422
    assert "Source" in exc.value.detail


@pytest.mark.asyncio
async def test_verify_connectivity_skipped_when_disabled():
    source = Node(
        id=uuid4(),
        name="src",
        node_type="source",
        protocol="DICOMweb",
        host="localhost",
        dicomweb_url="http://src/dicom-web",
        is_active=True,
    )
    dest = Node(
        id=uuid4(),
        name="dst",
        node_type="destination",
        protocol="DICOMweb",
        host="localhost",
        dicomweb_url="http://dst/dicom-web",
        is_active=True,
    )

    with patch("app.services.migration_preflight.settings.migration_preflight_echo", False):
        result = await verify_migration_node_connectivity(source, dest)

    assert result == {"source": None, "destination": None}
