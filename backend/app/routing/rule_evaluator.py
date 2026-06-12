"""Routing rule evaluation with in-memory TTL cache."""

import time
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.routing import RoutingRule
from app.services.rule_evaluator import evaluate_condition


@dataclass
class MatchResult:
    routing_rule_id: UUID
    rule_name: str
    destination_node_ids: list[UUID]
    tag_morphing_rule_ids: list[UUID]
    priority: int


@dataclass
class DestinationPlan:
    destination_node_id: UUID
    routing_rule_id: UUID
    tag_morphing_rule_ids: list[UUID]


class RoutingRuleEvaluator:
    CACHE_TTL_SECONDS = 60

    def __init__(self) -> None:
        self._cache: list[RoutingRule] | None = None
        self._cache_time: float = 0

    def invalidate_cache(self) -> None:
        self._cache = None
        self._cache_time = 0

    async def _load_rules(self, session: AsyncSession) -> list[RoutingRule]:
        now = time.monotonic()
        if self._cache is not None and (now - self._cache_time) < self.CACHE_TTL_SECONDS:
            return self._cache

        result = await session.execute(
            select(RoutingRule)
            .where(RoutingRule.is_active.is_(True))
            .order_by(RoutingRule.priority, RoutingRule.name)
        )
        self._cache = list(result.scalars().all())
        self._cache_time = now
        return self._cache

    async def evaluate(self, metadata: dict[str, str], session: AsyncSession) -> list[MatchResult]:
        rules = await self._load_rules(session)
        matches: list[MatchResult] = []

        for rule in rules:
            if evaluate_condition(
                metadata,
                rule.condition_tag,
                rule.condition_operator,
                rule.condition_value,
            ):
                matches.append(
                    MatchResult(
                        routing_rule_id=rule.id,
                        rule_name=rule.name,
                        destination_node_ids=list(rule.destination_node_ids or []),
                        tag_morphing_rule_ids=list(rule.tag_morphing_rule_ids or []),
                        priority=rule.priority,
                    )
                )
        return matches

    @staticmethod
    def resolve_destinations(matches: list[MatchResult]) -> list[DestinationPlan]:
        """Deduplicate destinations; first match by priority wins."""
        seen: dict[UUID, DestinationPlan] = {}
        for match in sorted(matches, key=lambda m: m.priority):
            for dest_id in match.destination_node_ids:
                if dest_id not in seen:
                    seen[dest_id] = DestinationPlan(
                        destination_node_id=dest_id,
                        routing_rule_id=match.routing_rule_id,
                        tag_morphing_rule_ids=match.tag_morphing_rule_ids,
                    )
        return list(seen.values())
