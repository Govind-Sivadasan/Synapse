from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


VALID_OPERATORS = {"equals", "not_equals", "contains", "starts_with", "ends_with", "regex"}
VALID_TAGS = {
    "Modality",
    "PatientID",
    "StudyDate",
    "AccessionNumber",
    "StudyDescription",
    "InstitutionName",
    "ReferringPhysicianName",
    "BodyPartExamined",
}


class RoutingRuleBase(BaseModel):
    name: str = Field(..., max_length=200)
    condition_tag: str = Field(..., max_length=100)
    condition_operator: str
    condition_value: str = Field(..., max_length=500)
    destination_node_ids: list[UUID]
    tag_morphing_rule_ids: list[UUID] | None = None
    priority: int = 100
    is_active: bool = True


class RoutingRuleCreate(RoutingRuleBase):
    pass


class RoutingRuleUpdate(BaseModel):
    name: str | None = None
    condition_tag: str | None = None
    condition_operator: str | None = None
    condition_value: str | None = None
    destination_node_ids: list[UUID] | None = None
    tag_morphing_rule_ids: list[UUID] | None = None
    priority: int | None = None
    is_active: bool | None = None


class RoutingRuleResponse(RoutingRuleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RulePreviewRequest(BaseModel):
    metadata: dict[str, str]


class RulePreviewResponse(BaseModel):
    matches: bool
    rule_id: UUID | None = None
    rule_name: str | None = None
