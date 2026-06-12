"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import dashboard, health, nodes

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health.router)
api_router.include_router(nodes.router)
api_router.include_router(dashboard.router)
