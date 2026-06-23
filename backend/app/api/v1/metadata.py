"""UI metadata — shared enums and labels for frontend dropdowns."""

from fastapi import APIRouter, Depends

from app.auth.keycloak import CurrentUser, require_roles
from app.schemas.routing_rule import VALID_OPERATORS, VALID_TAGS

router = APIRouter(prefix="/metadata", tags=["Metadata"])

OPERATORS = [
    {"value": "equals", "label": "Equals"},
    {"value": "not_equals", "label": "Not Equals"},
    {"value": "contains", "label": "Contains"},
    {"value": "starts_with", "label": "Starts With"},
    {"value": "ends_with", "label": "Ends With"},
    {"value": "regex", "label": "Regex"},
]

MIGRATION_JOB_TYPES = [
    {"value": "historical", "label": "Historical (QIDO filter)"},
    {"value": "incremental", "label": "Incremental (date filter)"},
    {"value": "batch", "label": "Batch (explicit Study UIDs)"},
]


@router.get("")
async def get_metadata(
    _: CurrentUser = Depends(require_roles("admin", "operator", "viewer", "service_user")),
) -> dict:
    return {
        "dicom_tags": sorted(VALID_TAGS),
        "operators": [op for op in OPERATORS if op["value"] in VALID_OPERATORS],
        "migration_job_types": MIGRATION_JOB_TYPES,
        "node_types": [
            {"value": "source", "label": "Source"},
            {"value": "destination", "label": "Destination"},
            {"value": "both", "label": "Source & Destination"},
        ],
        "protocols": [
            {"value": "DIMSE", "label": "DIMSE"},
            {"value": "DICOMweb", "label": "DICOMweb"},
        ],
        "auth_types": [
            {"value": "none", "label": "None"},
            {"value": "basic", "label": "Basic"},
            {"value": "bearer", "label": "Bearer"},
            {"value": "apikey", "label": "API Key"},
        ],
    }
