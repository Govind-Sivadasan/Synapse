# Reporting & Dashboard (Phase 5)

## Dashboard API

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/dashboard/metrics` | Routing, migration, and DIMSE summary metrics |
| `GET /api/v1/dashboard/charts/volume?days=7` | Daily routing + migration volume |
| `GET /api/v1/dashboard/charts/modality?days=30` | Top modalities |
| `GET /api/v1/dashboard/charts/status` | Routing status breakdown |
| `GET /api/v1/dashboard/activity?limit=15` | Recent routing and migration events |

Viewer role receives masked Study UIDs in the activity feed.

## Reports API

| Endpoint | Roles | Description |
|----------|-------|-------------|
| `GET /api/v1/reports/summary?days=7` | service_user+ | Period operational summary |
| `GET /api/v1/reports/audit/summary?days=7` | service_user+ | Audit events by type |
| `GET /api/v1/reports/audit/export?days=30` | operator, admin | CSV download (max 5000 rows) |

## Audit Enhancements

- Date range filters on **Audit Logs** page
- Event type summary chart (last 7 days)
- CSV export from Audit Logs and Reports pages
- `USER_LOGIN` events recorded on successful Keycloak authentication

## UI Pages

- **Dashboard** — metrics, volume charts, activity feed, quick links
- **Reports** — period summary, status/modality/audit charts, CSV export
- **Audit Logs** — filters, summary chart, formatted details, export
