"""Unit tests for routing rule evaluation and destination resolution."""

import uuid
from unittest.mock import MagicMock

from app.routing.rule_evaluator import MatchResult, RoutingRuleEvaluator


def test_resolve_destinations_deduplicates_by_priority():
    dest_a = uuid.uuid4()
    dest_b = uuid.uuid4()
    matches = [
        MatchResult(
            routing_rule_id=uuid.uuid4(),
            rule_name="High priority MR",
            destination_node_ids=[dest_b],
            tag_morphing_rule_ids=[],
            priority=10,
        ),
        MatchResult(
            routing_rule_id=uuid.uuid4(),
            rule_name="Lower priority CT",
            destination_node_ids=[dest_a, dest_b],
            tag_morphing_rule_ids=[],
            priority=50,
        ),
    ]
    plans = RoutingRuleEvaluator.resolve_destinations(matches)
    assert len(plans) == 2
    plan_by_dest = {p.destination_node_id: p for p in plans}
    assert dest_b in plan_by_dest
    assert dest_a in plan_by_dest
    # dest_b should come from higher priority (priority=10) rule
    assert plan_by_dest[dest_b].routing_rule_id == matches[0].routing_rule_id


def test_evaluate_condition_integration():
    evaluator = RoutingRuleEvaluator()
    rule = MagicMock()
    rule.id = uuid.uuid4()
    rule.name = "CT Rule"
    rule.condition_tag = "Modality"
    rule.condition_operator = "equals"
    rule.condition_value = "CT"
    rule.destination_node_ids = [uuid.uuid4()]
    rule.tag_morphing_rule_ids = []
    rule.priority = 10
    rule.is_active = True

    evaluator._cache = [rule]
    evaluator._cache_time = __import__("time").monotonic()

    import asyncio
    from unittest.mock import AsyncMock

    session = AsyncMock()
    matches = asyncio.run(evaluator.evaluate({"Modality": "CT"}, session))
    assert len(matches) == 1
    assert matches[0].rule_name == "CT Rule"
