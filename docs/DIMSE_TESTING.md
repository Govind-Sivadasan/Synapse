# DIMSE E2E Testing Guide (Phase 2)

## Prerequisites

- Synapse stack running: `docker compose up`
- DIMSE listener on port **11112** (AE Title: **SYNAPSE**)
- Celery routing worker running (`synapse-celery-routing`)

## Quick Test (Python script)

From the backend container or local venv:

```bash
cd backend
pip install -r requirements.txt
python scripts/test_dimse_e2e.py --host localhost --port 11112
```

Expected output:
- `C-ECHO OK`
- `C-STORE test_ct_001: OK` (per instance)
- `E2E DIMSE test completed successfully`

## Generate Test DICOM Files

```bash
python scripts/generate_test_dicom.py --output ./test_dicom --modality CT --instances 5
```

## Verify Reception

1. **API** — `GET /api/v1/dimse/status` (requires auth token)
2. **Routing transactions** — `GET /api/v1/routing-transactions`
3. **UI** — Routing Monitor page shows live study events via WebSocket
4. **Audit logs** — filter by `DIMSE_ASSOCIATION` or `STUDY_RECEPTION`

## DCMTK (if installed)

**AE title roles**

| Flag | Role | Echoing Synapse | Echoing a remote PACS |
|------|------|-----------------|------------------------|
| `-aec` | **Called** AE (the server you dial) | Active listener AE from Settings → DIMSE (default `SYNAPSE`) | That node's AE title (e.g. `DCM4CHEE`, `ORTHANC_ONPREM`) |
| `-aet` | **Calling** AE (your client identity) | `ECHOSCU` or `STORESCU` (whitelisted test callers) | Must be allowed **on the remote** PACS — often **not** `ECHOSCU` |

After changing Synapse's AE title in Settings, save (listener reloads automatically) and use the **active** AE in `-aec`, not the old value.

On Windows without DCMTK locally, run via the backend container:

```bash
docker exec synapse-backend echoscu localhost 11112 -aec SYNAPSE -aet ECHOSCU
```

From the host when DCMTK is installed:

```bash
echoscu localhost 11112 -aec SYNAPSE -aet ECHOSCU
storescu localhost 11112 -aec SYNAPSE -aet STORESCU test_dicom/*.dcm
```

**Nodes → Echo** in the UI uses Synapse's configured AE title as the **calling** AE (not `ECHOSCU`). Remote PACS must allow that AE as a caller.

## Promiscuous Mode Test

1. Settings → disable promiscuous mode (default)
2. Run with unknown calling AE — should reject:

```bash
python scripts/test_dimse_e2e.py --calling-ae UNKNOWN_MODALITY
```

3. Enable promiscuous mode in Settings
4. Re-run — association should succeed

## Unit Tests

```bash
cd backend
pytest tests/ -v
```

## Orthanc → Synapse Forwarding

Configure on-prem Orthanc to forward to Synapse (already in `orthanc/on-prem/orthanc.json`):

- Modality `SYNAPSE` → `synapse-backend:11112`

Use Orthanc's send functionality or upload to on-prem and route via plugin.
