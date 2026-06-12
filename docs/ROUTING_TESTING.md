# Phase 3 Routing E2E Test Guide

## Prerequisites

- Full stack running: `docker compose up --build`
- Seed data includes: **Route CT to Cloud PACS** rule + **CT Institution Rename** morphing rule
- Celery routing worker running

## End-to-End Demo Flow

### 1. Send CT study via DIMSE

```bash
docker exec synapse-backend python scripts/test_dimse_e2e.py --host localhost --port 11112 --instances 3
```

### 2. Verify routing pipeline

| Step | Check |
|------|-------|
| Rule match | Audit logs show `ROUTING_RULE_MATCH` |
| Tag morphing | Audit logs show `TAG_MORPHING_APPLIED` with InstitutionName change |
| STOW-RS upload | Routing transaction status = `success` |
| Cloud PACS | Study visible at http://localhost:8043 |

### 3. UI verification

- **Routing Monitor** — transaction shows `success`, destination `Orthanc Cloud`
- **Audit Logs** — filter `ROUTING_RULE_MATCH`, `TAG_MORPHING_APPLIED`

### 4. Verify morphing in Cloud Orthanc

Query study metadata via QIDO-RS:

```bash
curl -s "http://localhost:8043/dicom-web/studies?Modality=CT" -H "Accept: application/dicom+json"
```

InstitutionName should be **Cloud Demo Hospital** for routed CT studies.

## Retry Failed Destination

If upload fails (e.g., cloud Orthanc down):

1. Restart cloud Orthanc: `docker compose restart orthanc-cloud`
2. In **Routing Monitor**, click **Retry** on the failed destination row
3. Or via API: `POST /api/v1/routing-transactions/destinations/{id}/retry`

## No Match Scenario

Send MR study (no matching rule):

```bash
docker exec synapse-backend python scripts/generate_test_dicom.py --modality MR --instances 1
docker exec synapse-backend python scripts/test_dimse_e2e.py --skip-store
# Then C-STORE MR files manually or adjust test script
```

Transaction status should be `no_match`.

## Architecture Validated

```
C-STORE (DIMSE) → StudyAssembler → RoutingEngine
  → Rule Evaluation → Tag Morphing → STOW-RS (DICOMweb) → Cloud Orthanc
```

**No DIMSE forwarding to destination** — protocol conversion enforced.
