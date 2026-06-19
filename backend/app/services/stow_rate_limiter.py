"""Per-destination STOW rate limiting (Phase 4.5)."""

from __future__ import annotations

import asyncio
import hashlib
import time
from urllib.parse import urlparse

import redis
import structlog

from app.config import settings
from app.observability.metrics import inc_counter

logger = structlog.get_logger()

_redis_client: redis.Redis | None = None

# Token bucket: returns seconds to wait (0 = token acquired).
_BUCKET_SCRIPT = """
local tokens_key = KEYS[1]
local ts_key = KEYS[2]
local rate = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local tokens = tonumber(redis.call('GET', tokens_key))
local last = tonumber(redis.call('GET', ts_key))
if tokens == nil then
  tokens = burst
  last = now
end

local elapsed = math.max(0, now - last)
tokens = math.min(burst, tokens + elapsed * rate)
last = now

if tokens >= cost then
  tokens = tokens - cost
  redis.call('SET', tokens_key, tokens)
  redis.call('SET', ts_key, last)
  redis.call('EXPIRE', tokens_key, 7200)
  redis.call('EXPIRE', ts_key, 7200)
  return 0
end

redis.call('SET', tokens_key, tokens)
redis.call('SET', ts_key, last)
redis.call('EXPIRE', tokens_key, 7200)
redis.call('EXPIRE', ts_key, 7200)
return (cost - tokens) / rate
"""

_bucket_script: redis.client.Script | None = None


def _redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _get_bucket_script() -> redis.client.Script:
    global _bucket_script
    if _bucket_script is None:
        _bucket_script = _redis().register_script(_BUCKET_SCRIPT)
    return _bucket_script


def normalize_destination_url(dicomweb_url: str) -> str:
    parsed = urlparse(dicomweb_url.strip())
    path = parsed.path.rstrip("/") or ""
    return f"{parsed.scheme}://{parsed.netloc.lower()}{path}"


def destination_label(dicomweb_url: str) -> str:
    parsed = urlparse(dicomweb_url.strip())
    return parsed.hostname or "unknown"


def destination_bucket_keys(dicomweb_url: str) -> tuple[str, str]:
    digest = hashlib.sha256(normalize_destination_url(dicomweb_url).encode()).hexdigest()[:16]
    base = f"stow:bucket:{digest}"
    return f"{base}:tokens", f"{base}:ts"


def _acquire_token(dicomweb_url: str) -> float:
    """Try to take one STOW token. Returns 0 if acquired, else seconds to wait."""
    rate = settings.stow_destination_rate_per_second
    burst = settings.stow_destination_rate_burst
    if rate <= 0 or burst <= 0:
        return 0.0

    tokens_key, ts_key = destination_bucket_keys(dicomweb_url)
    wait = _get_bucket_script()(
        keys=[tokens_key, ts_key],
        args=[rate, burst, time.monotonic(), 1],
    )
    return float(wait or 0)


async def wait_for_stow_rate_limit(dicomweb_url: str) -> None:
    """Block until a STOW upload token is available for this destination."""
    if not settings.stow_rate_limit_enabled:
        return

    label = destination_label(dicomweb_url)
    poll = max(0.01, settings.stow_rate_limit_poll_seconds)
    total_wait = 0.0
    logged = False

    while True:
        wait_seconds = await asyncio.to_thread(_acquire_token, dicomweb_url)
        if wait_seconds <= 0:
            if total_wait > 0:
                logger.info(
                    "stow_rate_limit_release",
                    destination=label,
                    waited_seconds=round(total_wait, 2),
                )
            return

        if not logged:
            logger.warning(
                "stow_rate_limit_wait",
                destination=label,
                wait_seconds=round(wait_seconds, 2),
            )
            inc_counter("synapse_stow_rate_limit_waits_total", {"destination": label})
            logged = True

        sleep_for = min(max(wait_seconds, poll), 1.0)
        await asyncio.sleep(sleep_for)
        total_wait += sleep_for
