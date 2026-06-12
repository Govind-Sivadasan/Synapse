"""DIMSE C-STORE / C-ECHO SCP listener using pynetdicom."""

import asyncio
from pathlib import Path

import structlog
from pynetdicom import AE, evt, AllStoragePresentationContexts
from pynetdicom.sop_class import Verification

from app.config import settings
from app.dimse.study_assembler import StudyAssembler

logger = structlog.get_logger()


class DIMSEListener:
    def __init__(self) -> None:
        self.ae_title = settings.dimse_ae_title
        self.port = settings.dimse_port
        self.promiscuous = settings.dimse_promiscuous_mode
        self.temp_path = Path(settings.temp_storage_path)
        self.temp_path.mkdir(parents=True, exist_ok=True)
        self.assembler = StudyAssembler(self.temp_path)
        self._ae: AE | None = None
        self._server = None

    def _handle_echo(self, event):
        return 0x0000

    def _handle_store(self, event):
        try:
            dataset = event.dataset
            dataset.file_meta = event.file_meta
            status = self.assembler.register_instance(dataset, event.assoc)
            return status
        except Exception as exc:
            logger.error("c_store_failed", error=str(exc))
            return 0xC001

    def _handle_released(self, event):
        try:
            calling_ae = event.assoc.requestor.ae_title.strip()
            if not self.promiscuous and calling_ae not in self._allowed_calling_aets():
                logger.warning("association_rejected_unknown_ae", calling_ae=calling_ae)
                return

            completed_studies = self.assembler.on_association_released(calling_ae)
            for study in completed_studies:
                from tasks.routing_tasks import route_study

                route_study.delay(
                    study_uid=study.study_uid,
                    dicom_files=[str(p) for p in study.instance_paths],
                    metadata=study.metadata,
                    calling_ae_title=calling_ae,
                )
                logger.info(
                    "routing_task_enqueued",
                    study_uid=study.study_uid,
                    instances=len(study.instance_paths),
                )
        except Exception as exc:
            logger.error("association_release_failed", error=str(exc))

    def _allowed_calling_aets(self) -> set[str]:
        # Populated from nodes table in future; permissive in promiscuous mode
        return {"ORTHANC_ONPREM", "STORESCU", "MODALITY"}

    def _run_server(self):
        self._ae = AE(ae_title=self.ae_title)
        self._ae.supported_contexts = AllStoragePresentationContexts
        self._ae.add_supported_context(Verification)

        handlers = [
            (evt.EVT_C_STORE, self._handle_store),
            (evt.EVT_C_ECHO, self._handle_echo),
            (evt.EVT_RELEASED, self._handle_released),
        ]
        self._server = self._ae.start_server(("0.0.0.0", self.port), block=True, evt_handlers=handlers)

    async def start(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._run_server)

    async def stop(self) -> None:
        if self._server:
            self._server.shutdown()
