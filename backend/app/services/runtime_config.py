"""In-memory runtime config overrides, merged with env defaults."""

from app.services.system_config import default_settings

_runtime_overrides: dict = {}


def get_runtime_config() -> dict:
    merged = default_settings()
    merged.update(_runtime_overrides)
    return merged


def set_runtime_overrides(updates: dict) -> None:
    _runtime_overrides.update(updates)


def clear_runtime_overrides() -> None:
    _runtime_overrides.clear()
