"""Celery tasks for real-time DICOM routing."""

import time
import uuid

import structlog

from app.database import run_async_task
from app.observability.metrics import track_task_outcome
from celery_app import celery_app

logger = structlog.get_logger()


async def _route_study(
    study_uid: str,
    dicom_files: list[str],
    metadata: dict[str, str],
    calling_ae_title: str,
) -> dict:
    from app.routing.engine import RoutingEngine

    engine = RoutingEngine()
    result = await engine.route_study(
        study_uid=study_uid,
        dicom_files=dicom_files,
        metadata=metadata,
        calling_ae_title=calling_ae_title,
    )
    return {
        "transaction_id": str(result.transaction_id),
        "study_uid": result.study_uid,
        "overall_status": result.overall_status,
        "overall_success": result.overall_success,
        "destinations": [
            {
                "id": str(d.destination_id),
                "node_name": d.node_name,
                "status": d.status,
                "failure_reason": d.failure_reason,
            }
            for d in result.per_destination_statuses
        ],
    }


async def _retry_destination(destination_record_id: str) -> dict:
    from app.routing.engine import RoutingEngine

    engine = RoutingEngine()
    result = await engine.retry_destination(uuid.UUID(destination_record_id))
    return {
        "destination_id": str(result.destination_id),
        "node_name": result.node_name,
        "status": result.status,
        "failure_reason": result.failure_reason,
    }


@celery_app.task(name="tasks.routing_tasks.route_study", bind=True, max_retries=3)
def route_study(
    self,
    study_uid: str,
    dicom_files: list[str],
    metadata: dict[str, str],
    calling_ae_title: str = "",
) -> dict:
    """Evaluate routing rules, apply tag morphing, and upload via STOW-RS."""
    logger.info(
        "route_study_started",
        study_uid=study_uid,
        instances=len(dicom_files),
        calling_ae=calling_ae_title,
    )
    started = time.perf_counter()
    try:
        result = run_async_task(
            _route_study(study_uid, dicom_files, metadata, calling_ae_title)
        )
        track_task_outcome(
            "routing_queue",
            "route_study",
            time.perf_counter() - started,
            success=True,
            retries=self.request.retries,
        )
        return result
    except Exception as exc:
        track_task_outcome(
            "routing_queue",
            "route_study",
            time.perf_counter() - started,
            success=False,
            retries=self.request.retries,
        )
        logger.error("route_study_failed", study_uid=study_uid, error=str(exc))
        raise self.retry(exc=exc, countdown=2**self.request.retries)


@celery_app.task(name="tasks.routing_tasks.upload_to_destination", bind=True, max_retries=3)
def upload_to_destination(
    self,
    destination_record_id: str,
) -> dict:
    """Retry STOW-RS upload for a single failed destination."""
    logger.info("upload_to_destination_retry", destination_id=destination_record_id)
    started = time.perf_counter()
    try:
        result = run_async_task(_retry_destination(destination_record_id))
        track_task_outcome(
            "routing_queue",
            "upload_to_destination",
            time.perf_counter() - started,
            success=True,
            retries=self.request.retries,
        )
        return result
    except Exception as exc:
        track_task_outcome(
            "routing_queue",
            "upload_to_destination",
            time.perf_counter() - started,
            success=False,
            retries=self.request.retries,
        )
        logger.error("upload_to_destination_failed", error=str(exc))
        raise self.retry(exc=exc, countdown=2**self.request.retries)
