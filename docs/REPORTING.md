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
| `GET /api/v1/reports/summary?days=7` | viewer, service_user, operator, admin | Period operational summary (`days=0` = all time) |
| `GET /api/v1/reports/audit/summary?days=7` | viewer, service_user, operator, admin | Audit events by type (`days=0` = all time) |
| `GET /api/v1/reports/audit/export?days=30` | operator, admin | CSV download (max 5000 rows; `days=0` = all time) |

The `days` query parameter accepts `0` through `3650`. Use `days=0` for an all-time summary when the default 7-day window shows empty charts.

## Audit Enhancements

- Date range filters on **Audit Logs** page
- Event type summary chart (last 7 days)
- CSV export from Audit Logs and Reports pages (Reports export: operator/admin only)
- `USER_LOGIN` events recorded on successful Keycloak authentication

## UI Pages

- **Dashboard** — metrics, volume charts, activity feed, quick links
- **Reports** — period selector (7 / 14 / 30 / 90 days or **All time**), summary cards, status/modality/audit charts, CSV export (operator/admin)
- **Audit Logs** — filters, summary chart, formatted details, export

Empty chart states explain when there is no data in the selected period and suggest switching to **All time** for historical totals.
