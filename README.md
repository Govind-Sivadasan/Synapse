# Synapse — DICOM Data Migration Router

Healthcare imaging middleware that bridges legacy **DICOM DIMSE** systems and modern **DICOMweb** cloud PACS platforms.

Built for the **DU2 Hackathon 2026 May** programme.

## Features (Roadmap)

- DIMSE C-STORE / C-ECHO receiver with study assembly
- DICOMweb STOW-RS routing to cloud PACS (no DIMSE to destination)
- Conditional routing rules and multi-destination support
- DICOM tag morphing with audit trail
- Bulk migration jobs (QIDO-RS / WADO-RS → STOW-RS)
- React dashboard with Keycloak RBAC
- LLM chatbot for operational queries (Ollama + Qwen 2.5)

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API / Swagger | http://localhost:8000/docs |
| Keycloak | http://localhost:8080 |
| Orthanc On-Prem | http://localhost:8042 |
| Orthanc Cloud | http://localhost:8043 |

### Default Users

| Username | Password | Roles |
|----------|----------|-------|
| admin | admin123 | admin, operator, service_user, viewer |
| operator | operator123 | operator, service_user, viewer |
| service | service123 | service_user, viewer |
| viewer | viewer123 | viewer |

## Architecture

```
Modality/PACS --DIMSE C-STORE--> Synapse --DICOMweb STOW-RS--> Cloud Orthanc
On-Prem Orthanc --QIDO/WADO--> Synapse --STOW-RS--> Cloud Orthanc
```

## Project Structure

```
synapse/
├── backend/          # FastAPI + Celery + DIMSE listener
├── frontend/         # React + TypeScript SPA
├── orthanc/          # On-prem and cloud PACS configs
├── keycloak/         # Realm export with roles and users
├── docs/             # Setup and demo guides
└── docker-compose.yml
```

## Development Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Done | Docker stack, health checks, DB schema, auth scaffold |
| Phase 1 | ✅ Done | Config APIs, routing/morphing rules, audit logs, admin UI |
| Phase 2 | 🔲 Next | DIMSE receiver E2E testing |
| Phase 3 | 🔲 | Routing engine + STOW-RS upload |
| Phase 4 | 🔲 | Migration engine |
| Phase 5 | 🔲 | Dashboard, audit, reporting |
| Phase 6 | 🔲 | Chatbot service |

See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions.
