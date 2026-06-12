"""Celery tasks for real-time DICOM routing."""

import structlog

from celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(name="tasks.routing_tasks.route_study", bind=True, max_retries=3)
def route_study(
    self,
    study_uid: str,
    dicom_files: list[str],
    metadata: dict[str, str],
    calling_ae_title: str = "",
) -> dict:
    """Route an assembled study to matched destinations via DICOMweb STOW-RS."""
    logger.info(
        "route_study_started",
        study_uid=study_uid,
        instances=len(dicom_files),
        calling_ae=calling_ae_title,
        metadata=metadata,
    )
    # Phase 3: integrate RoutingEngine.route_study()
    return {
        "study_uid": study_uid,
        "status": "queued",
        "message": "Routing engine integration pending (Phase 3)",
    }


@celery_app.task(name="tasks.routing_tasks.upload_to_destination", bind=True, max_retries=3)
def upload_to_destination(
    self,
    transaction_id: str,
    destination_id: str,
    dicom_files: list[str],
) -> dict:
    """Upload study to a single destination with independent retry."""
    logger.info("upload_to_destination", transaction_id=transaction_id, destination_id=destination_id)
    return {"status": "pending", "destination_id": destination_id}
