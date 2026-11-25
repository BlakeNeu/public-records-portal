# Multi-stage build for the portal.
#   deps    - installs node_modules from the lockfile
#   build   - generates the Prisma client and builds Next.js; Compose also
#             uses this stage for the one-off migrate/seed job
#   runner  - the slim production image: standalone server only, non-root

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# The Prisma CLI (generate, migrate) checks for OpenSSL.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts needs a URL to load; nothing connects during the build.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
 && npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN useradd --system --uid 10001 nextjs
COPY --from=build --chown=nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
