# Service Chatbot (Phase 6)

Operational assistant powered by **Ollama** (`qwen2.5:7b-instruct` by default). Answers questions from live Synapse data; **admins and operators** can confirm supported actions from chat.

## Setup

```bash
docker compose up -d ollama backend
docker exec synapse-ollama ollama pull qwen2.5:7b-instruct
```

Verify: `GET /api/v1/chatbot/status` should show `model_ready: true`.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/chatbot/status` | GET | Ollama availability and model status |
| `/api/v1/chatbot/suggestions` | GET | Suggested prompt list |
| `/api/v1/chatbot/messages` | GET | Persisted conversation history (`?limit=200`) |
| `/api/v1/chatbot/messages` | DELETE | Clear conversation history |
| `/api/v1/chatbot/query` | POST | `{"message": "..."}` → natural language answer (persisted) |
| `/api/v1/chatbot/actions/execute` | POST | Execute a confirmed chatbot action (role depends on entity/action) |

All endpoints require authentication. Roles: `viewer`, `service_user`, `operator`, `admin`.

## UI

- **Chatbot page** (`/chatbot`) — full layout with suggested prompts sidebar, Ollama status pill, clear chat
- **Floating widget** — bottom-right launcher on every page (except `/chatbot`); opens a drawer with the same conversation, timestamps, and suggested prompts. Link in drawer header opens the full page.

After frontend or theme changes in Docker, rebuild with `run.bat restart frontend -Build`.

## How It Works

1. User question is analyzed for keywords (migration, routing, study UID, etc.)
2. Relevant data is loaded from PostgreSQL (routing, migration, DIMSE, audit)
3. Context is sent to Ollama with a system prompt grounded in live data
4. Response is returned; **viewer** role receives PHI-redacted output
5. User and assistant messages are stored in PostgreSQL and restored on reload
6. **Confirmed actions:** when a message requests a supported change, the backend proposes a structured action. The UI shows a confirmation card; nothing is applied until the user with the required role confirms (`POST /actions/execute`). Follow-up messages can supply missing details (for example node type, then name and URL). Short replies like “yes” after an action request reuse recent conversation context to show the confirmation card.

If Ollama is unavailable, a **fallback** summary is generated from live context.

JSON-shaped model output (e.g. `{"message": "..."}`) is normalized before display.

## Supported actions

Operators and admins can request configuration and job changes in natural language. The backend maps the message (and recent conversation context) to a structured action, shows a **confirmation card** in the UI, and applies the change only after the user clicks confirm (`POST /actions/execute`).

### How matching works

- Mention the **entity** (routing rule, migration job, node, tag morphing rule) and the **verb** (create, start, disable, and so on).
- Use **names from your environment** (node names, job names, rule names) so the parser can resolve targets.
- **Multi-turn:** if details are missing, the assistant asks a follow-up question. Short replies in the same thread are combined with earlier messages (for example: “Create a new node” → “destination named Demo PACS at http://10.2.1.10/dicom-web”).
- **Confirm via the card:** typing “yes” after an action request can surface the confirmation card when recent context is clear; the change is not applied from chat text alone.

### Routing rules (admin)

| Action | What you need in chat | Notes |
|--------|----------------------|-------|
| **Create** | Modality + destination node | Phrases like “create/route/send … to …”. Creates `Modality equals <mod>` → destination. Default priority 100. |
| **Enable** | Rule name or modality | “Enable … rule”, “turn on …” |
| **Disable** | Rule name or modality | “Disable … rule”, “turn off …”, “deactivate …” |
| **Delete** | Rule name or modality | “Delete/remove … rule” |
| **Re-activate existing** | Same modality + destination as an existing rule | If a matching rule already exists, chat offers to ensure it stays **enabled**. |

### Migration jobs (operator)

| Action | What you need in chat | Notes |
|--------|----------------------|-------|
| **Create** | Source node + destination node | Optional: job type (`historical`, `batch`, `incremental`; default `historical`). Optional modality filter (for example “for CT”). Job name is derived as `Source → Destination`. |
| **Duplicate** | Existing job name | Optional new name: “… as My Copy” / “named …”. Copies source, destination, job type, and `job_config`. Default name: `<original> (copy)`. |
| **Start** | Job name | “Start/run … migration job”. Runs preflight connectivity when configured. |
| **Pause** | Job name | Only while `in_progress` or `discovering`. |
| **Resume** | Job name | Only while `paused`. |
| **Cancel** | Job name | Stops further processing. |
| **Delete** | Job name | Not allowed while running; cancel first. Removes job and study records. |
| **Rename** | Job name + new name | Pattern: “rename … job … to …”. Not allowed while running. |
| **Retry failed** | Job name | “Retry failed … migration job”. Queues up to 50 failed/skipped studies by default; optional “limit N” (max 500). |

### Nodes

| Action | Role | What you need in chat | Notes |
|--------|------|----------------------|-------|
| **Create** | operator | `source` or `destination`, name, endpoint | `http://` or `https://` URL infers **DICOMweb**. DIMSE: include “DIMSE”, host, optional port/AE title. |
| **Enable** | admin | Node name | |
| **Disable** | admin | Node name | |
| **Rename** | admin | Node name + new name | Pattern: “rename … node … to …” |
| **Delete** | admin | Node name | |
| **Echo / test** | admin | Node name | “Test/echo … node” — connectivity probe only. |

### Tag morphing rules (admin)

| Action | What you need in chat | Notes |
|--------|----------------------|-------|
| **Create** | Modality, target tag, new value | Pattern: “… for CT to set InstitutionName to Demo Hospital”. Target tag must be a valid DICOM tag name in the allow-list. |
| **Enable** | Rule name | |
| **Disable** | Rule name | |
| **Rename** | Rule name + new name | Pattern: “rename … rule … to …” |
| **Delete** | Rule name | |

### Roles

| Role | Can confirm |
|------|-------------|
| **Admin** | All actions above |
| **Operator** | Migration jobs (all listed job actions) and **node create** only |
| **Viewer / service_user** | Read-only answers; no confirmation cards |

All executed actions are audited as `CHATBOT_ACTION` plus the entity audit event (`CONFIG_CHANGE`, `JOB_STATUS_CHANGE`, or `RETRY_ATTEMPT` where applicable).

### Example phrases

- “Create a rule to route CT studies to Cloud PACS”
- “Disable the CT routing rule”
- “Create a historical migration job from MW PACS to Local PACS for CT”
- “Duplicate migration job [CR] - MW -> Local”
- “Start migration job MW PACS → Local PACS”
- “Rename migration job MW PACS → Local PACS to Nightly MW sync”
- “Retry failed migration job MW PACS → Local PACS”
- “Create a destination node named Local PACS at http://10.30.2.74:8085/dicom-web”
- “Echo node Orthanc On-Prem”
- “Create a tag morphing rule for CT to set InstitutionName to Demo Hospital”

## Example Questions

- "What is the migration status?"
- "How many studies failed routing today?"
- "Is the DIMSE listener online?"
- "What happened to study 1.2.840.…?" (include Study UID)

## PHI Redaction

Users with **viewer** role only (no service_user/operator/admin) receive:

- Masked Study UIDs (`1.2.840.1…1234`)
- Redacted Patient IDs and accession numbers

`service_user`, `operator`, and `admin` see full operational context.

## Audit

Every query is logged as `CHATBOT_QUERY` in audit logs (question truncated to 500 chars).
