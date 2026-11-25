# Portal (Next.js)

The public-facing app. See the [root README](../README.md) for setup, demo accounts and architecture.

| Path | What it is |
|---|---|
| `prisma/schema.prisma` | Data model: users, requests, documents, internal notes, audit log |
| `prisma/migrations/` | SQL migrations, including the append-only trigger on `audit_logs` |
| `prisma/seed.ts` | Fake demo data |
| `src/auth.ts`, `src/auth.config.ts` | Auth.js setup: credentials login, JWT sessions, role claims |
| `src/proxy.ts` | Cookie-only redirect checks before each request |
| `src/lib/dal.ts` | Data access layer: loads the current user from the database and enforces roles |
| `src/lib/requests.ts` | Request queries, including who may see which requests |
| `src/lib/audit.ts` | Writes audit log entries |
| `src/lib/deadlines.ts` | Business-day response deadlines |
