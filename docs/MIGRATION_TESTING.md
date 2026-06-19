# Migration Engine Testing (Phase 4)

Bulk migration uses **QIDO-RS** on the source PACS, **WADO-RS** per study, optional tag morphing, and **STOW-RS** to the cloud destination.

## Prerequisites

```bash
docker compose up --build -d
```

Ensure seed data exists (on-prem + cloud Orthanc nodes). Upload at least one study to on-prem Orthanc:

```bash
# Generate sample DICOM
docker exec synapse-backend python scripts/generate_test_dicom.py --output /data/temp_dicom/sample

# C-STORE to on-prem DIMSE (port 4242) or upload via Orthanc UI at http://localhost:8042
```

## API Flow

1. **Create job** — `POST /api/v1/migration-jobs`
2. **Start job** — `POST /api/v1/migration-jobs/{id}/start`
3. **Monitor** — `GET /api/v1/migration-jobs/{id}/studies`
4. **Retry failed study** — `POST /api/v1/migration-jobs/{id}/studies/{study_id}/retry`

### Example: Historical CT migration

```bash
TOKEN="<keycloak access token>"

# List nodes
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/nodes | jq

# Create job (replace UUIDs from nodes list)
curl -s -X POST http://localhost:8000/api/v1/migration-jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CT to Cloud",
    "source_node_id": "<on-prem-uuid>",
    "destination_node_id": "<cloud-uuid>",
    "job_type": "historical",
    "job_config": {
      "filters": { "modality": "CT" },
      "tag_morphing_rule_ids": []
    }
  }' | jq

# Start
curl -s -X POST http://localhost:8000/api/v1/migration-jobs/<job-id>/start \
  -H "Authorization: Bearer $TOKEN" | jq
```

## UI

1. Log in as `operator` / `operator123`
2. Open **Migration Jobs**
3. Create a job (source: Orthanc On-Prem, destination: Orthanc Cloud)
4. Click **Start** and watch study records update
5. Verify studies appear in cloud Orthanc: http://localhost:8043

## Celery

Migration tasks run on `celery-migration` worker (`migration_queue`):

```bash
docker logs -f synapse-celery-migration
```

Tune worker concurrency and DICOMweb parallelism via `.env` — see [PERFORMANCE.md](PERFORMANCE.md):

| Variable | Default | Effect |
|----------|---------|--------|
| `CELERY_MIGRATION_CONCURRENCY` | 8 | Studies processed in parallel |
| `WADO_PARALLEL_INSTANCES` | 8 | Parallel WADO-RS per study |
| `STOW_BATCH_SIZE` | 4 | Instances per STOW request |
| `STOW_PARALLEL_BATCHES` | 2 | Concurrent STOW batches per study |

## Performance validation

After a migration job:

```bash
# Prometheus text
curl -s http://localhost:8000/metrics | grep synapse_pipeline_phase

# JSON baseline (requires operator token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/performance/baseline | jq
```

Reset metrics before a clean benchmark:

```bash
docker compose exec backend python scripts/reset_performance_metrics.py --yes
```

Full tuning guide: [PERFORMANCE.md](PERFORMANCE.md).

## Unit Tests

```bash
docker exec synapse-backend python -m pytest tests/test_dicom_json.py tests/ -v
```
