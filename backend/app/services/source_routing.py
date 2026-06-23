"""Pull studies from a source PACS via WADO-RS and route through Synapse rules."""

import shutil
import uuid
from pathlib import Path

import pydicom
import structlog

from app.config import settings
from app.database import async_session_factory
from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.wado_rs import WadoRsError, retrieve_study_instances
from app.models.node import Node
from app.routing.engine import RoutingEngine

logger = structlog.get_logger()


def _extract_routing_metadata(sample_file: Path, study_uid: str) -> dict[str, str]:
    try:
        ds = pydicom.dcmread(sample_file, stop_before_pixels=True)
        return {
            "Modality": str(getattr(ds, "Modality", "") or ""),
            "PatientID": str(getattr(ds, "PatientID", "") or ""),
            "StudyInstanceUID": str(getattr(ds, "StudyInstanceUID", study_uid) or study_uid),
            "AccessionNumber": str(getattr(ds, "AccessionNumber", "") or ""),
        }
    except Exception:
        return {
            "Modality": "",
            "PatientID": "",
            "StudyInstanceUID": study_uid,
            "AccessionNumber": "",
        }


async def pull_and_route_study(source_node_id: uuid.UUID, study_uid: str) -> dict:
    """WADO-RS retrieve from source node, then evaluate routing rules and STOW."""
    download_dir = Path(settings.temp_storage_path) / "source_pull" / str(source_node_id) / study_uid
    try:
        async with async_session_factory() as session:
            source = await session.get(Node, source_node_id)
            if not source or not source.is_active:
                raise ValueError("Source node not found or inactive")
            if not source.dicomweb_url:
                raise ValueError("Source node has no DICOMweb URL configured")

            auth = AuthHandler.from_node(source)
            calling_ae = (source.ae_title or "SOURCE_PULL").strip()

        file_paths = await retrieve_study_instances(
            source.dicomweb_url,
            study_uid,
            auth,
            download_dir,
        )
        if not file_paths:
            raise WadoRsError(f"No instances retrieved for study {study_uid}")

        metadata = _extract_routing_metadata(file_paths[0], study_uid)
        engine = RoutingEngine()
        result = await engine.route_study(
            study_uid=study_uid,
            dicom_files=[str(path) for path in file_paths],
            metadata=metadata,
            calling_ae_title=calling_ae,
            exclude_destination_node_ids={source_node_id},
        )
        return {
            "transaction_id": str(result.transaction_id),
            "study_uid": result.study_uid,
            "overall_status": result.overall_status,
            "overall_success": result.overall_success,
        }
    finally:
        if download_dir.exists():
            shutil.rmtree(download_dir, ignore_errors=True)
