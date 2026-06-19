"""Tests for DICOMweb HTTP connection pooling."""

import pytest

from app.dicomweb import http_pool


@pytest.fixture(autouse=True)
def reset_pool():
    http_pool._clients.clear()
    yield
    http_pool._clients.clear()


def test_pool_reuses_client_for_same_host():
    first = http_pool.get_dicomweb_client("http://orthanc:8042/dicom-web", 60.0)
    second = http_pool.get_dicomweb_client("http://orthanc:8042/dicom-web/studies", 60.0)
    assert first is second


def test_pool_separates_hosts():
    a = http_pool.get_dicomweb_client("http://orthanc-onprem:8042/dicom-web")
    b = http_pool.get_dicomweb_client("http://orthanc-cloud:8042/dicom-web")
    assert a is not b


@pytest.mark.asyncio
async def test_close_dicomweb_clients():
    client = http_pool.get_dicomweb_client("http://example:8042/dicom-web")
    assert not client.is_closed
    await http_pool.close_dicomweb_clients()
    assert client.is_closed
    assert http_pool._clients == {}
