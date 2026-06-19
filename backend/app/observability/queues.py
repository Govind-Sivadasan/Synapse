"""Celery queue depth from Redis broker lists."""

from __future__ import annotations

import asyncio

import redis.asyncio as aioredis
import redis as sync_redis

from app.config import settings

CELERY_QUEUES = ("routing_queue", "migration_queue")


async def get_queue_depths() -> dict[str, int]:
    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        depths: dict[str, int] = {}
        for queue in CELERY_QUEUES:
            depths[queue] = int(await client.llen(queue))
        return depths
    finally:
        await client.aclose()


def get_queue_depths_sync() -> dict[str, int]:
    client = sync_redis.from_url(settings.redis_url, decode_responses=True)
    try:
        return {queue: int(client.llen(queue)) for queue in CELERY_QUEUES}
    finally:
        client.close()


def get_queue_depths_blocking() -> dict[str, int]:
    return asyncio.run(get_queue_depths())
