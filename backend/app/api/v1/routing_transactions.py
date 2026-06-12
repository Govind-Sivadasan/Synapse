"""Routing transaction history API."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.models.node import Node
from app.models.routing import RoutingDestination, RoutingTransaction
from app.routing.engine import RoutingEngine

router = APIRouter(prefix="/routing-transactions", tags=["Routing Transactions"])


@router.get("")
async def list_routing_transactions(
    study_uid: str | None = None,
    status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("service_user", "operator", "admin")),
) -> dict:
    query = select(RoutingTransaction)
    count_query = select(func.count()).select_from(RoutingTransaction)

    if study_uid:
        query = query.where(RoutingTransaction.study_uid == study_uid)
        count_query = count_query.where(RoutingTransaction.study_uid == study_uid)
    if status:
        query = query.where(RoutingTransaction.overall_status == status)
        count_query = count_query.where(RoutingTransaction.overall_status == status)
    if date_from:
        query = query.where(RoutingTransaction.received_at >= date_from)
        count_query = count_query.where(RoutingTransaction.received_at >= date_from)
    if date_to:
        query = query.where(RoutingTransaction.received_at <= date_to)
        count_query = count_query.where(RoutingTransaction.received_at <= date_to)

    total = await db.scalar(count_query) or 0
    result = await db.execute(
        query.order_by(RoutingTransaction.received_at.desc()).limit(limit).offset(offset)
    )
    transactions = list(result.scalars().all())

    items = []
    for txn in transactions:
        dest_result = await db.execute(
            select(RoutingDestination).where(RoutingDestination.transaction_id == txn.id)
        )
        destinations = list(dest_result.scalars().all())
        dest_items = []
        for d in destinations:
            node = await db.get(Node, d.destination_node_id)
            dest_items.append(
                {
                    "id": str(d.id),
                    "destination_node_id": str(d.destination_node_id),
                    "destination_name": node.name if node else None,
                    "status": d.status,
                    "retry_count": d.retry_count,
                    "failure_reason": d.failure_reason,
                }
            )
        items.append(
            {
                "id": str(txn.id),
                "study_uid": txn.study_uid,
                "patient_id": txn.patient_id,
                "modality": txn.modality,
                "accession_number": txn.accession_number,
                "instances_count": txn.instances_count,
                "overall_status": txn.overall_status,
                "received_at": txn.received_at.isoformat() if txn.received_at else None,
                "completed_at": txn.completed_at.isoformat() if txn.completed_at else None,
                "destinations": dest_items,
            }
        )

    return {"total": total, "items": items}


@router.post("/destinations/{destination_id}/retry")
async def retry_destination_upload(
    destination_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("operator", "admin")),
) -> dict:
    dest = await db.get(RoutingDestination, destination_id)
    if not dest:
        raise HTTPException(status_code=404, detail="Destination record not found")
    if dest.status not in ("failed", "retrying"):
        raise HTTPException(status_code=400, detail="Only failed destinations can be retried")

    # Run synchronously for immediate API feedback in dev; production can use .delay()
    try:
        engine = RoutingEngine()
        result = await engine.retry_destination(destination_id)
        return {
            "destination_id": str(result.destination_id),
            "node_name": result.node_name,
            "status": result.status,
            "failure_reason": result.failure_reason,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
