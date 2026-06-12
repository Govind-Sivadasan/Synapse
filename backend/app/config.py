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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
