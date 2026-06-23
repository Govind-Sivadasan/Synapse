"""Unit tests for node role helpers."""

from app.services.node_roles import (
    node_is_destination,
    node_is_source,
    node_matches_role,
)


def test_node_is_source():
    assert node_is_source("source")
    assert node_is_source("both")
    assert not node_is_source("destination")


def test_node_is_destination():
    assert node_is_destination("destination")
    assert node_is_destination("both")
    assert not node_is_destination("source")


def test_node_matches_role():
    assert node_matches_role("both", "source")
    assert node_matches_role("both", "destination")
    assert node_matches_role("source", "source")
    assert not node_matches_role("destination", "source")
