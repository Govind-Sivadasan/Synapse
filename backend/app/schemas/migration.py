from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MigrationFilters(BaseModel):
    modality: str | None = None
    patient_id: str | None = None
    date_from: str | None = Field(None, description="YYYYMMDD")
    date_to: str | None = Field(None, description="YYYYMMDD")
    study_uids: list[str] | None = None


class MigrationJobConfig(BaseModel):
    filters: MigrationFilters | None = None
    tag_morphing_rule_ids: list[UUID] | None = None
    qido_limit: int = Field(100, ge=1, le=500)


class MigrationJobCreate(BaseModel):
    name: str = Field(..., max_length=200)
    source_node_id: UUID
    destination_node_id: UUID
    job_type: str = Field(..., pattern="^(historical|batch|incremental)$")
    job_config: MigrationJobConfig | None = None


class MigrationJobResponse(BaseModel):
    id: UUID
    name: str
    source_node_id: UUID
    destination_node_id: UUID
    source_node_name: str | None = None
    destination_node_name: str | None = None
    job_type: str
    status: str
    total_studies: int | None
    completed_studies: int
    failed_studies: int
    retry_count: int
    job_config: dict | None
    celery_task_id: str | None
    created_by: str
    start_time: datetime | None
    end_time: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MigrationStudyRecordResponse(BaseModel):
    id: UUID
    job_id: UUID
    study_uid: str
    patient_id: str | None
    modality: str | None
    study_date: date | None
    status: str
    retry_count: int
    failure_reason: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class MigrationStudyListResponse(BaseModel):
    total: int
    items: list[MigrationStudyRecordResponse]


class MigrationJobListResponse(BaseModel):
    total: int
    items: list[MigrationJobResponse]
