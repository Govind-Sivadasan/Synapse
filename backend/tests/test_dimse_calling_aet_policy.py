"""Tests for DIMSE calling-AE allow-list policy."""

from unittest.mock import MagicMock

import pytest

from app.dimse.listener import calling_ae_from_assoc
from app.services import allowed_aets


def test_calling_ae_from_assoc_prefers_requestor_title():
    assoc = MagicMock()
    assoc.requestor.ae_title = "STORESCU"
    assoc.requestor.primitive = None
    assert calling_ae_from_assoc(assoc) == "STORESCU"


def test_calling_ae_from_assoc_reads_primitive_bytes():
    assoc = MagicMock()
    assoc.requestor.ae_title = ""
    assoc.requestor.primitive.calling_ae_title = b"UNKNOWN_MODALITY  "
    assert calling_ae_from_assoc(assoc) == "UNKNOWN_MODALITY"


def test_get_required_calling_aets_empty_when_promiscuous(monkeypatch):
    monkeypatch.setattr(
        allowed_aets,
        "get_runtime_config",
        lambda: {"dimse_promiscuous_mode": True},
    )
    allowed_aets.set_allowed_calling_aets({"PACS_A"})
    assert allowed_aets.get_required_calling_aets() == []


def test_get_required_calling_aets_lists_registered_sources_when_strict(monkeypatch):
    monkeypatch.setattr(
        allowed_aets,
        "get_runtime_config",
        lambda: {"dimse_promiscuous_mode": False},
    )
    allowed_aets.set_allowed_calling_aets({"PACS_A"})
    assert allowed_aets.get_required_calling_aets() == ["ECHOSCU", "PACS_A", "STORESCU"]


def test_get_required_calling_aets_deny_all_without_registered_sources(monkeypatch):
    monkeypatch.setattr(
        allowed_aets,
        "get_runtime_config",
        lambda: {"dimse_promiscuous_mode": False},
    )
    allowed_aets.set_allowed_calling_aets(set())
    assert allowed_aets.get_required_calling_aets() == ["__SYNAPSE_NO_CALLERS__"]


def test_is_calling_aet_allowed_respects_promiscuous_mode(monkeypatch):
    monkeypatch.setattr(
        allowed_aets,
        "get_runtime_config",
        lambda: {"dimse_promiscuous_mode": True},
    )
    allowed_aets.set_allowed_calling_aets({"PACS_A"})
    assert allowed_aets.is_calling_aet_allowed("UNKNOWN") is True

    monkeypatch.setattr(
        allowed_aets,
        "get_runtime_config",
        lambda: {"dimse_promiscuous_mode": False},
    )
    assert allowed_aets.is_calling_aet_allowed("UNKNOWN") is False
    assert allowed_aets.is_calling_aet_allowed("PACS_A") is True
    assert allowed_aets.is_calling_aet_allowed("STORESCU") is True


def test_destination_node_aet_does_not_authorize_dimse_intake(monkeypatch):
    """Only source node AETs belong in the allow-list; destination AEs are unrelated."""
    monkeypatch.setattr(
        allowed_aets,
        "get_runtime_config",
        lambda: {"dimse_promiscuous_mode": False},
    )
    allowed_aets.set_allowed_calling_aets({"ORTHANC_ONPREM"})
    assert allowed_aets.is_calling_aet_allowed("DCM4CHEE") is False
