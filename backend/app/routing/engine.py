"""Central routing coordinator: rules → morphing → STOW-RS."""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.dicomweb.auth_handler import AuthHandler
from app.dicomweb.client import DICOMwebClient, StowRsUploadError
from app.models.node import Node
from app.models.routing import RoutingDestination, RoutingRule, RoutingTransaction
from app.models.tag_morphing import TagMorphingRule
from app.morphing.tag_morpher import TagMorpher, TagMorphingAuditRecord
from app.observability.metrics import inc_counter, timed_phase
from app.routing.rule_evaluator import DestinationPlan, RoutingRuleEvaluator
from app.services.audit_logger import AuditLogger
from app.services.event_publisher import publish_event

logger = structlog.get_logger()

_rule_evaluator = RoutingRuleEvaluator()


@dataclass
class DestinationStatus:
    destination_id: uuid.UUID
    destination_node_id: uuid.UUID
    node_name: str
    status: str
    failure_reason: str | None = None


@dataclass
class RoutingTransactionResult:
    transaction_id: uuid.UUID
    study_uid: str
    overall_status: str
    per_destination_statuses: list[DestinationStatus] = field(default_factory=list)
    overall_success: bool = False
    matched_rule_id: uuid.UUID | None = None


class RoutingEngine:
    def __init__(self) -> None:
        self.rule_evaluator = _rule_evaluator
        self.tag_morpher = TagMorpher()
        self.dicomweb_client = DICOMwebClient()

    async def route_study(
        self,
        study_uid: str,
        dicom_files: list[str],
        metadata: dict[str, str],
        calling_ae_title: str = "",
    ) -> RoutingTransactionResult:
        file_paths = [Path(p) for p in dicom_files]
        morph_cleanup_dirs: list[Path] = []
        transaction_id: uuid.UUID
        primary_rule_id: uuid.UUID | None = None
        dest_statuses: list[DestinationStatus] = []
        overall_status = "failed"

        with timed_phase("routing", "evaluate", study_uid=study_uid):
            async with async_session_factory() as session:
                transaction = await self._create_transaction(
                    session, study_uid, metadata, file_paths, calling_ae_title
                )
                transaction_id = transaction.id

                matches = await self.rule_evaluator.evaluate(metadata, session)

                if not matches:
                    transaction.overall_status = "no_match"
                    transaction.completed_at = datetime.now(timezone.utc)
                    await AuditLogger.log(
                        session,
                        "ROUTING_RULE_MATCH",
                        entity_type="RoutingTransaction",
                        entity_id=transaction_id,
                        details={"study_uid": study_uid, "matched": False},
                    )
                    await session.commit()
                    self._publish_status(transaction, [])
                    inc_counter("synapse_routing_studies_total", {"status": "no_match"})
                    return RoutingTransactionResult(
                        transaction_id=transaction_id,
                        study_uid=study_uid,
                        overall_status="no_match",
                    )

                primary_rule = matches[0]
                primary_rule_id = primary_rule.routing_rule_id
                transaction.routing_rule_id = primary_rule_id
                destination_plans = self.rule_evaluator.resolve_destinations(matches)

                await AuditLogger.log(
                    session,
                    "ROUTING_RULE_MATCH",
                    entity_type="RoutingTransaction",
                    entity_id=transaction_id,
                    details={
                        "study_uid": study_uid,
                        "matched": True,
                        "rules": [m.rule_name for m in matches],
                        "destinations": [str(p.destination_node_id) for p in destination_plans],
                    },
                )

                upload_jobs: list[tuple[RoutingDestination, Node, list[Path], str]] = []

                for plan in destination_plans:
                    dest_record, node = await self._create_destination_record(session, transaction_id, plan)
                    morphed_paths, morph_audit, morph_dir = await self._prepare_morphed_files(
                        session, file_paths, plan, metadata
                    )
                    if morph_dir:
                        morph_cleanup_dirs.append(morph_dir)

                    if morph_audit.changes:
                        await AuditLogger.log(
                            session,
                            "TAG_MORPHING_APPLIED",
                            entity_type="RoutingDestination",
                            entity_id=dest_record.id,
                            details={
                                "study_uid": study_uid,
                                "destination": node.name,
                                "changes": [
                                    {"tag": c.tag, "original": c.original_value, "new": c.new_value}
                                    for c in morph_audit.changes
                                ],
                            },
                        )

                    upload_jobs.append((dest_record, node, morphed_paths, study_uid))

                await session.commit()

        with timed_phase("routing", "stow", study_uid=study_uid):
            upload_results = await self._run_uploads(upload_jobs)

        with timed_phase("routing", "db_finalize", study_uid=study_uid):
            async with async_session_factory() as session:
                transaction = await session.get(RoutingTransaction, transaction_id)
                success_count = 0

                for dest_record, node, status, error in upload_results:
                    db_dest = await session.get(RoutingDestination, dest_record.id)
                    db_dest.status = status
                    db_dest.failure_reason = error
                    db_dest.completed_at = datetime.now(timezone.utc)
                    if status == "success":
                        success_count += 1
                    dest_statuses.append(
                        DestinationStatus(
                            destination_id=db_dest.id,
                            destination_node_id=db_dest.destination_node_id,
                            node_name=node.name,
                            status=status,
                            failure_reason=error,
                        )
                    )

                if success_count == len(upload_results):
                    overall_status = "success"
                elif success_count > 0:
                    overall_status = "partial"
                else:
                    overall_status = "failed"

                transaction.overall_status = overall_status
                transaction.completed_at = datetime.now(timezone.utc)
                await session.commit()
                self._publish_status(transaction, dest_statuses)

        inc_counter("synapse_routing_studies_total", {"status": overall_status})

        for morph_dir in morph_cleanup_dirs:
            TagMorpher.cleanup_dir(morph_dir)

        return RoutingTransactionResult(
            transaction_id=transaction_id,
            study_uid=study_uid,
            overall_status=overall_status,
            per_destination_statuses=dest_statuses,
            overall_success=overall_status == "success",
            matched_rule_id=primary_rule_id,
        )

    async def retry_destination(self, destination_record_id: uuid.UUID) -> DestinationStatus:
        morph_dir: Path | None = None

        async with async_session_factory() as session:
            dest = await session.get(RoutingDestination, destination_record_id)
            if not dest:
                raise ValueError("Destination record not found")

            transaction = await session.get(RoutingTransaction, dest.transaction_id)
            node = await session.get(Node, dest.destination_node_id)
            if not node or not node.dicomweb_url:
                raise ValueError("Destination node not configured for DICOMweb")

            rule = (
                await session.get(RoutingRule, transaction.routing_rule_id)
                if transaction.routing_rule_id
                else None
            )
            morph_ids = list(rule.tag_morphing_rule_ids or []) if rule else []
            plan = DestinationPlan(
                destination_node_id=dest.destination_node_id,
                routing_rule_id=transaction.routing_rule_id or uuid.uuid4(),
                tag_morphing_rule_ids=morph_ids,
            )

            study_dir = Path(settings.temp_storage_path) / transaction.study_uid
            file_paths = [p for p in study_dir.glob("*.dcm") if p.is_file() and "morphed_" not in str(p)]
            if not file_paths:
                raise ValueError("Original DICOM files no longer available for retry")

            metadata = {
                "Modality": transaction.modality or "",
                "PatientID": transaction.patient_id or "",
                "AccessionNumber": transaction.accession_number or "",
            }

            morphed_paths, _, morph_dir = await self._prepare_morphed_files(
                session, file_paths, plan, metadata
            )
            dest.status = "retrying"
            dest.retry_count += 1
            node_name = node.name
            await session.commit()

        try:
            auth = AuthHandler.from_node(node)
            await self.dicomweb_client.stow_rs(morphed_paths, node.dicomweb_url, auth)
            status, error = "success", None
        except StowRsUploadError as exc:
            status, error = "failed", str(exc)
        finally:
            if morph_dir:
                TagMorpher.cleanup_dir(morph_dir)

        async with async_session_factory() as session:
            dest = await session.get(RoutingDestination, destination_record_id)
            dest.status = status
            dest.failure_reason = error
            dest.completed_at = datetime.now(timezone.utc)
            transaction = await session.get(RoutingTransaction, dest.transaction_id)
            await self._refresh_transaction_status(session, transaction)
            await AuditLogger.log(
                session,
                "RETRY_ATTEMPT",
                entity_type="RoutingDestination",
                entity_id=dest.id,
                details={"status": status, "retry_count": dest.retry_count},
            )
            await session.commit()

        return DestinationStatus(
            destination_id=destination_record_id,
            destination_node_id=dest.destination_node_id,
            node_name=node_name,
            status=status,
            failure_reason=error,
        )

    async def _create_transaction(
        self,
        session: AsyncSession,
        study_uid: str,
        metadata: dict[str, str],
        file_paths: list[Path],
        calling_ae_title: str,
    ) -> RoutingTransaction:
        txn = RoutingTransaction(
            id=uuid.uuid4(),
            study_uid=study_uid,
            patient_id=metadata.get("PatientID"),
            modality=metadata.get("Modality"),
            accession_number=metadata.get("AccessionNumber"),
            instances_count=len(file_paths),
            overall_status="pending",
        )
        session.add(txn)
        await session.flush()

        await AuditLogger.log(
            session,
            "STUDY_RECEPTION",
            entity_type="RoutingTransaction",
            entity_id=txn.id,
            details={
                "study_uid": study_uid,
                "calling_ae_title": calling_ae_title,
                "instances_count": len(file_paths),
            },
        )
        publish_event(
            "study_received",
            {
                "transaction_id": str(txn.id),
                "study_uid": study_uid,
                "modality": metadata.get("Modality"),
                "instances_count": len(file_paths),
                "status": "pending",
            },
        )
        return txn

    async def _create_destination_record(
        self,
        session: AsyncSession,
        transaction_id: uuid.UUID,
        plan: DestinationPlan,
    ) -> tuple[RoutingDestination, Node]:
        node = await session.get(Node, plan.destination_node_id)
        if not node or not node.is_active:
            raise ValueError(f"Destination node not found or inactive: {plan.destination_node_id}")
        if not node.dicomweb_url:
            raise ValueError(f"Destination node {node.name} has no DICOMweb URL")

        morph_id = plan.tag_morphing_rule_ids[0] if plan.tag_morphing_rule_ids else None
        dest = RoutingDestination(
            id=uuid.uuid4(),
            transaction_id=transaction_id,
            destination_node_id=plan.destination_node_id,
            morphing_rule_id=morph_id,
            status="pending",
        )
        session.add(dest)
        await session.flush()
        return dest, node

    async def _prepare_morphed_files(
        self,
        session: AsyncSession,
        file_paths: list[Path],
        plan: DestinationPlan,
        metadata: dict[str, str],
    ) -> tuple[list[Path], TagMorphingAuditRecord, Path | None]:
        if not plan.tag_morphing_rule_ids:
            return file_paths, TagMorphingAuditRecord(), None

        result = await session.execute(
            select(TagMorphingRule).where(
                TagMorphingRule.id.in_(plan.tag_morphing_rule_ids),
                TagMorphingRule.is_active.is_(True),
            )
        )
        rules = list(result.scalars().all())
        if not rules:
            return file_paths, TagMorphingAuditRecord(), None

        output_dir = file_paths[0].parent / f"morphed_{uuid.uuid4().hex[:8]}"
        morphed_paths, audit = self.tag_morpher.apply_to_files(
            file_paths, rules, metadata, output_dir=output_dir
        )
        return morphed_paths, audit, output_dir

    async def _run_uploads(
        self,
        jobs: list[tuple[RoutingDestination, Node, list[Path], str]],
    ) -> list[tuple[RoutingDestination, Node, str, str | None]]:
        async def do_upload(dest_record, node, file_paths, study_uid):
            try:
                auth = AuthHandler.from_node(node)
                await self.dicomweb_client.stow_rs(file_paths, node.dicomweb_url, auth)
                logger.info(
                    "routing_upload_success",
                    study_uid=study_uid,
                    destination=node.name,
                    instances=len(file_paths),
                )
                return dest_record, node, "success", None
            except StowRsUploadError as exc:
                logger.error(
                    "routing_upload_failed",
                    study_uid=study_uid,
                    destination=node.name,
                    error=str(exc),
                )
                return dest_record, node, "failed", str(exc)

        return await asyncio.gather(*[do_upload(*job) for job in jobs])

    async def _refresh_transaction_status(
        self, session: AsyncSession, transaction: RoutingTransaction
    ) -> None:
        result = await session.execute(
            select(RoutingDestination).where(RoutingDestination.transaction_id == transaction.id)
        )
        dests = list(result.scalars().all())
        success = sum(1 for d in dests if d.status == "success")
        failed = sum(1 for d in dests if d.status == "failed")
        if success == len(dests):
            transaction.overall_status = "success"
        elif success > 0 and failed > 0:
            transaction.overall_status = "partial"
        elif failed == len(dests):
            transaction.overall_status = "failed"
        transaction.completed_at = datetime.now(timezone.utc)

    def _publish_status(
        self, transaction: RoutingTransaction, dest_statuses: list[DestinationStatus]
    ) -> None:
        publish_event(
            "routing_completed",
            {
                "transaction_id": str(transaction.id),
                "study_uid": transaction.study_uid,
                "overall_status": transaction.overall_status,
                "destinations": [
                    {
                        "id": str(d.destination_id),
                        "node_name": d.node_name,
                        "status": d.status,
                        "failure_reason": d.failure_reason,
                    }
                    for d in dest_statuses
                ],
            },
        )


def invalidate_rules_cache() -> None:
    _rule_evaluator.invalidate_cache()
