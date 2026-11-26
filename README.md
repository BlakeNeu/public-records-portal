# Public Records Request Portal

A portal for submitting and fulfilling public records requests. Citizens file requests and track their status. Clerks review, assign and release documents against a response deadline, and every action is audited.

> **Status:** in progress. The infrastructure is validated with Terraform, Checkov and LocalStack, but it is **not hosted live**. See [Cost and abuse considerations](#cost-and-abuse-considerations).

**Stack:** Next.js · TypeScript · React · PostgreSQL · Prisma · Auth.js · Python · FastAPI · Docker · Terraform · AWS (ECS Fargate, RDS, ALB, Secrets Manager) · GitHub Actions

## Architecture

The portal is the only public component. Calls to outside systems go through an internal-only Python integration service that has no public route and requires a service token.

See [docs/architecture.md](docs/architecture.md) for the diagram and security boundaries, and [docs/decisions.md](docs/decisions.md) for why it's built this way.

**New to the codebase?** Start with the [developer guide](docs/guide/README.md). It explains TypeScript, Next.js and Prisma for developers coming from PHP and React, and walks through building a feature end to end.

## Repository layout

| Path | What it is |
|---|---|
| `app/` | Next.js portal: login, roles, requests, audit log (Prisma schema and seed in `app/prisma/`) |
| `integration-service/` | Internal FastAPI service: notifications and document lookups, with retries and structured logs |
| `mock-services/` | Fake document-management system and email gateway for local development |
| `infra/terraform/` | AWS infrastructure *(planned)* |
| `.github/workflows/` | CI: tests, lint, dependency and secret scanning, Terraform checks *(planned)* |
| `docs/` | Architecture and design decisions |

## Run it locally

The only requirement is [Docker Desktop](https://www.docker.com/products/docker-desktop/). No Node.js, Python or Postgres install, and no config files.

```bash
git clone <your fork's URL> prrp
cd prrp
docker compose up --build
```

Open **http://localhost:3000** and sign in with a demo account below. The first build takes a few minutes; later starts take seconds.

On first start, a one-off `migrate` container creates the tables and loads fake demo data. Later starts keep your data. To wipe it and start fresh, run `docker compose down -v`.

Every setting has a local-only default. To change one, such as a port that's already in use, copy `.env.example` to `.env` and edit it.

### Demo accounts

Every account uses the password **`demo-password-local-only`**. All of them are fake.

| Role | Email | Can |
|---|---|---|
| Citizen | `jane.citizen@example.com` | See only their own requests |
| Citizen | `sam.resident@example.com` | See only their own requests |
| Clerk | `morgan.clerk@example.org` | See every request, with overdue ones flagged |
| Clerk | `riley.clerk@example.org` | Same as above |
| Admin | `admin@example.org` | Everything above, plus the user list |

### Developing the portal with hot reload

Requires Node.js 20+. Run the backing services in Docker and the portal on your machine:

```bash
docker compose up -d db integration-service mock-services migrate
cd app
cp .env.example .env    # set AUTH_SECRET; see docs/guide/6-cheat-sheet.md
npm install
npx prisma generate
npm run dev             # http://localhost:3000 (stop the Docker `web` service first if it's running)
```

The dev server can't reach the integration service, which only exists on Docker's private network. Features that call it need the full Docker stack.

### Tests

```bash
# Integration service (no local Python needed)
docker run --rm -v "$PWD/integration-service:/src:ro" python:3.12-slim \
  sh -c "cp -r /src /app && cd /app && pip install -q -r requirements-dev.txt && pytest -q"

# Portal
cd app && npm run lint && npx tsc --noEmit && npm run build
```

## Security notes

- **Authorization is checked next to the data, not just in the proxy.** The proxy does a cheap cookie check for redirects. Every page and server action then loads the user from the database through one data access layer (`app/src/lib/dal.ts`), so a demoted user loses access on their next request, not when their session expires.
- **Citizens can only query their own requests.** The rule lives in one place (`app/src/lib/requests.ts`) and is applied in the database query.
- **The audit log is append-only at the database level.** A Postgres trigger rejects every `UPDATE` and `DELETE` on `audit_logs`, so app bugs can't rewrite history.
- **Login doesn't leak which emails exist.** Wrong passwords and unknown emails return the same message and take the same time, because both run a bcrypt comparison.
- **No open redirects after login.** The post-login destination must be a path on this site.

## Roadmap

- [x] Integration service: auth, validation, retries, JSON logging, tests
- [x] Mock upstream systems with simulated outages
- [x] Docker Compose with isolated networks
- [x] Next.js portal: Auth.js login, citizen / clerk / admin roles
- [x] Database schema, migrations, append-only audit log, fake seed data
- [x] Request list with deadlines and overdue flags
- [ ] Request submission form and request detail page
- [ ] Clerk workflow: assign, change status, internal notes, notifications via the integration service
- [ ] Secure document uploads and release to citizens
- [x] Rate limiting (login brute force, request floods, filing caps) and security headers
- [x] Whole stack runs with one `docker compose up`
- [ ] Unit and end-to-end tests for the portal
- [ ] GitHub Actions CI
- [ ] Terraform for AWS, validated with Checkov and LocalStack
- [ ] Deployment guide, screenshots

## Deploying to real AWS

*To be written with the Terraform:* required permissions, steps, estimated monthly cost and teardown.

## Cost and abuse considerations

This project is intentionally not hosted on a personal AWS account. A public endpoint invites **denial of wallet**: abusive traffic drives up compute, data transfer and log costs, and billing alerts only notify, they don't stop the charges.

The portal limits abuse itself:

- **Sign-in:** 5 failed attempts per email address and 20 per IP in 15 minutes, counted in the audit log so the limit holds across restarts and containers. Locking out unknown emails too means a lockout doesn't reveal which accounts exist.
- **Every request:** the proxy allows 600 requests a minute per IP and 300 per signed-in user, with tighter caps on form posts (60 and 30). Over the limit it returns `429` with `Retry-After`. These counts live in each container's memory.
- **New records requests:** 10 per citizen in 24 hours.
- **Headers:** a Content Security Policy, HSTS, `nosniff`, `X-Frame-Options: DENY` and a strict referrer policy.

The in-app limits are a backstop. In a real production deployment I would add:

- AWS WAF with rate-based rules in front of the load balancer
- CloudFront for caching and absorbing traffic spikes
- AWS Budgets alerts, plus an automated action that scales services to zero past a spend limit
- Log retention limits so a traffic flood doesn't become a storage bill

## Data

All data in this repository is fake and generated for demonstration.
