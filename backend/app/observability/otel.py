"""Optional OpenTelemetry export for API and Celery workers."""

from __future__ import annotations

import structlog
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.celery import CeleryInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.config import settings

logger = structlog.get_logger()
_configured = False


def setup_opentelemetry(*, instrument_celery: bool = False) -> None:
    """Configure OTLP trace export and library instrumentation (idempotent)."""
    global _configured
    if _configured or not settings.otel_enabled:
        return

    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "deployment.environment": settings.app_env,
        }
    )
    provider = TracerProvider(resource=resource)

    if settings.otel_exporter_endpoint:
        exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
    else:
        logger.warning("otel_enabled_without_exporter_endpoint")

    trace.set_tracer_provider(provider)
    HTTPXClientInstrumentor().instrument()

    if instrument_celery:
        CeleryInstrumentor().instrument()

    _configured = True
    logger.info(
        "otel_configured",
        service=settings.otel_service_name,
        endpoint=settings.otel_exporter_endpoint or None,
        celery=instrument_celery,
    )


def instrument_fastapi(app) -> None:
    if not settings.otel_enabled:
        return
    setup_opentelemetry(instrument_celery=False)
    FastAPIInstrumentor.instrument_app(app)


def get_tracer(name: str = "synapse"):
    return trace.get_tracer(name)
