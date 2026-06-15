from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NodeBase(BaseModel):
    name: str = Field(..., max_length=100)
    node_type: str = Field(..., pattern="^(source|destination)$")
    protocol: str = Field(..., pattern="^(DIMSE|DICOMweb)$")
    host: str
    port: int | None = None
    ae_title: str | None = Field(None, max_length=16)
    dicomweb_url: str | None = None
    auth_type: str | None = Field(None, pattern="^(none|basic|bearer|apikey)$")
    auth_config: dict | None = None
    is_active: bool = True


class NodeCreate(NodeBase):
    pass


class NodeUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    node_type: str | None = Field(None, pattern="^(source|destination)$")
    protocol: str | None = Field(None, pattern="^(DIMSE|DICOMweb)$")
    host: str | None = None
    port: int | None = None
    ae_title: str | None = Field(None, max_length=16)
    dicomweb_url: str | None = None
    auth_type: str | None = Field(None, pattern="^(none|basic|bearer|apikey)$")
    auth_config: dict | None = None
    is_active: bool | None = None


class NodeResponse(NodeBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NodeEchoResponse(BaseModel):
    success: bool
    protocol: str
    message: str
    status_code: int | None = None
    latency_ms: int | None = None
