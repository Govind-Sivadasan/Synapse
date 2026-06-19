"""Tests for per-destination STOW rate limiting."""

from unittest.mock import patch

import pytest

from app.services import stow_rate_limiter


def test_normalize_destination_url():
    assert (
        stow_rate_limiter.normalize_destination_url("HTTP://Orthanc-Cloud:8042/dicom-web/")
        == "http://orthanc-cloud:8042/dicom-web"
    )


def test_destination_label_uses_hostname():
    assert stow_rate_limiter.destination_label("http://orthanc-cloud:8042/dicom-web") == "orthanc-cloud"


@pytest.mark.asyncio
async def test_wait_skipped_when_disabled():
    with patch("app.services.stow_rate_limiter.settings.stow_rate_limit_enabled", False):
        with patch("app.services.stow_rate_limiter._acquire_token") as mock_acquire:
            await stow_rate_limiter.wait_for_stow_rate_limit("http://example/dicom-web")
    mock_acquire.assert_not_called()


@pytest.mark.asyncio
async def test_wait_acquires_immediately():
    with patch("app.services.stow_rate_limiter.settings.stow_rate_limit_enabled", True):
        with patch("app.services.stow_rate_limiter._acquire_token", return_value=0.0) as mock_acquire:
            await stow_rate_limiter.wait_for_stow_rate_limit("http://example/dicom-web")
    mock_acquire.assert_called_once()


@pytest.mark.asyncio
async def test_wait_retries_until_token_available(monkeypatch):
    waits = iter([0.2, 0.0])

    async def fake_sleep(seconds: float) -> None:
        fake_sleep.total += seconds

    fake_sleep.total = 0.0

    with patch("app.services.stow_rate_limiter.settings.stow_rate_limit_enabled", True):
        with patch("app.services.stow_rate_limiter._acquire_token", side_effect=lambda _: next(waits)):
            with patch("app.services.stow_rate_limiter.asyncio.sleep", fake_sleep):
                with patch("app.services.stow_rate_limiter.inc_counter") as mock_counter:
                    await stow_rate_limiter.wait_for_stow_rate_limit("http://example/dicom-web")

    assert fake_sleep.total > 0
    mock_counter.assert_called_once()
