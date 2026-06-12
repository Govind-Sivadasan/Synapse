# Synapse Hackathon Demo Script

**Target date:** 25-Jun-2026  
**Duration:** ~20 minutes

## Pre-Demo Checklist

- [ ] `docker compose up --build` running with all services healthy
- [ ] Ollama model pulled: `qwen2.5:7b-instruct`
- [ ] Test DICOM datasets loaded in on-prem Orthanc
- [ ] Routing rules configured (CT → Cloud, MR → Cloud, etc.)
- [ ] Tag morphing rule configured (e.g., InstitutionName → "Cloud Demo Hospital")
- [ ] Browser logged in as `admin`

## Demo Flow

### 1. Architecture Overview (2 min)

Explain the DIMSE-to-DICOMweb bridge:

```
Modality --C-STORE (DIMSE)--> Synapse --STOW-RS (DICOMweb)--> Cloud Orthanc
```

Key point: **destination PACS is never contacted via DIMSE**.

### 2. System Health (1 min)

- Navigate to **System Health**
- Show all components green (PostgreSQL, Redis, Orthanc ×2, Keycloak, Ollama)

### 3. Configuration (3 min)

- **Nodes**: Show on-prem source and cloud destination
- **Routing Rules**: Demonstrate CT → Cloud PACS rule
- **Tag Morphing**: Show InstitutionName modification rule
- **Settings**: Note promiscuous mode is **disabled by default**

### 4. Real-Time Routing (5 min)

1. Send a CT study from modality simulator or on-prem Orthanc to Synapse (AE: SYNAPSE, port 11112)
2. Open **Routing Monitor** — show study received, rule matched, destination status
3. Open Cloud Orthanc UI (http://localhost:8043) — verify study arrived
4. Verify tag morphing: InstitutionName changed per rule
5. Show **Audit Logs** for routing and morphing events

### 5. Multi-Destination Routing (2 min)

- Show rule routing CT to two destinations
- Demonstrate independent per-destination status
- Simulate failure on one destination → retry independently

### 6. Migration Job (4 min)

1. Create migration job: On-Prem → Cloud
2. Start job — show progress bar
3. Pause and resume mid-job
4. Show completion statistics
5. Retry a failed study individually

### 7. Chatbot (2 min)

Ask natural language questions:

- "What is the migration status?"
- "How many studies failed today?"
- "Which destination received study UID X?"

Show PHI filtering for viewer role vs service user.

### 8. Security & RBAC (1 min)

- Logout, login as `viewer` — show read-only access
- Login as `operator` — show migration control without admin settings

## Talking Points

- **Protocol conversion**: Legacy DIMSE in, modern DICOMweb out
- **Extensibility**: Pluggable cloud connectors (GCH, S3) via DICOMweb client abstraction
- **Reliability**: Per-destination retry, no data loss, audit trail
- **Performance**: Parallel Celery workers, segregated routing/migration queues
- **Security**: Keycloak RBAC, promiscuous mode controls, PHI minimization

## Fallback Plans

| Failure | Fallback |
|---------|----------|
| Live C-STORE fails | Show pre-recorded routing transaction in monitor |
| Ollama slow/down | Use pre-canned chatbot responses |
| Cloud Orthanc unreachable | Show STOW-RS response in audit logs |
