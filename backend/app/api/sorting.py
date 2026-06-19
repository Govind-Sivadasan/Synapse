"""Shared list sort helpers for paginated API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import asc, desc
from sqlalchemy.sql.elements import ColumnElement


def parse_sort_dir(sort_dir: str | None) -> str:
    value = (sort_dir or "desc").lower()
    if value not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="sort_dir must be 'asc' or 'desc'")
    return value


def apply_sort(
    sort_by: str | None,
    sort_dir: str | None,
    *,
    allowed: dict[str, ColumnElement[Any]],
    default: ColumnElement[Any],
) -> ColumnElement[Any]:
    """Return an ORDER BY clause for the requested column."""
    direction = parse_sort_dir(sort_dir)
    if sort_by and sort_by in allowed:
        column = allowed[sort_by]
        return asc(column) if direction == "asc" else desc(column)
    return desc(default)
