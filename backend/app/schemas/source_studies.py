from uuid import UUID

from pydantic import BaseModel, Field


class SourceStudyResponse(BaseModel):
    study_uid: str
    patient_id: str | None = None
    patient_name: str | None = None
    patient_birth_date: str | None = None
    modality: str | None = None
    study_date: str | None = None
    study_time: str | None = None
    acquisition_date: str | None = None
    study_description: str | None = None
    accession_number: str | None = None
    referring_physician: str | None = None
    station_name: str | None = None
    body_part_examined: str | None = None
    protocol_name: str | None = None
    acquisition_description: str | None = None
    requested_procedure: str | None = None
    patient_location: str | None = None
    num_series: int | None = None
    num_instances: int | None = None


class SourceStudyListResponse(BaseModel):
    source_node_id: UUID
    source_node_name: str
    items: list[SourceStudyResponse]
    limit: int
    offset: int
    has_more: bool


class SourceStudyMigrateRequest(BaseModel):
    name: str = Field(..., max_length=200)
    source_node_id: UUID
    destination_node_id: UUID
    study_uids: list[str] = Field(..., min_length=1, max_length=500)
    tag_morphing_rule_ids: list[UUID] | None = None
    start: bool = True


class SourceStudyRouteRequest(BaseModel):
    source_node_id: UUID
    study_uids: list[str] = Field(..., min_length=1, max_length=100)


class SourceStudyActionResponse(BaseModel):
    enqueued: int
    study_uids: list[str]
    job_id: UUID | None = None
    task_ids: list[str] = Field(default_factory=list)
