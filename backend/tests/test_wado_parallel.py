"""Tests for parallel WADO-RS instance retrieval (Phase 2)."""

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.dicomweb.wado_rs import _InstanceRef, retrieve_study_instances


@pytest.mark.asyncio
async def test_retrieve_study_instances_downloads_in_parallel(tmp_path: Path):
    refs = [
        _InstanceRef(sop_uid=f"sop-{index}", url=f"http://example/instances/sop-{index}")
        for index in range(4)
    ]
    active = 0
    peak = 0
    lock = asyncio.Lock()

    async def fake_retrieve(_client, _url, _headers, sop_uid: str) -> bytes:
        nonlocal active, peak
        async with lock:
            active += 1
            peak = max(peak, active)
        await asyncio.sleep(0.05)
        async with lock:
            active -= 1
        return f"DICOM-{sop_uid}".encode()

    auth = MagicMock()
    auth.get_headers.return_value = {"Authorization": "Bearer test"}

    with (
        patch("app.dicomweb.wado_rs.get_dicomweb_client", return_value=AsyncMock()),
        patch("app.dicomweb.wado_rs._collect_instance_refs", AsyncMock(return_value=refs)),
        patch("app.dicomweb.wado_rs._retrieve_instance", side_effect=fake_retrieve),
    ):
        saved = await retrieve_study_instances(
            "http://example/dicom-web",
            "1.2.3",
            auth,
            tmp_path,
            parallel_instances=4,
        )

    assert len(saved) == 4
    assert peak >= 2
    for ref in refs:
        assert (tmp_path / f"{ref.sop_uid}.dcm").read_bytes() == f"DICOM-{ref.sop_uid}".encode()


@pytest.mark.asyncio
async def test_retrieve_study_instances_serial_when_concurrency_one(tmp_path: Path):
    refs = [
        _InstanceRef(sop_uid=f"sop-{index}", url=f"http://example/instances/sop-{index}")
        for index in range(3)
    ]
    active = 0
    peak = 0
    lock = asyncio.Lock()

    async def fake_retrieve(_client, _url, _headers, sop_uid: str) -> bytes:
        nonlocal active, peak
        async with lock:
            active += 1
            peak = max(peak, active)
        await asyncio.sleep(0.01)
        async with lock:
            active -= 1
        return sop_uid.encode()

    auth = MagicMock()
    auth.get_headers.return_value = {}

    with (
        patch("app.dicomweb.wado_rs.get_dicomweb_client", return_value=AsyncMock()),
        patch("app.dicomweb.wado_rs._collect_instance_refs", AsyncMock(return_value=refs)),
        patch("app.dicomweb.wado_rs._retrieve_instance", side_effect=fake_retrieve),
    ):
        saved = await retrieve_study_instances(
            "http://example/dicom-web",
            "1.2.3",
            auth,
            tmp_path,
            parallel_instances=1,
        )

    assert len(saved) == 3
    assert peak == 1
