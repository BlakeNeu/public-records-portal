# Public Records Request Portal

A portal for submitting and fulfilling public records requests. Citizens file requests and track their status. Clerks review, assign and release documents against a response deadline, and every action is audited.

> **Status:** in progress. The infrastructure is validated with Terraform, Checkov and LocalStack, but it is **not hosted live**. See [Cost and abuse considerations](#cost-and-abuse-considerations).

**Stack:** Next.js · TypeScript · React · PostgreSQL · Prisma · Auth.js · Python · FastAPI · Docker · Terraform · AWS (ECS Fargate, RDS, ALB, Secrets Manager) · GitHub Actions

## Architecture

The portal is the only public component. Calls to outside systems go through an internal-only Python integration service that has no public route and requires a service token.

See [docs/architecture.md](docs/architecture.md) for the diagram and security boundaries, and [docs/decisions.md](docs/decisions.md) for why it's built this way.

## Repository layout

| Path | What it is |
|---|---|
| `app/` | Next.js portal *(coming next)* |
| `integration-service/` | Internal FastAPI service: notifications and document lookups, with retries and structured logs |
| `mock-services/` | Fake document-management system and email gateway for local development |
| `infra/terraform/` | AWS infrastructure *(planned)* |
| `.github/workflows/` | CI: tests, lint, dependency and secret scanning, Terraform checks *(planned)* |
| `docs/` | Architecture and design decisions |

## Run it locally

Requirements: Docker Desktop.

```bash
cp .env.example .env
# set SERVICE_TOKEN in .env:
python -c "import secrets; print(secrets.token_urlsafe(48))"
docker compose up --build
```

### Integration service tests

```bash
cd integration-service
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

## Roadmap

- [x] Integration service: auth, validation, retries, JSON logging, tests
- [x] Mock upstream systems with simulated outages
- [x] Docker Compose with isolated networks
- [ ] Next.js portal: Auth.js login, citizen / clerk / admin roles
- [ ] Request submission, clerk dashboard, status workflow, deadlines
- [ ] Audit log and secure document uploads
- [ ] GitHub Actions CI
- [ ] Terraform for AWS, validated with Checkov and LocalStack
- [ ] Deployment guide, screenshots

## Deploying to real AWS

*To be written with the Terraform:* required permissions, steps, estimated monthly cost and teardown.

## Cost and abuse considerations

This project is intentionally not hosted on a personal AWS account. A public endpoint invites **denial of wallet**: abusive traffic drives up compute, data transfer and log costs, and billing alerts only notify, they don't stop the charges.

In a real production deployment I would add:

- AWS WAF with rate-based rules in front of the load balancer
- CloudFront for caching and absorbing traffic spikes
- AWS Budgets alerts, plus an automated action that scales services to zero past a spend limit
- Log retention limits so a traffic flood doesn't become a storage bill

## Data

All data in this repository is fake and generated for demonstration.
