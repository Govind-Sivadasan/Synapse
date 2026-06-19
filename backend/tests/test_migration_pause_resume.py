"""Tests for pause/resume reclaim behavior."""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest


@pytest.mark.asyncio
async def test_resume_enqueue_reclaims_in_progress_before_enqueue():
    from tasks import migration_tasks

    job_id = str(uuid.uuid4())
    job_uuid = uuid.UUID(job_id)

    pending = MagicMock()
    pending.status = "pending"
    pending.study_uid = "1.2.3.pending"

    reclaimed = MagicMock()
    reclaimed.status = "pending"
    reclaimed.study_uid = "1.2.4.reclaimed"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [pending, reclaimed]
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.commit = AsyncMock()

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_session
    mock_ctx.__aexit__.return_value = None

    reclaim_calls = {"count": 0}

    async def fake_reclaim(job_uuid_arg):
        reclaim_calls["count"] += 1
        assert job_uuid_arg == job_uuid
        return 1

    with patch("app.database.async_session_factory", return_value=mock_ctx):
        with patch.object(migration_tasks, "_reclaim_in_progress_studies", side_effect=fake_reclaim):
            with patch.object(migration_tasks, "_finalize_job_if_idle", AsyncMock()):
                with patch("tasks.migration_tasks.wait_for_migration_queue_slot"):
                    with patch("tasks.migration_tasks.migrate_study") as mock_migrate:
                        result = await migration_tasks._resume_enqueue(job_id, job_uuid)

    assert reclaim_calls["count"] == 1
    assert result["reclaimed"] == 1
    assert result["enqueued"] == 2
    assert mock_migrate.delay.call_count == 2
