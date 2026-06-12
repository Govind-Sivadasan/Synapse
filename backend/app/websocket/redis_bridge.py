"""Bridge Redis pub/sub events to WebSocket clients."""

import asyncio
import json

import redis.asyncio as aioredis
import structlog

from app.config import settings
from app.services.event_publisher import EVENTS_CHANNEL
from app.websocket.manager import ws_manager

logger = structlog.get_logger()


async def redis_event_subscriber() -> None:
    client = aioredis.from_url(settings.redis_url)
    pubsub = client.pubsub()
    await pubsub.subscribe(EVENTS_CHANNEL)
    logger.info("redis_event_subscriber_started", channel=EVENTS_CHANNEL)

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                try:
                    payload = json.loads(message["data"])
                    await ws_manager.broadcast(payload.get("event_type", "event"), payload.get("data", {}))
                except json.JSONDecodeError:
                    logger.warning("invalid_redis_event_payload")
            await asyncio.sleep(0.01)
    except asyncio.CancelledError:
        logger.info("redis_event_subscriber_stopped")
        raise
    finally:
        await pubsub.unsubscribe(EVENTS_CHANNEL)
        await client.aclose()
