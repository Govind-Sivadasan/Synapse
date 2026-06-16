from pydantic import BaseModel, Field


class SystemConfigResponse(BaseModel):
    dimse_ae_title: str
    dimse_port: int
    dimse_promiscuous_mode: bool
    celery_max_retries: int
    celery_routing_concurrency: int
    celery_migration_concurrency: int
    logging_level: str
    audit_log_dimse: bool
    audit_log_routing: bool
    audit_log_tag_morphing: bool
    audit_log_migration: bool
    audit_log_chatbot: bool
    audit_include_phi: bool
    ollama_base_url: str
    ollama_model: str
    chatbot_enabled: bool


class SystemConfigUpdate(BaseModel):
    dimse_ae_title: str | None = Field(None, max_length=16)
    dimse_port: int | None = Field(None, ge=1, le=65535)
    dimse_promiscuous_mode: bool | None = None
    celery_max_retries: int | None = Field(None, ge=0, le=10)
    celery_routing_concurrency: int | None = Field(None, ge=1, le=32)
    celery_migration_concurrency: int | None = Field(None, ge=1, le=32)
    logging_level: str | None = Field(None, pattern="^(DEBUG|INFO|WARNING|ERROR)$")
    audit_log_dimse: bool | None = None
    audit_log_routing: bool | None = None
    audit_log_tag_morphing: bool | None = None
    audit_log_migration: bool | None = None
    audit_log_chatbot: bool | None = None
    audit_include_phi: bool | None = None
    ollama_base_url: str | None = Field(None, min_length=1, max_length=512)
    ollama_model: str | None = Field(None, min_length=1, max_length=128)
    chatbot_enabled: bool | None = None
