# 6. Cheat sheet and troubleshooting

## Day-to-day development

**Run the whole site in Docker** (no hot reload; best for trying things out):

```bash
docker compose up --build          # add -d to run in the background
docker compose down                # stop (keeps the data)
docker compose down -v             # stop and DELETE the database, to start fresh
```

**Work on the portal with hot reload** (the page updates as you save). This needs Node.js 20+. The database and services run in Docker, and the portal runs on your machine:

```bash
# 1. Backing services (from the repo root). Stop Docker's copy of the portal if it's running.
docker compose up -d db integration-service mock-services migrate
docker compose stop web

# 2. First time only
cd app
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(33).toString('base64url'))"
#    ...paste the output into .env as AUTH_SECRET="..."
npm install

# 3. Every time
npm run db:generate     # after a fresh clone or a pull that changed schema.prisma
npm run dev             # http://localhost:3000
```

Sign in with the demo accounts as usual. Docker seeded the database, so the password is `demo-password-local-only`.

On Windows, if PowerShell says *"running scripts is disabled on this system"*, see [troubleshooting](#troubleshooting).

## Commands

Run these from `app/` unless noted.

| Command | What it does |
|---|---|
| `npm run dev` | Start the portal with hot reload |
| `npm run typecheck` | Check types across the whole project |
| `npm run lint` | Check for common mistakes |
| `npm run build` | Production build; catches errors that dev mode misses |
| `npm run db:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:migrate -- --name what_changed` | Create and apply a migration from your schema edits |
| `npm run db:seed` | **Wipe** the database and reload the demo data |
| `docker compose logs -f web` | Follow the Docker portal's logs (from the repo root) |
| `docker compose logs -f integration-service` | Watch the integration service, retries included |
| `docker compose exec db psql -U prrp -d records_portal` | SQL prompt in the database |

## Where does my code go?

| I need to… | Put it in | Example |
|---|---|---|
| Add a page | `src/app/<path>/page.tsx` | `src/app/requests/page.tsx` |
| Handle a form submit | A function in `src/app/actions/*.ts` (file starts with `"use server"`) | `actions/auth.ts` |
| Query the database | A function in `src/lib/*.ts` that takes the `user` and scopes the query | `lib/requests.ts` |
| Add an interactive widget | A component file starting with `"use client"` | `login/login-form.tsx` |
| Add reusable UI | `src/components/` | `components/badges.tsx` |
| Add a business rule (dates, statuses) | A plain function in `src/lib/` | `lib/deadlines.ts` |
| Restrict a page to a role | `await requireUser("admin")` in the page's async component | `admin/users/page.tsx` |
| Log an action | `recordAudit()` from `lib/audit.ts`, in the same transaction | — |
| Add a table or column | `prisma/schema.prisma`, then `npm run db:migrate` | [Chapter 3](3-database.md#changing-the-schema) |
| Add a new setting or secret | An environment variable: `docker-compose.yml`, `.env.example` and `app/.env.example` | `SERVICE_TOKEN` |

## Troubleshooting

### "npm.ps1 cannot be loaded because running scripts is disabled on this system"

That's the PowerShell script policy on Windows. Run this once in a normal (non-admin) PowerShell window:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Or use `npm.cmd run dev` instead of `npm run dev`.

### The site won't load at localhost:3000

- Is anything running? Docker's portal: `docker compose ps` should show `web` as healthy. Dev mode: the terminal running `npm run dev` must stay open.
- Port already in use? Only one of Docker's `web` service and `npm run dev` can use port 3000. Stop one, or set `WEB_PORT=3001` in the root `.env`.
- Docker errors like *"failed to connect to the docker API"* mean Docker Desktop isn't running. Open it and wait for "Engine running".

### "Can't reach database server at localhost:5432"

Postgres isn't running: `docker compose up -d db`. If another Postgres already uses port 5432 on your machine, set `POSTGRES_PORT=5433` in the root `.env`, and change the port in `app/.env`'s `DATABASE_URL` to match.

### "Property 'x' does not exist" right after changing the schema

The generated Prisma client is out of date. Run `npm run db:generate`. If VS Code still complains, run **TypeScript: Restart TS Server** from the command palette.

### "Next.js encountered the unstable value … while prerendering"

Code that depends on the request ran outside `<Suspense>`, or called `auth()` directly. Get the user through `requireUser()` or `getCurrentUser()`, and put request-dependent components inside `<Suspense>`. See [chapter 2](2-how-the-portal-works.md#the-rules-of-cache-components-read-this-before-your-first-page).

### "UntrustedHost: Host must be trusted"

Auth.js doesn't know the site's address. Set `AUTH_URL` (for example `AUTH_URL="http://localhost:3000"` in `app/.env`). Docker Compose sets it for you.

### Sign-in fails with the demo password

The demo password is whatever `SEED_PASSWORD` was **when the database was seeded**. Docker uses `demo-password-local-only`. If you ran `npm run db:seed` yourself, it used the `SEED_PASSWORD` in `app/.env`. To get back to the Docker default: `docker compose down -v`, then `docker compose up --build`.

### "audit_logs is append-only (UPDATE rejected)"

Working as intended. The audit log can't be changed. Write a new audit row instead of updating an old one.

### A missing page returns status 200, not 404

This is expected with streaming. The status line goes out before the page decides it's "not found". The page content is still the 404 page, and it's marked so search engines don't index it.

### My change works in `npm run dev` but `npm run build` fails

The production build is stricter, especially about Cache Components. Read the first error carefully, fix it, and always run `npm run build` before you open a pull request.

### Weird errors in Docker after switching branches

The images are stale. Rebuild them: `docker compose up --build`. If the database schema went backwards, reset it with `docker compose down -v`.

## Glossary

| Term | Meaning |
|---|---|
| **App Router** | Next.js's folder-based routing in `src/app/` |
| **Server Component** | A React component that runs on the server and can query the database. This is the default. |
| **Client Component** | A React component that runs in the browser. The file starts with `"use client"`. |
| **Server Action** | A server function called from a form. The file starts with `"use server"`. |
| **Proxy** | `src/proxy.ts`, which runs before every request. Older Next.js versions called it "middleware". |
| **DAL** | Data access layer: `src/lib/dal.ts`, where every page gets the current user |
| **Suspense** | A React boundary that shows a fallback while what's inside it loads |
| **Cache Components** | The Next.js feature that pre-builds the static parts of pages |
| **Prisma** | The database toolkit: schema, migrations and typed queries |
| **Migration** | A SQL file that changes the database structure, kept in `prisma/migrations/` |
| **Seed** | Fake demo data loaded into an empty database |
| **Zod** | The library that validates form input |
| **Auth.js** | The login library (previously called NextAuth) |
| **JWT** | The encrypted session cookie format Auth.js uses |
| **FastAPI / Pydantic** | The Python web framework, and its validation library, used by the integration service |
