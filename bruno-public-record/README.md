# Bruno API tests: integration service

API tests for the integration service, the internal FastAPI service the portal uses for document lookups and notifications. They run against the local Docker stack, using the `records` environment.

## What the tests cover

| Folder | Needs the token | What it checks |
|---|---|---|
| `1-health` | No | `/health` returns `{"status": "ok"}` and echoes the `X-Request-ID` header |
| `2-auth` | No | A missing or wrong token gets a `401`, with the same message either way |
| `3-documents` | Yes | Document lists are normalised and filtered, repeat calls return the same result, an unknown ID returns `404`, and a bad ID returns `422` |
| `4-notifications` | Yes | A valid status change returns `202` with a UUID; bad status, email, missing fields, extra fields and long names each return `422` |

Run the folders in order. `Same request returns the same documents` compares its response with the one saved by the request before it.

## Environment variables (`records`)

| Variable | Value | Notes |
|---|---|---|
| `prrp_key` | your `SERVICE_TOKEN` | **Secret.** Bruno keeps it on your machine, not in this file. |
| `baseUrl` | `http://localhost:8000` | Published by `docker-compose.api-test.yml` |
| `requestId` | `REQ-2026-0001` | Any letters, digits and hyphens, up to 64 characters |
| `missingRequestId` | `MISSING-0001` | The mock returns `404` for IDs that start with `MISSING` |
| `recipientEmail` | `jane.citizen@example.com` | Fake demo address |
| `recipientName` | `Jane Citizen` | |

---

## 1. Start the services

Run this from the **repo root** (`C:\Users\blake\PRRP`), not from `app` or this folder:

```powershell
cd C:\Users\blake\PRRP
docker compose -f docker-compose.yml -f docker-compose.api-test.yml up --build -d integration-service mock-services
```

The `docker-compose.api-test.yml` override does three things:
- publishes the integration service on `127.0.0.1:8000`, since in the normal stack it lives only on Docker's internal network
- turns off the mock's random `503` outages (`MOCK_FAILURE_RATE=0`) so results are repeatable
- starts only the two services the tests need, not the database or portal

**Check that it's up.** Both commands should report `{"status":"ok"}` or `healthy`:
```powershell
curl.exe http://127.0.0.1:8000/health
docker compose -f docker-compose.yml -f docker-compose.api-test.yml ps
```

## 2. Get the service token

The token is `SERVICE_TOKEN` from `.env` in the repo root. If `.env` doesn't set it, Compose uses the local default, `local-dev-only-service-token-0123456789abcdef`.

**PowerShell**, from the repo root:
```powershell
$token = (Select-String -Path .env -Pattern '^SERVICE_TOKEN=(.+)$').Matches.Groups[1].Value
if (-not $token) { $token = 'local-dev-only-service-token-0123456789abcdef' }
```

**Bash** (Git Bash, Linux, macOS), from the repo root:
```bash
TOKEN=$(grep -E '^SERVICE_TOKEN=' .env 2>/dev/null | cut -d= -f2-)
TOKEN=${TOKEN:-local-dev-only-service-token-0123456789abcdef}
```

Both read the token into a variable, so it isn't printed or saved in your shell history.

## 3. Run the tests

### Bruno CLI

Run from this folder (`bruno-public-record`).

**PowerShell.** Use `npx.cmd`, not `npx`. See [Troubleshooting](#troubleshooting).
```powershell
cd bruno-public-record
npx.cmd @usebruno/cli run --env records --env-var "prrp_key=$token"
```

**Bash**
```bash
cd bruno-public-record
npx @usebruno/cli run --env records --env-var "prrp_key=$TOKEN"
```

**Run one or more folders**
```powershell
npx.cmd @usebruno/cli run 1-health 2-auth --env records                              # no token needed
npx.cmd @usebruno/cli run 3-documents --env records --env-var "prrp_key=$token"
npx.cmd @usebruno/cli run 4-notifications --env records --env-var "prrp_key=$token"
```

**Run a single request**
```powershell
npx.cmd @usebruno/cli run 4-notifications/status-change.yml --env records --env-var "prrp_key=$token"
```

**Save a report.** This creates an HTML page you can open in a browser, plus a JUnit XML file that CI tools read. Each flag is optional.
```powershell
npx.cmd @usebruno/cli run --env records --env-var "prrp_key=$token" `
  --reporter-html results.html --reporter-junit results.xml
```
The report files contain response bodies, so keep them out of git.

**Stop at the first failure**
```powershell
npx.cmd @usebruno/cli run --env records --env-var "prrp_key=$token" --bail
```

Last run with `@usebruno/cli` 4.4.0. To pin that version, use `@usebruno/cli@4.4.0`.

### Bruno app or VS Code extension

1. Open the `bruno-public-record` folder as a collection.
2. Select the `records` environment.
3. Open the environment settings and set `prrp_key` to the token from step 2. You only need to do this once; Bruno remembers it.
4. Right-click the collection and choose **Run** to run every request, or open a single request and send it.

## 4. Stop the services

From the repo root:
```powershell
docker compose -f docker-compose.yml -f docker-compose.api-test.yml down
```
This stops and removes the containers. Your database volume isn't touched, because these tests don't start the database.

To go back to the normal stack, run `docker compose up -d` without the override. The integration service then becomes internal-only again.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `open ...\app\docker-compose.yml: The system cannot find the file specified` | Compose was run from the wrong folder | `cd C:\Users\blake\PRRP`, then run it again |
| `npx.ps1 cannot be loaded because running scripts is disabled on this system` | PowerShell's execution policy blocks `.ps1` scripts | Use `npx.cmd`, or run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `The '<' operator is reserved for future use` | `<token>` was typed literally | Use `$token` from step 2 |
| `connect ECONNREFUSED 127.0.0.1:8000` | Services not running, or started without the override | Run step 1 again, with **both** `-f` files |
| `Bind for 127.0.0.1:8000 failed: port is already allocated` | Something else is using port 8000 | Stop it, or change `8000:8000` to `8001:8000` in `docker-compose.api-test.yml` and set `baseUrl` to `http://localhost:8001` |
| Every token-protected request returns `401` | `prrp_key` is missing or wrong | Check the token matches `SERVICE_TOKEN` in `.env`. If you changed `.env`, restart the services. |
| Random `502` responses (`dms unavailable` or `notify unavailable`) | The mock's simulated outages are on | You started the stack without the override. Run step 1 again. |
| `Same request returns the same documents` fails with "no snapshot" | It ran on its own | Run the whole `3-documents` folder, so `List documents for a request` runs first |
| `Warning: Skipping invalid file` | A non-Bruno `.yml` file is in this folder | Move it out. Bruno tries to read every `.yml` here as a request. |
