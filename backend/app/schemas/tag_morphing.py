from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TagMorphingRuleBase(BaseModel):
    name: str = Field(..., max_length=200)
    condition_tag: str | None = Field(None, max_length=100)
    condition_operator: str | None = None
    condition_value: str | None = Field(None, max_length=500)
    target_tag: str = Field(..., max_length=100)
    new_value: str = Field(..., max_length=500)
    is_active: bool = True


class TagMorphingRuleCreate(TagMorphingRuleBase):
    pass


class TagMorphingRuleUpdate(BaseModel):
    name: str | None = None
    condition_tag: str | None = None
    condition_operator: str | None = None
    condition_value: str | None = None
    target_tag: str | None = None
    new_value: str | None = None
    is_active: bool | None = None


class TagMorphingRuleResponse(TagMorphingRuleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
