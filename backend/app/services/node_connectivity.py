"""Connectivity checks for configured PACS nodes."""

import time

import httpx
import structlog
from pynetdicom import AE
from pynetdicom.sop_class import Verification

from app.config import settings
from app.dicomweb.auth_handler import AuthHandler
from app.models.node import Node

logger = structlog.get_logger()

ECHO_SUCCESS = 0x0000


def test_dimse_echo(
    host: str,
    port: int,
    called_ae: str,
    calling_ae: str | None = None,
    timeout: float = 10.0,
) -> tuple[bool, str, int | None, int]:
    """Send C-ECHO SCU to a remote DIMSE node."""
    caller = calling_ae or settings.dimse_ae_title
    started = time.perf_counter()
    ae = AE(ae_title=caller)
    ae.add_requested_context(Verification)
    ae.acse_timeout = timeout
    ae.dimse_timeout = timeout
    ae.network_timeout = timeout

    assoc = ae.associate(host, port, ae_title=called_ae)
    if not assoc.is_established:
        latency_ms = int((time.perf_counter() - started) * 1000)
        return (
            False,
            f"Association rejected ({caller} -> {called_ae}@{host}:{port})",
            None,
            latency_ms,
        )

    try:
        status = assoc.send_c_echo()
    finally:
        assoc.release()

    latency_ms = int((time.perf_counter() - started) * 1000)
    if status and status.Status == ECHO_SUCCESS:
        return True, f"C-ECHO successful ({caller} -> {called_ae}@{host}:{port})", ECHO_SUCCESS, latency_ms

    code = getattr(status, "Status", None)
    return False, f"C-ECHO failed with status 0x{code:04X}" if code is not None else "C-ECHO failed", code, latency_ms


async def test_dicomweb_echo(
    dicomweb_url: str,
    auth: AuthHandler,
    timeout: float = 10.0,
) -> tuple[bool, str, int | None, int]:
    """Probe a DICOMweb endpoint with a lightweight QIDO-RS request."""
    base_url = dicomweb_url.rstrip("/")
    url = f"{base_url}/studies"
    headers = {"Accept": "application/dicom+json", **auth.get_headers()}
    started = time.perf_counter()

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(url, headers=headers, params={"limit": 1})

    latency_ms = int((time.perf_counter() - started) * 1000)
    if response.status_code < 400:
        return (
            True,
            f"DICOMweb reachable ({url}, HTTP {response.status_code})",
            response.status_code,
            latency_ms,
        )

    detail = response.text[:200].strip() or f"HTTP {response.status_code}"
    return False, f"DICOMweb probe failed: {detail}", response.status_code, latency_ms


async def probe_node_connectivity(node: Node) -> dict:
    """Run the appropriate connectivity check for a node's protocol."""
    if node.protocol == "DIMSE":
        if not node.port:
            return {
                "success": False,
                "protocol": node.protocol,
                "message": "DIMSE node requires a port for C-ECHO",
                "status_code": None,
                "latency_ms": None,
            }
        if not node.ae_title:
            return {
                "success": False,
                "protocol": node.protocol,
                "message": "DIMSE node requires an AE Title for C-ECHO",
                "status_code": None,
                "latency_ms": None,
            }

        import asyncio

        success, message, status_code, latency_ms = await asyncio.to_thread(
            test_dimse_echo,
            node.host,
            node.port,
            node.ae_title,
        )
        logger.info(
            "node_echo_dimse",
            node_id=str(node.id),
            node_name=node.name,
            success=success,
            latency_ms=latency_ms,
        )
        return {
            "success": success,
            "protocol": node.protocol,
            "message": message,
            "status_code": status_code,
            "latency_ms": latency_ms,
        }

    if node.protocol == "DICOMweb":
        if not node.dicomweb_url:
            return {
                "success": False,
                "protocol": node.protocol,
                "message": "DICOMweb node requires a DICOMweb URL",
                "status_code": None,
                "latency_ms": None,
            }

        auth = AuthHandler.from_node(node)
        success, message, status_code, latency_ms = await test_dicomweb_echo(node.dicomweb_url, auth)
        logger.info(
            "node_echo_dicomweb",
            node_id=str(node.id),
            node_name=node.name,
            success=success,
            latency_ms=latency_ms,
        )
        return {
            "success": success,
            "protocol": node.protocol,
            "message": message,
            "status_code": status_code,
            "latency_ms": latency_ms,
        }

    return {
        "success": False,
        "protocol": node.protocol,
        "message": f"Unsupported protocol: {node.protocol}",
        "status_code": None,
        "latency_ms": None,
    }
