"""Unit tests for node deletion blocker messages."""

from uuid import uuid4

import pytest

from app.services.node_deletion import get_node_deletion_blockers


class _ScalarResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return self

    def all(self):
        return self._values

    def __iter__(self):
        return iter(self._values)


class _FakeSession:
    def __init__(self, job_names: list[str], job_total: int, routing_dest_count: int):
        self.job_names = job_names
        self.job_total = job_total
        self.routing_dest_count = routing_dest_count

    async def scalar(self, _query):
        sql = str(_query)
        if "routing_destinations" in sql:
            return self.routing_dest_count
        if "migration_jobs" in sql:
            return self.job_total
        return 0

    async def execute(self, query):
        sql = str(query)
        if "migration_jobs" in sql and "ORDER BY" in sql:
            return _ScalarResult(self.job_names)
        return _ScalarResult([])


@pytest.mark.asyncio
async def test_blockers_include_migration_jobs():
    node_id = uuid4()
    session = _FakeSession(["Job A", "Job B"], 2, 0)
    reasons = await get_node_deletion_blockers(session, node_id)
    assert len(reasons) == 1
    assert "migration job" in reasons[0]
    assert "Job A" in reasons[0]


@pytest.mark.asyncio
async def test_blockers_include_routing_history():
    node_id = uuid4()
    session = _FakeSession([], 0, 3)
    reasons = await get_node_deletion_blockers(session, node_id)
    assert len(reasons) == 1
    assert "routing history" in reasons[0]
    assert "3" in reasons[0]


@pytest.mark.asyncio
async def test_blockers_empty_when_unreferenced():
    node_id = uuid4()
    session = _FakeSession([], 0, 0)
    reasons = await get_node_deletion_blockers(session, node_id)
    assert reasons == []
