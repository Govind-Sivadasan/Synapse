"""Tests for DIMSE listener hot-reload helpers."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.dimse import listener as listener_module


@pytest.mark.asyncio
async def test_reload_dimse_listener_uses_bound_instance(monkeypatch):
    mock_listener = MagicMock()
    mock_listener.reload = AsyncMock()
    listener_module.bind_dimse_listener(mock_listener)

    runtime = MagicMock()
    runtime.listening = True
    runtime.ae_title = "NEW_AE"
    runtime.port = 11112
    monkeypatch.setattr(listener_module, "get_dimse_runtime", lambda: runtime)
    monkeypatch.setattr(
        listener_module,
        "get_runtime_config",
        lambda: {"dimse_ae_title": "NEW_AE", "dimse_port": 11112},
    )

    result = await listener_module.reload_dimse_listener()

    mock_listener.reload.assert_awaited_once()
    assert result["active_ae_title"] == "NEW_AE"
    assert result["active_port"] == 11112


@pytest.mark.asyncio
async def test_reload_dimse_listener_raises_when_not_listening(monkeypatch):
    mock_listener = MagicMock()
    mock_listener.reload = AsyncMock()
    listener_module.bind_dimse_listener(mock_listener)

    runtime = MagicMock()
    runtime.listening = False
    runtime.ae_title = ""
    runtime.port = 0
    monkeypatch.setattr(listener_module, "get_dimse_runtime", lambda: runtime)

    with pytest.raises(RuntimeError, match="failed to start"):
        await listener_module.reload_dimse_listener()
