"""Short-lived Redis cache for dashboard metrics responses."""

from __future__ import annotations

import json

import redis

from app.config import settings

_redis: redis.Redis | None = None
_DASHBOARD_KEY = "synapse:cache:dashboard:metrics"


def _client() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def get_dashboard_metrics_cache() -> dict | None:
    if settings.dashboard_metrics_cache_ttl_seconds <= 0:
        return None
    try:
        raw = _client().get(_DASHBOARD_KEY)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def set_dashboard_metrics_cache(payload: dict) -> None:
    if settings.dashboard_metrics_cache_ttl_seconds <= 0:
        return
    try:
        _client().setex(
            _DASHBOARD_KEY,
            settings.dashboard_metrics_cache_ttl_seconds,
            json.dumps(payload),
        )
    except Exception:
        pass
