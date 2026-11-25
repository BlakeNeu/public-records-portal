# Design decisions

Short architecture decision records. Each one covers what was chosen, what else was considered, and why.

## 1. Next.js (App Router) for the portal

- **Chosen:** one Next.js + TypeScript app that renders React and runs server actions.
- **Considered:** a React SPA with a separate Express/Fastify API.
- **Why:** auth and data loading stay on the server, so there's no public JSON API to secure, no CORS and no tokens in the browser. It's one container to deploy.

## 2. A separate, internal-only integration service

- **Chosen:** Python FastAPI service that only talks to outside systems.
- **Considered:** calling the document system and the gateway straight from Next.js.
- **Why:** third-party integrations are where retries, timeouts, payload translation and audit logging pile up. Isolating them keeps the portal simple, gives them one place to log and retry, and means upstream credentials never live in the internet-facing container. The service deliberately has no database access, so it can't become a second CRUD API.

## 3. Shared bearer token for service-to-service auth

- **Chosen:** a 32+ character secret from Secrets Manager, checked with `hmac.compare_digest`.
- **Considered:** mutual TLS, IAM-signed requests (SigV4).
- **Why:** with network isolation already in place, a shared token is enough for one caller. Mutual TLS would be the next step if more services started calling it.

## 4. Infrastructure as code that is validated but not deployed

- **Chosen:** Terraform for AWS, checked in CI with `fmt`, `validate`, `tflint`, Checkov and a LocalStack apply. Nothing is applied to a real account.
- **Why:** a public demo on a personal AWS account is a denial-of-wallet risk, since abusive traffic is billed to the owner and budget alerts only warn. See the README section "Cost and abuse considerations".
