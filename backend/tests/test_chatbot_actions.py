"""Unit tests for chatbot action planning."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

from app.chatbot.chat_actions import (
    action_followup_for_conversation,
    detect_chat_action_intent,
    detect_chat_action_intent_with_context,
    is_chat_action_request,
)


class _Msg:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content


def _node(name: str, node_type: str, *, protocol: str = "DICOMweb"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        name=name,
        node_type=node_type,
        protocol=protocol,
        host="127.0.0.1",
        port=8042 if protocol == "DICOMweb" else 11112,
        ae_title="TEST_AE",
        dicomweb_url="http://example/dicom-web" if protocol == "DICOMweb" else None,
        auth_type="none",
        auth_config=None,
        is_active=True,
    )


def _routing_rule(name: str, modality: str, dest_id: uuid.UUID):
    return SimpleNamespace(
        id=uuid.uuid4(),
        name=name,
        condition_tag="Modality",
        condition_operator="equals",
        condition_value=modality,
        destination_node_ids=[dest_id],
        priority=10,
        is_active=True,
    )


def _job(name: str, status: str = "not_started", *, source_id: uuid.UUID | None = None, dest_id: uuid.UUID | None = None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        name=name,
        status=status,
        job_type="historical",
        created_by="admin",
        source_node_id=source_id or uuid.uuid4(),
        destination_node_id=dest_id or uuid.uuid4(),
        job_config={"filters": {"modality": "CR"}, "tag_morphing_rule_ids": None, "qido_limit": 100},
    )


def _morph_rule(name: str):
    return SimpleNamespace(
        id=uuid.uuid4(),
        name=name,
        condition_tag="Modality",
        condition_operator="equals",
        condition_value="CT",
        target_tag="InstitutionName",
        new_value="Demo Hospital",
        is_active=True,
    )


def _resources():
    source = _node("MW PACS", "source")
    dest = _node("Orthanc Cloud", "destination")
    cr_job = _job("[CR] - MW -> Local", "completed", source_id=source.id, dest_id=dest.id)
    return {
        "nodes": [source, dest],
        "routing_rules": [_routing_rule("Route CT to Orthanc Cloud", "CT", dest.id)],
        "migration_jobs": [_job("MW PACS → Orthanc Cloud", source_id=source.id, dest_id=dest.id), cr_job],
        "tag_morphing_rules": [_morph_rule("CT Institution Rename")],
    }


def test_detects_routing_rule_create():
    action = detect_chat_action_intent("Create a rule to route MR studies to Orthanc Cloud", _resources())
    assert action is not None
    assert action["entity_type"] == "routing_rule"
    assert action["action_type"] == "create"


def test_detects_migration_job_start():
    action = detect_chat_action_intent("Start migration job MW PACS to Orthanc Cloud", _resources())
    assert action is not None
    assert action["entity_type"] == "migration_job"
    assert action["action_type"] == "start"


def test_detects_node_disable():
    action = detect_chat_action_intent("Disable node MW PACS", _resources())
    assert action is not None
    assert action["entity_type"] == "node"
    assert action["action_type"] == "update"
    assert action["payload"]["is_active"] is False


def test_detects_tag_morph_create():
    action = detect_chat_action_intent(
        "Create a tag morphing rule for CT to set InstitutionName to Demo Hospital",
        _resources(),
    )
    assert action is not None
    assert action["entity_type"] == "tag_morphing"
    assert action["action_type"] == "create"


def test_detects_node_create_with_dicomweb_url():
    action = detect_chat_action_intent(
        "Create a destination node named 'Demo PACS' at http://10.2.1.10/dicom-web",
        _resources(),
    )
    assert action is not None
    assert action["entity_type"] == "node"
    assert action["action_type"] == "create"
    assert action["payload"]["name"] == "Demo PACS"
    assert action["payload"]["dicomweb_url"] == "http://10.2.1.10/dicom-web"
    assert action["payload"]["protocol"] == "DICOMweb"


def test_request_detector_catches_supported_phrases():
    assert is_chat_action_request("Resume migration job MW PACS → Orthanc Cloud")
    assert is_chat_action_request("Delete node Orthanc Cloud")
    assert is_chat_action_request("Create a tag morphing rule for CT to set InstitutionName to Demo Hospital")
    assert is_chat_action_request("Duplicate migration job [CR] - MW -> Local")


def test_detects_migration_job_duplicate():
    action = detect_chat_action_intent("Duplicate migration job [CR] - MW -> Local", _resources())
    assert action is not None
    assert action["entity_type"] == "migration_job"
    assert action["action_type"] == "create"
    assert action["confirm_label"] == "Duplicate job"
    assert action["payload"]["name"] == "[CR] - MW -> Local (copy)"


def test_yes_confirmation_uses_conversation_context():
    resources = _resources()
    history = [
        _Msg("user", "Duplicate migration job [CR] - MW -> Local"),
        _Msg(
            "assistant",
            "I can duplicate “[CR] - MW -> Local”. Would you like to proceed with creating this duplicate job?",
        ),
        _Msg("user", "yes"),
    ]
    action = detect_chat_action_intent_with_context("yes", resources, history)
    assert action is not None
    assert action["entity_type"] == "migration_job"
    assert action["action_type"] == "create"
    assert "[CR] - MW -> Local" in action["summary"]


def test_multi_turn_node_create():
    resources = _resources()
    history = [
        _Msg("user", "Create a new node"),
        _Msg("assistant", "Should this be a source node or a destination node?"),
        _Msg("user", "destination named Demo PACS at http://10.2.1.10/dicom-web"),
    ]
    action = detect_chat_action_intent_with_context(
        "destination named Demo PACS at http://10.2.1.10/dicom-web",
        resources,
        history,
    )
    assert action is not None
    assert action["entity_type"] == "node"
    assert action["payload"]["name"] == "Demo PACS"


def test_followup_for_incomplete_node():
    resources = _resources()
    history = [_Msg("user", "Create a new node")]
    hint = action_followup_for_conversation("Create a new node", resources, history)
    assert hint is not None
    assert "source" in hint.lower() and "destination" in hint.lower()


def test_create_node_not_confused_by_migration_history():
    resources = _resources()
    history = [
        _Msg("user", "Create a historical migration job from MW PACS to Local PACS"),
        _Msg("assistant", "Which source and destination nodes should this migration job use?"),
        _Msg("user", "Create a node"),
    ]
    action = detect_chat_action_intent_with_context("Create a node", resources, history)
    assert action is None
    hint = action_followup_for_conversation("Create a node", resources, history)
    assert hint == "Should this be a source node or a destination node?"


def test_detects_migration_job_retry_failed():
    action = detect_chat_action_intent("Retry failed migration job MW PACS → Orthanc Cloud", _resources())
    assert action is not None
    assert action["entity_type"] == "migration_job"
    assert action["action_type"] == "retry_failed"
    assert action["confirm_label"] == "Retry failed"
    assert action["payload"]["limit"] == 50


def test_detects_migration_job_retry_failed_with_limit():
    action = detect_chat_action_intent("Retry failed studies on migration job MW PACS → Orthanc Cloud limit 25", _resources())
    assert action is not None
    assert action["action_type"] == "retry_failed"
    assert action["payload"]["limit"] == 25
