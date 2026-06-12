"""Redis pub/sub for routing rules cache invalidation."""

import redis.asyncio as aioredis

from app.config import settings

RULES_INVALIDATE_CHANNEL = "synapse:rules:invalidate"


async def invalidate_routing_rules_cache() -> None:
    client = aioredis.from_url(settings.redis_url)
    try:
        await client.publish(RULES_INVALIDATE_CHANNEL, "invalidate")
    finally:
        await client.aclose()
