"""Conditional routing rules API."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.models.node import Node
from app.models.routing import RoutingRule
from app.models.tag_morphing import TagMorphingRule
from app.schemas.routing_rule import (
    VALID_OPERATORS,
    VALID_TAGS,
    RoutingRuleCreate,
    RoutingRuleResponse,
    RoutingRuleUpdate,
    RulePreviewRequest,
    RulePreviewResponse,
)
from app.services.audit_logger import AuditLogger
from app.services.rule_evaluator import evaluate_condition
from app.services.rules_cache import invalidate_routing_rules_cache

router = APIRouter(prefix="/routing-rules", tags=["Routing Rules"])


async def _validate_rule_payload(db: AsyncSession, payload: RoutingRuleCreate | RoutingRuleUpdate, is_create: bool):
    data = payload.model_dump(exclude_unset=not is_create)
    if is_create:
        data = payload.model_dump()

    if "condition_tag" in data and data["condition_tag"] not in VALID_TAGS:
        raise HTTPException(status_code=400, detail=f"Invalid condition_tag. Allowed: {sorted(VALID_TAGS)}")

    if "condition_operator" in data and data["condition_operator"] not in VALID_OPERATORS:
        raise HTTPException(status_code=400, detail=f"Invalid operator. Allowed: {sorted(VALID_OPERATORS)}")

    dest_ids = data.get("destination_node_ids")
    if dest_ids is not None:
        for node_id in dest_ids:
            node = await db.get(Node, node_id)
            if not node or node.node_type != "destination":
                raise HTTPException(status_code=400, detail=f"Invalid destination node: {node_id}")

    morph_ids = data.get("tag_morphing_rule_ids")
    if morph_ids:
        for rule_id in morph_ids:
            if await db.get(TagMorphingRule, rule_id) is None:
                raise HTTPException(status_code=400, detail=f"Invalid morphing rule: {rule_id}")


@router.get("", response_model=list[RoutingRuleResponse])
async def list_routing_rules(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> list[RoutingRule]:
    result = await db.execute(select(RoutingRule).order_by(RoutingRule.priority, RoutingRule.name))
    return list(result.scalars().all())


@router.post("", response_model=RoutingRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_routing_rule(
    payload: RoutingRuleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> RoutingRule:
    await _validate_rule_payload(db, payload, is_create=True)
    rule = RoutingRule(**payload.model_dump())
    db.add(rule)
    await db.flush()
    await db.refresh(rule)

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role=next((r for r in user.roles if r == "admin"), user.roles[0] if user.roles else None),
        entity_type="RoutingRule",
        entity_id=rule.id,
        details={"action": "create", "name": rule.name},
        ip_address=request.client.host if request.client else None,
    )
    await invalidate_routing_rules_cache()
    return rule


@router.get("/{rule_id}", response_model=RoutingRuleResponse)
async def get_routing_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> RoutingRule:
    rule = await db.get(RoutingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")
    return rule


@router.put("/{rule_id}", response_model=RoutingRuleResponse)
async def update_routing_rule(
    rule_id: UUID,
    payload: RoutingRuleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> RoutingRule:
    rule = await db.get(RoutingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    await _validate_rule_payload(db, payload, is_create=False)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    await db.flush()
    await db.refresh(rule)

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="RoutingRule",
        entity_id=rule.id,
        details={"action": "update", "name": rule.name},
        ip_address=request.client.host if request.client else None,
    )
    await invalidate_routing_rules_cache()
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_routing_rule(
    rule_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> None:
    rule = await db.get(RoutingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="RoutingRule",
        entity_id=rule.id,
        details={"action": "delete", "name": rule.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.delete(rule)
    await invalidate_routing_rules_cache()


@router.post("/{rule_id}/preview", response_model=RulePreviewResponse)
async def preview_routing_rule(
    rule_id: UUID,
    payload: RulePreviewRequest,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> RulePreviewResponse:
    rule = await db.get(RoutingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    matches = evaluate_condition(
        payload.metadata, rule.condition_tag, rule.condition_operator, rule.condition_value
    )
    return RulePreviewResponse(matches=matches, rule_id=rule.id, rule_name=rule.name)
