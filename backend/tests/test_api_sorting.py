"""Tests for shared API sort helpers."""

import pytest
from fastapi import HTTPException
from sqlalchemy import Column, Integer, MetaData, String, asc, desc
from sqlalchemy.orm import declarative_base

from app.api.sorting import apply_sort, parse_sort_dir

Base = declarative_base(metadata=MetaData())


class _SortModel(Base):
    __tablename__ = "sort_test"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    priority = Column(Integer)


def test_parse_sort_dir_defaults_to_desc():
    assert parse_sort_dir(None) == "desc"


def test_parse_sort_dir_accepts_asc():
    assert parse_sort_dir("ASC") == "asc"


def test_parse_sort_dir_rejects_invalid():
    with pytest.raises(HTTPException) as exc:
        parse_sort_dir("sideways")
    assert exc.value.status_code == 400


def test_apply_sort_unknown_column_uses_default_desc():
    clause = apply_sort(
        "missing",
        "asc",
        allowed={"name": _SortModel.name},
        default=_SortModel.priority,
    )
    assert clause.compare(desc(_SortModel.priority))


def test_apply_sort_known_column_respects_direction():
    asc_clause = apply_sort(
        "name",
        "asc",
        allowed={"name": _SortModel.name},
        default=_SortModel.priority,
    )
    desc_clause = apply_sort(
        "name",
        "desc",
        allowed={"name": _SortModel.name},
        default=_SortModel.priority,
    )
    assert asc_clause.compare(asc(_SortModel.name))
    assert desc_clause.compare(desc(_SortModel.name))
