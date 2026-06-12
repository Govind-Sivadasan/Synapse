"""Publish real-time events to Redis for WebSocket broadcasting."""

import json
from typing import Any

import redis

from app.config import settings

EVENTS_CHANNEL = "synapse:events"


def publish_event(event_type: str, data: dict[str, Any]) -> None:
    client = redis.from_url(settings.redis_url)
    try:
        client.publish(EVENTS_CHANNEL, json.dumps({"event_type": event_type, "data": data}))
    finally:
        client.close()
