"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Synapse"
    app_env: str = "development"
    debug: bool = True
    secret_key: str = "change-me-in-production"
    temp_storage_path: str = "/data/temp_dicom"
    auth_config_encryption_key: str = "change-me-32-byte-key-for-aes!!"

    # DIMSE
    dimse_ae_title: str = "SYNAPSE"
    dimse_port: int = 11112
    dimse_promiscuous_mode: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://synapse:synapse_secret@localhost:5432/synapse"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_routing_concurrency: int = 4
    celery_migration_concurrency: int = 2
    celery_max_retries: int = 3

    # Keycloak
    keycloak_url: str = "http://localhost:8080"
    keycloak_realm: str = "synapse"
    keycloak_client_id: str = "synapse-ui"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b-instruct"

    # Orthanc
    orthanc_onprem_dicomweb_url: str = "http://localhost:8042/dicom-web"
    orthanc_cloud_dicomweb_url: str = "http://localhost:8043/dicom-web"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Performance instrumentation (Phase 0)
    metrics_enabled: bool = True

    # Performance tuning (Phase 1)
    dicomweb_http_timeout: float = 120.0
    dicomweb_http_max_connections: int = 20
    dicomweb_http_max_keepalive: int = 10
    dashboard_metrics_cache_ttl_seconds: int = 30
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # Performance tuning (Phase 2)
    wado_parallel_instances: int = 8
    migration_queue_backpressure_max: int = 200
    routing_queue_backpressure_max: int = 200
    routing_backpressure_dimse_refuse: bool = True
    migration_streaming_discovery: bool = False
    migration_coordinator_page_size: int = 100
    migration_coordinator_chain_delay_seconds: float = 0.0
    migration_preflight_echo: bool = True
    migration_single_active_job: bool = True
    migration_redis_counters_enabled: bool = True
    migration_job_counter_flush_interval: int = 5

    # Performance tuning (Phase 3)
    partition_months_ahead: int = 3
    partition_maintenance_interval_seconds: int = 86400
    partition_retention_enabled: bool = True
    ws_event_batch_interval_ms: int = 250
    ws_event_batch_max_size: int = 50
    ws_ops_snapshot_interval_seconds: float = 5.0
    ws_ops_events_enabled: bool = True

    # STOW tuning (post Phase 2)
    stow_batch_size: int = 4
    stow_parallel_batches: int = 2

    # STOW rate limits (Phase 4.5)
    stow_rate_limit_enabled: bool = False
    stow_destination_rate_per_second: float = 8.0
    stow_destination_rate_burst: int = 16
    stow_rate_limit_poll_seconds: float = 0.05

    # OpenTelemetry (optional)
    otel_enabled: bool = False
    otel_service_name: str = "synapse-backend"
    otel_exporter_endpoint: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
