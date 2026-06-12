"""Tag morphing rules API."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.models.tag_morphing import TagMorphingRule
from app.schemas.routing_rule import VALID_OPERATORS, VALID_TAGS
from app.schemas.tag_morphing import (
    TagMorphingRuleCreate,
    TagMorphingRuleResponse,
    TagMorphingRuleUpdate,
)
from app.services.audit_logger import AuditLogger
from app.services.rule_evaluator import evaluate_condition

router = APIRouter(prefix="/tag-morphing-rules", tags=["Tag Morphing Rules"])


def _validate_morphing_rule(payload: TagMorphingRuleCreate | TagMorphingRuleUpdate, is_create: bool):
    data = payload.model_dump() if is_create else payload.model_dump(exclude_unset=True)
    if data.get("condition_tag") and data["condition_tag"] not in VALID_TAGS:
        raise HTTPException(status_code=400, detail=f"Invalid condition_tag. Allowed: {sorted(VALID_TAGS)}")
    if data.get("condition_operator") and data["condition_operator"] not in VALID_OPERATORS:
        raise HTTPException(status_code=400, detail=f"Invalid operator. Allowed: {sorted(VALID_OPERATORS)}")
    if data.get("target_tag") and data["target_tag"] not in VALID_TAGS:
        raise HTTPException(status_code=400, detail=f"Invalid target_tag. Allowed: {sorted(VALID_TAGS)}")


@router.get("", response_model=list[TagMorphingRuleResponse])
async def list_tag_morphing_rules(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> list[TagMorphingRule]:
    result = await db.execute(select(TagMorphingRule).order_by(TagMorphingRule.name))
    return list(result.scalars().all())


@router.post("", response_model=TagMorphingRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_tag_morphing_rule(
    payload: TagMorphingRuleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> TagMorphingRule:
    _validate_morphing_rule(payload, is_create=True)
    rule = TagMorphingRule(**payload.model_dump())
    db.add(rule)
    await db.flush()
    await db.refresh(rule)

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="TagMorphingRule",
        entity_id=rule.id,
        details={"action": "create", "name": rule.name, "target_tag": rule.target_tag},
        ip_address=request.client.host if request.client else None,
    )
    return rule


@router.get("/{rule_id}", response_model=TagMorphingRuleResponse)
async def get_tag_morphing_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> TagMorphingRule:
    rule = await db.get(TagMorphingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Tag morphing rule not found")
    return rule


@router.put("/{rule_id}", response_model=TagMorphingRuleResponse)
async def update_tag_morphing_rule(
    rule_id: UUID,
    payload: TagMorphingRuleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> TagMorphingRule:
    rule = await db.get(TagMorphingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Tag morphing rule not found")

    _validate_morphing_rule(payload, is_create=False)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    await db.flush()
    await db.refresh(rule)

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="TagMorphingRule",
        entity_id=rule.id,
        details={"action": "update", "name": rule.name},
        ip_address=request.client.host if request.client else None,
    )
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag_morphing_rule(
    rule_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> None:
    rule = await db.get(TagMorphingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Tag morphing rule not found")

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="TagMorphingRule",
        entity_id=rule.id,
        details={"action": "delete", "name": rule.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.delete(rule)


class MorphPreviewRequest(BaseModel):
    metadata: dict[str, str]


@router.post("/{rule_id}/preview")
async def preview_tag_morphing_rule(
    rule_id: UUID,
    payload: MorphPreviewRequest,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> dict:
    rule = await db.get(TagMorphingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Tag morphing rule not found")

    applies = True
    if rule.condition_tag and rule.condition_operator and rule.condition_value:
        applies = evaluate_condition(
            payload.metadata, rule.condition_tag, rule.condition_operator, rule.condition_value
        )

    original = payload.metadata.get(rule.target_tag, "")
    return {
        "applies": applies,
        "target_tag": rule.target_tag,
        "original_value": original,
        "new_value": rule.new_value if applies else original,
    }
