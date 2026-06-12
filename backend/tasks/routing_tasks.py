"""Celery tasks for real-time DICOM routing."""

import asyncio
import uuid

import structlog

from celery_app import celery_app

logger = structlog.get_logger()


async def _record_study_reception(
    study_uid: str,
    dicom_files: list[str],
    metadata: dict[str, str],
    calling_ae_title: str,
) -> dict:
    from app.database import async_session_factory
    from app.models.routing import RoutingTransaction
    from app.services.audit_logger import AuditLogger
    from app.services.event_publisher import publish_event

    transaction_id = uuid.uuid4()
    async with async_session_factory() as session:
        transaction = RoutingTransaction(
            id=transaction_id,
            study_uid=study_uid,
            patient_id=metadata.get("PatientID"),
            modality=metadata.get("Modality"),
            accession_number=metadata.get("AccessionNumber"),
            instances_count=len(dicom_files),
            overall_status="pending",
        )
        session.add(transaction)
        await AuditLogger.log(
            session,
            "STUDY_RECEPTION",
            entity_type="RoutingTransaction",
            entity_id=transaction_id,
            details={
                "study_uid": study_uid,
                "calling_ae_title": calling_ae_title,
                "instances_count": len(dicom_files),
                "metadata": metadata,
            },
        )
        await session.commit()

    publish_event(
        "study_received",
        {
            "transaction_id": str(transaction_id),
            "study_uid": study_uid,
            "modality": metadata.get("Modality"),
            "instances_count": len(dicom_files),
            "calling_ae_title": calling_ae_title,
            "status": "pending",
        },
    )
    return {
        "transaction_id": str(transaction_id),
        "study_uid": study_uid,
        "status": "pending",
    }


@celery_app.task(name="tasks.routing_tasks.route_study", bind=True, max_retries=3)
def route_study(
    self,
    study_uid: str,
    dicom_files: list[str],
    metadata: dict[str, str],
    calling_ae_title: str = "",
) -> dict:
    """Record study reception and queue routing (Phase 3 will evaluate rules + STOW-RS)."""
    logger.info(
        "route_study_started",
        study_uid=study_uid,
        instances=len(dicom_files),
        calling_ae=calling_ae_title,
    )
    result = asyncio.run(
        _record_study_reception(study_uid, dicom_files, metadata, calling_ae_title)
    )
    # Phase 3: invoke RoutingEngine.route_study() here
    result["message"] = "Study recorded; routing engine integration pending (Phase 3)"
    return result


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
