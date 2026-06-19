"""Tests for parallel STOW batch uploads."""

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.dicomweb.client import DICOMwebClient
from app.dicomweb.stow_rs import chunk_paths


def test_chunk_paths_single_batch_when_zero():
    paths = [Path(f"/tmp/{index}.dcm") for index in range(5)]
    assert chunk_paths(paths, 0) == [paths]


def test_chunk_paths_splits_evenly():
    paths = [Path(f"/tmp/{index}.dcm") for index in range(10)]
    batches = chunk_paths(paths, 4)
    assert len(batches) == 3
    assert [len(batch) for batch in batches] == [4, 4, 2]


@pytest.mark.asyncio
async def test_stow_rs_uploads_batches_in_parallel(tmp_path: Path):
    files = [tmp_path / f"{index}.dcm" for index in range(6)]
    for path in files:
        path.write_bytes(b"dicom")

    client = DICOMwebClient(max_retries=0, timeout=5.0)
    active = 0
    peak = 0
    lock = asyncio.Lock()

    async def fake_upload_batch(batch, upload_url, headers, *, batch_index, batch_count):
        nonlocal active, peak
        async with lock:
            active += 1
            peak = max(peak, active)
        await asyncio.sleep(0.05)
        async with lock:
            active -= 1
        from app.dicomweb.stow_rs import StowRsResult

        return StowRsResult(http_status=200, accepted_instances=["ok"])

    auth = MagicMock()
    auth.get_headers.return_value = {"Authorization": "Bearer test"}

    with patch.object(client, "_upload_batch", side_effect=fake_upload_batch):
        await client.stow_rs(
            files,
            "http://example/dicom-web",
            auth,
            batch_size=2,
            parallel_batches=2,
        )

    assert peak >= 2
