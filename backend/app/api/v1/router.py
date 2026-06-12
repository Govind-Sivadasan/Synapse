"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import audit_logs, config, dashboard, health, nodes, routing_rules, tag_morphing

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health.router)
api_router.include_router(nodes.router)
api_router.include_router(routing_rules.router)
api_router.include_router(tag_morphing.router)
api_router.include_router(config.router)
api_router.include_router(audit_logs.router)
api_router.include_router(dashboard.router)
