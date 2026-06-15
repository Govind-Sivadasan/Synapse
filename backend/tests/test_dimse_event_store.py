"""Tests for persisted DIMSE event serialization."""

from datetime import datetime, timezone
from uuid import uuid4

from app.models.dimse_event import DimseEvent
from app.services.dimse_event_store import _event_to_dict


def test_event_to_dict_includes_study_fields():
    event = DimseEvent(
        id=uuid4(),
        event_type="study_assembled",
        calling_ae="STORESCU",
        study_uid="1.2.3.4",
        instances=3,
        created_at=datetime(2026, 6, 13, tzinfo=timezone.utc),
    )
    payload = _event_to_dict(event)
    assert payload["type"] == "study_assembled"
    assert payload["calling_ae"] == "STORESCU"
    assert payload["study_uid"] == "1.2.3.4"
    assert payload["instances"] == 3
