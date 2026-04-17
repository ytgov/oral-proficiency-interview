# OPI Web Tool

Oral Proficiency Interview Web Application — a secure, operational web tool for running OPI assessments during active assessment cycles.

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite + Vue Router + Pinia + Tailwind
- **Backend**: NestJS + Fastify + Prisma
- **Database**: Microsoft SQL Server 2022
- **Audio Storage**: Local filesystem or S3-compatible (MinIO locally, AWS S3 in production)
- **Authentication**: Auth0 (JWT + JWKS) with RBAC; mock-auth mode for local development
- **API Docs**: Swagger at `/api/docs`

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env files and set values
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start local infrastructure (SQL Server + MinIO)
docker-compose up -d

# Run database migrations
pnpm db:migrate

# Seed initial data
pnpm db:seed

# Start API + Web in dev mode
pnpm dev
```

## Project Structure

```
opi-web-tool/
├── apps/
│   ├── api/              # NestJS backend (Fastify + Prisma)
│   │   ├── prisma/       # Schema, migrations, seed
│   │   └── src/modules/  # Feature modules (see below)
│   └── web/              # Vue 3 frontend
├── packages/
│   └── shared/           # Shared TypeScript types and constants
├── docker-compose.yml         # Local dev infrastructure
└── docker-compose.dokploy.yml # Production (Dokploy) stack
```

### API Modules

`assessments`, `assignments`, `audio`, `audit`, `auth`, `class-summary`, `classes`, `cycles`, `dashboard`, `data-warehouse`, `evaluator`, `ingestion`, `reports`, `retention`, `scheduling`, `students`, `users`

## Local Development Endpoints

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:3000 |
| API Swagger | http://localhost:3000/api/docs |
| SQL Server | localhost:1433 (SA password: `OpiDev2026!`) |
| MinIO (S3) | http://localhost:9000 (console: http://localhost:9001) |

## Scripts

```bash
pnpm dev              # Run API + Web in dev mode
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm format           # Format with Prettier
pnpm typecheck        # TypeScript type-check across all packages
pnpm test             # Unit tests
pnpm test:e2e         # Playwright end-to-end tests
pnpm test:e2e:headed  # Playwright with visible browser
pnpm test:e2e:ui      # Playwright UI mode
pnpm db:migrate       # Apply Prisma migrations
pnpm db:seed          # Seed initial data
```

## Key Features

- **Assessment lifecycle**: start, complete, reopen, mark absent, re-evaluate, flag for review
- **Audio recording & upload**: in-browser recording (MediaRecorder) + file upload, with server-side MP3 transcoding via FFmpeg
- **Role-Based Access Control**: `ADMIN`, `COORDINATOR`, `EVALUATOR`, `PENDING` roles with route and field-level enforcement
- **Audit trail**: assessment audit log, manual edit log, system audit log, and ingestion log — queryable via `/audit/system` for a unified history
- **Data retention & purge**: configurable per-cycle retention with fully audited cycle resets
- **Exports & reports**: `/reports/progress` and `/reports/export` (JSON + CSV), with embedded per-assessment audit history
- **M2M API access**: scope-based auth (e.g., `reports:export`) for machine-to-machine integrations
- **Scheduling**: per-school assessment date scheduling (single + bulk) with audit logging
- **Data warehouse**: staging + batch ingestion for archival and historical analysis

## Environment Variables

### API (`apps/api/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQL Server connection string |
| `DB_ENCRYPT` | Set to `true` in production to encrypt the DB connection |
| `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_AUDIENCE` | Auth0 API audience (JWT `aud` claim) |
| `AUTH0_ISSUER` | Auth0 issuer URL (typically `https://${AUTH0_DOMAIN}/`) |
| `AUTH_MOCK` | Set to `true` to bypass Auth0 locally (uses `X-Mock-User-Id` header) |
| `AUDIO_STORAGE_PROVIDER` | `local` or `s3` |
| `AUDIO_S3_ENDPOINT` / `AUDIO_S3_BUCKET` / `AUDIO_S3_ACCESS_KEY` / `AUDIO_S3_SECRET_KEY` | S3/MinIO credentials |
| `AUDIO_S3_TLS_REJECT_UNAUTHORIZED` | Set `false` only for local self-signed certs |
| `MAX_AUDIO_MB` | Max upload size (default: `25`) |
| `FFMPEG_BIN` / `FFMPEG_PATH` | Override FFmpeg binary path |

### Web (`apps/web/.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base URL (e.g., `http://localhost:3000/api/v1`) |
| `VITE_AUTH0_DOMAIN` | Auth0 tenant domain |
| `VITE_AUTH0_CLIENT_ID` | Auth0 SPA client ID |
| `VITE_AUTH0_AUDIENCE` | Auth0 API audience |
| `VITE_AUTH_MODE` | `auth0` or `mock` |

