"""Tests for Phase 2.1 streaming migration coordinator."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.dicomweb.qido_rs import QidoStudy


@pytest.mark.asyncio
async def test_discover_studies_page_returns_single_page():
    from app.migration.engine import MigrationEngine

    job_id = uuid.uuid4()
    mock_job = MagicMock()
    mock_job.status = "discovering"
    mock_job.discovery_offset = 100
    mock_job.job_type = "historical"
    mock_job.job_config = {"filters": {}, "qido_limit": 50}
    mock_job.source_node_id = uuid.uuid4()

    mock_source = MagicMock()
    mock_source.dicomweb_url = "http://pacs/dicom-web"
    mock_source.is_active = True

    page = [QidoStudy(study_uid=f"1.2.3.{i}") for i in range(50)]

    engine = MigrationEngine()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = AsyncMock()
    mock_ctx.__aexit__.return_value = None

    with patch("app.migration.engine.async_session_factory", return_value=mock_ctx):
        with patch.object(engine, "_get_job", new=AsyncMock(return_value=mock_job)):
            with patch.object(engine, "_get_source_node", new=AsyncMock(return_value=mock_source)):
                with patch.object(engine, "_ensure_modality_query_key", new=AsyncMock(return_value=None)):
                    with patch("app.migration.engine.search_studies", new=AsyncMock(return_value=page)) as mock_search:
                        studies, has_more = await engine.discover_studies_page(job_id)

    assert len(studies) == 50
    assert has_more is True
    mock_search.assert_awaited_once()
    assert mock_search.await_args.kwargs["offset"] == 100
    assert mock_search.await_args.kwargs["limit"] == 50


@pytest.mark.asyncio
async def test_discover_studies_page_batch_uids_single_fetch():
    from app.migration.engine import MigrationEngine

    job_id = uuid.uuid4()
    mock_job = MagicMock()
    mock_job.status = "discovering"
    mock_job.discovery_offset = 0
    mock_job.job_type = "batch"
    mock_job.job_config = {"filters": {"study_uids": ["1.2.3", "1.2.4"]}}

    engine = MigrationEngine()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = AsyncMock()
    mock_ctx.__aexit__.return_value = None

    with patch("app.migration.engine.async_session_factory", return_value=mock_ctx):
        with patch.object(engine, "_get_job", new=AsyncMock(return_value=mock_job)):
            with patch.object(engine, "_get_source_node", new=AsyncMock()):
                studies, has_more = await engine.discover_studies_page(job_id)

    assert [s.study_uid for s in studies] == ["1.2.3", "1.2.4"]
    assert has_more is False


@pytest.mark.asyncio
async def test_advance_discovery_progress_marks_complete():
    from app.migration.engine import MigrationEngine

    job_id = uuid.uuid4()
    mock_job = MagicMock()
    mock_job.status = "discovering"
    mock_job.discovery_offset = 0
    mock_job.discovered_studies = 0
    mock_job.start_time = None

    mock_session = AsyncMock()
    mock_session.scalar = AsyncMock(return_value=2)

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_session
    mock_ctx.__aexit__.return_value = None

    engine = MigrationEngine()
    page = [QidoStudy(study_uid="1.2.3"), QidoStudy(study_uid="1.2.4")]
    with patch("app.migration.engine.async_session_factory", return_value=mock_ctx):
        with patch.object(engine, "_get_job", new=AsyncMock(return_value=mock_job)):
            await engine.advance_discovery_progress(job_id, page, has_more=False, first_tick=True)

    assert mock_job.discovery_offset == 2
    assert mock_job.discovered_studies == 2
    assert mock_job.discovery_complete is True
    assert mock_job.status == "in_progress"
    assert mock_job.total_studies == 2
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_coordinator_tick_chains_next_page(monkeypatch):
    from tasks import migration_tasks

    job_id = str(uuid.uuid4())
    job_uuid = uuid.UUID(job_id)
    page = [QidoStudy(study_uid="1.2.3")]

    monkeypatch.setattr(migration_tasks.settings, "migration_streaming_discovery", True)
    monkeypatch.setattr(migration_tasks.settings, "migration_coordinator_chain_delay_seconds", 0.0)

    mock_engine = MagicMock()
    mock_engine.discover_studies_page = AsyncMock(return_value=(page, True))
    mock_engine.enqueue_study_records = AsyncMock(return_value=1)
    mock_engine.study_uids_needing_migration = AsyncMock(return_value=["1.2.3"])
    mock_engine.advance_discovery_progress = AsyncMock()

    mock_job = MagicMock()
    mock_job.status = "discovering"
    mock_job.discovery_offset = 0
    mock_job.discovery_complete = False

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.commit = AsyncMock()

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_session
    mock_ctx.__aexit__.return_value = None

    with patch("app.migration.engine.MigrationEngine", return_value=mock_engine):
        with patch("app.database.async_session_factory", return_value=mock_ctx):
            with patch("tasks.migration_tasks.wait_for_migration_queue_slot"):
                with patch("tasks.migration_tasks.migrate_study") as mock_migrate:
                    with patch("app.workers.dispatch.enqueue_coordinator_next_page") as mock_chain:
                        result = await migration_tasks._coordinator_tick(job_id)

    assert result["has_more"] is True
    assert result["enqueued"] == 1
    mock_chain.assert_called_once_with(job_id, countdown=0.0)
    mock_migrate.delay.assert_called_once()


@pytest.mark.asyncio
async def test_coordinator_tick_resume_when_discovery_complete(monkeypatch):
    from tasks import migration_tasks

    job_id = str(uuid.uuid4())
    record = MagicMock()
    record.status = "pending"
    record.study_uid = "1.2.3"

    mock_job = MagicMock()
    mock_job.status = "in_progress"
    mock_job.discovery_complete = True

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [record]
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.get = AsyncMock(return_value=mock_job)
    mock_session.commit = AsyncMock()

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_session
    mock_ctx.__aexit__.return_value = None

    with patch("app.database.async_session_factory", return_value=mock_ctx):
        with patch("tasks.migration_tasks.wait_for_migration_queue_slot"):
            with patch("tasks.migration_tasks.migrate_study") as mock_migrate:
                result = await migration_tasks._coordinator_tick(job_id)

    assert result["resumed"] is True
    assert result["enqueued"] == 1
    mock_migrate.delay.assert_called_once()
