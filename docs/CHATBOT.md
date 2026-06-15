# Service Chatbot (Phase 6)

Read-only operational assistant powered by **Ollama** (`qwen2.5:7b-instruct` by default).

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

All endpoints require authentication. Roles: `viewer`, `service_user`, `operator`, `admin`.

## UI

- **Chatbot page** (`/chatbot`) — full layout with suggested prompts sidebar, Ollama status pill, clear chat
- **Floating widget** — bottom-right launcher on every page (except `/chatbot`); opens a drawer with the same conversation, timestamps, and suggested prompts. Link in drawer header opens the full page.

After frontend or theme changes in Docker, rebuild with `run.bat restart frontend -Build`.

## How It Works

1. User question is analyzed for keywords (migration, routing, study UID, etc.)
2. Relevant data is loaded from PostgreSQL (routing, migration, DIMSE, audit)
3. Context is sent to Ollama with a strict read-only system prompt
4. Response is returned; **viewer** role receives PHI-redacted output
5. User and assistant messages are stored in PostgreSQL and restored on reload

If Ollama is unavailable, a **fallback** summary is generated from live context.

JSON-shaped model output (e.g. `{"message": "..."}`) is normalized before display.

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
