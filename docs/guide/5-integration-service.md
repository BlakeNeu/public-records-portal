# 5. The integration service

`integration-service/` is a small **Python** API built with **FastAPI**. Its one job is to talk to systems outside the portal: an email gateway and a legacy document-management system (DMS). Locally, those are the fakes in `mock-services/`.

Most feature work happens in the portal. Come here when a feature needs to reach an outside system.

## Why it's a separate service

- **Outside systems are unreliable.** They time out and return errors. All the retry, timeout and logging code lives here, in one place.
- **Credentials stay off the public server.** The portal faces the internet; this service doesn't. Upstream API keys would live here, never in the portal.
- **It translates.** The legacy DMS returns messy data (`camelCase`, numbers as strings, file types we don't allow). This service cleans it up, so the portal only ever sees one tidy shape.

**What it must never do:** touch the database, or copy the portal's create/read/update/delete logic. The portal owns the data. This service only moves messages in and out.

## How it's protected

| Protection | How |
|---|---|
| Not reachable from the internet | It sits only on Docker's `internal` network, which has no outside route, and publishes no port. Only the portal container can reach it. |
| Service token | Every call needs `Authorization: Bearer <SERVICE_TOKEN>`. Without it: 401. The comparison is constant-time (`hmac.compare_digest`). |
| Strict input | Request bodies reject unknown fields (`extra="forbid"`), and IDs must match `^[A-Za-z0-9-]{1,64}$` before they're put into upstream URLs. |
| Output filtering | Documents whose file type isn't on the allowlist are dropped. |
| No leaked internals | When an upstream system fails, callers get a plain `502 "notify unavailable"`, not the upstream's error details. |

## The endpoints

| Method and path | What it does | Returns |
|---|---|---|
| `POST /v1/notifications/status-change` | Emails a citizen that their request's status changed | `202` with `{ delivery_id, channel }` |
| `GET /v1/requests/{request_id}/documents` | Lists a request's documents from the DMS, filtered to allowed file types | `200` with `{ request_id, documents, rejected_count }` |
| `GET /health` | Health check for Docker | `200` |

The status-change body (see [notifications.py](../../integration-service/app/routers/notifications.py)):

```json
{
  "request_id": "PRR-2026-0008",
  "recipient_email": "jane.citizen@example.com",
  "recipient_name": "Jane Citizen",
  "new_status": "in_review",
  "due_at": "2026-12-09T00:00:00Z"
}
```

`new_status` uses the same four values as the portal's `RequestStatus` enum. Keep the two in sync if you ever add a status.

## Retries

[upstream.py](../../integration-service/app/upstream.py) wraps every outbound call:

- It retries **timeouts, connection errors, 429 and 5xx responses**, up to 3 attempts with exponential backoff, starting at 0.5 seconds.
- It **doesn't** retry other 4xx errors. A bad request won't get better by sending it again.
- It logs one JSON line per attempt, with the upstream name, status code, attempt number and duration.

The mock services fail about 20% of calls on purpose (`MOCK_FAILURE_RATE`), so you can watch retries happen:

```bash
docker compose logs -f integration-service
```

## Tracing one action across services

Each request carries an `X-Request-ID` header. If the caller sends one, the service reuses it. Otherwise it creates one. The ID is passed on to every upstream call and included in every log line, so you can search the logs for one ID and see everything a single user action caused.

## Calling it from the portal

> The portal doesn't call the service yet; that's on the roadmap. This section shows the shape the call will take.

Docker Compose gives the portal two environment variables: `INTEGRATION_SERVICE_URL` (`http://integration-service:8000`) and `SERVICE_TOKEN`. A call from server-side portal code looks like this:

```ts
// Server-side only (for example, a new src/lib/integration.ts with `import "server-only"`)
const res = await fetch(`${process.env.INTEGRATION_SERVICE_URL}/v1/notifications/status-change`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.SERVICE_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    request_id: request.referenceNumber,
    recipient_email: requester.email,
    recipient_name: requester.name,
    new_status: newStatus,
    due_at: request.dueAt.toISOString(),
  }),
});
if (!res.ok) {
  // Decide what the user sees. A failed email shouldn't undo a saved status change.
}
```

Things to get right when you build this:

- **Never call it from a Client Component.** The token must stay on the server.
- **Save first, notify second.** Commit the database change and its audit entry, then send the notification. If the email fails, log it, and consider showing staff a warning.
- **It only works in Docker.** `npm run dev` on your machine can't reach the service, because it only exists on Docker's private network. Test this kind of feature with `docker compose up --build`.

## Changing the service

The code is small. Start with these files:

| File | What it does |
|---|---|
| [app/main.py](../../integration-service/app/main.py) | Creates the app: request-ID middleware, error handling, routers |
| [app/config.py](../../integration-service/app/config.py) | Settings read from environment variables (`SERVICE_TOKEN`, URLs, retry counts) |
| [app/auth.py](../../integration-service/app/auth.py) | The service-token check |
| [app/upstream.py](../../integration-service/app/upstream.py) | Outbound calls with retries and logging |
| [app/routers/](../../integration-service/app/routers/) | One file per group of endpoints |
| [tests/](../../integration-service/tests/) | Pytest tests. The outside systems are faked with `respx`, so tests never touch the network. |

To add an endpoint, copy the pattern in `routers/notifications.py`:

1. Define the input as a Pydantic model with `model_config = ConfigDict(extra="forbid")`. Pydantic is Python's equivalent of Zod.
2. Add the route function with `@router.post(...)` or `@router.get(...)`. The router already requires the service token for every route in it.
3. Call outside systems only through `call_upstream(...)`, so you get retries and logging for free.
4. Add tests next to the existing ones in `tests/`.

Run the tests without installing Python, from the repo root (in Git Bash or macOS/Linux terminals):

```bash
docker run --rm -v "$PWD/integration-service:/src:ro" python:3.12-slim \
  sh -c "cp -r /src /app && cd /app && pip install -q -r requirements-dev.txt && pytest -q"
```

In PowerShell, replace `$PWD` with `${PWD}` and put the whole command on one line.

**Next:** [6. Cheat sheet and troubleshooting](6-cheat-sheet.md)
