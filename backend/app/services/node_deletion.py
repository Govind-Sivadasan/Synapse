"""Node deletion guards and safe reference cleanup."""

from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.migration import MigrationJob
from app.models.routing import RoutingDestination, RoutingRule, RoutingTransaction


async def get_node_deletion_blockers(db: AsyncSession, node_id: UUID) -> list[str]:
    """Return human-readable reasons why a node cannot be deleted yet."""
    reasons: list[str] = []

    job_names = list(
        (
            await db.execute(
                select(MigrationJob.name)
                .where(
                    or_(
                        MigrationJob.source_node_id == node_id,
                        MigrationJob.destination_node_id == node_id,
                    )
                )
                .order_by(MigrationJob.name)
                .limit(5)
            )
        ).scalars()
    )
    if job_names:
        total_jobs = await db.scalar(
            select(func.count())
            .select_from(MigrationJob)
            .where(
                or_(
                    MigrationJob.source_node_id == node_id,
                    MigrationJob.destination_node_id == node_id,
                )
            )
        )
        suffix = f" (+{(total_jobs or 0) - len(job_names)} more)" if (total_jobs or 0) > len(job_names) else ""
        reasons.append(
            "Referenced by migration job(s): "
            f"{', '.join(job_names)}{suffix}. Delete those jobs first."
        )

    routing_dest_count = await db.scalar(
        select(func.count())
        .select_from(RoutingDestination)
        .where(RoutingDestination.destination_node_id == node_id)
    )
    if routing_dest_count:
        reasons.append(
            f"Referenced by {routing_dest_count} routing history record(s). "
            "Nodes used in completed routing cannot be deleted."
        )

    return reasons


async def prepare_node_deletion(db: AsyncSession, node_id: UUID) -> bool:
    """Detach soft references so delete can proceed when blockers are clear.

    Returns True when routing rules were modified.
    """
    rules_changed = False
    rules = list((await db.execute(select(RoutingRule))).scalars())
    for rule in rules:
        dest_ids = list(rule.destination_node_ids or [])
        if node_id not in dest_ids:
            continue
        rule.destination_node_ids = [dest_id for dest_id in dest_ids if dest_id != node_id]
        if not rule.destination_node_ids:
            rule.is_active = False
        rules_changed = True

    await db.execute(
        update(RoutingTransaction)
        .where(RoutingTransaction.source_node_id == node_id)
        .values(source_node_id=None)
    )
    return rules_changed
