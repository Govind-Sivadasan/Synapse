from pydantic import BaseModel, Field


class SystemConfigResponse(BaseModel):
    dimse_ae_title: str
    dimse_port: int
    dimse_promiscuous_mode: bool
    celery_max_retries: int
    celery_routing_concurrency: int
    celery_migration_concurrency: int
    logging_level: str


class SystemConfigUpdate(BaseModel):
    dimse_ae_title: str | None = Field(None, max_length=16)
    dimse_port: int | None = Field(None, ge=1, le=65535)
    dimse_promiscuous_mode: bool | None = None
    celery_max_retries: int | None = Field(None, ge=0, le=10)
    celery_routing_concurrency: int | None = Field(None, ge=1, le=32)
    celery_migration_concurrency: int | None = Field(None, ge=1, le=32)
    logging_level: str | None = Field(None, pattern="^(DEBUG|INFO|WARNING|ERROR)$")
