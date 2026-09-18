# Consent Management Platform

Multi-tenant consent management platform by **saibrandingarc**.

## Stack

| Layer | Choice |
|-------|--------|
| Apps | Next.js 15 (`web`, `admin`), NestJS (`api`) |
| Data | Microsoft SQL Server + Prisma |
| Auth | Email/password, JWT access + refresh tokens |
| Monorepo | pnpm + Turborepo |

## Repository layout

```text
apps/web          Public marketing site
apps/admin        Admin dashboard
apps/api          NestJS REST API
packages/*        Shared libraries (@cmp/*)
```

## Getting started

```bash
pnpm install
cp .env.example .env

# Start SQL Server (creates the `cmp` database)
docker compose up -d

pnpm db:generate
pnpm db:migrate
pnpm db:seed

pnpm dev:api     # http://localhost:4000/api/v1
pnpm dev:admin   # http://localhost:3001
pnpm dev:web     # http://localhost:3000
```

## Environments

| Environment | How you run it | URLs |
|-------------|----------------|------|
| **local** | `pnpm dev` with `.env` | web `:3000`, admin `:3001`, API `:4000` |
| **dev** | `git push origin dev` | **three** App Services: web, API, admin |
| **main** | `git push origin main` | three production App Services |

Local stays one repo. Azure is three Node 22 Linux Web Apps (not one host proxy):

| App | Default name (dev) | Start |
|-----|--------------------|-------|
| Public site | `consentmngtdev` | `node start-next.js` |
| API | `consentmngtdev-api` | `node dist/main.js` |
| Admin | `consentmngtdev-admin` | `node start-next.js` |

Create the API and admin App Services in the same resource group. Download each publish profile into GitHub secrets:

- `AZUREAPPSERVICE_PUBLISHPROFILE_WEB_DEV` (or the existing `AZUREAPPSERVICE_PUBLISHPROFILE_27B5213FF5AB4DDBB652DE4F7F0C857A`)
- `AZUREAPPSERVICE_PUBLISHPROFILE_API_DEV`
- `AZUREAPPSERVICE_PUBLISHPROFILE_ADMIN_DEV`

Optional repo variables: `AZURE_DEV_WEB_URL`, `AZURE_DEV_API_URL`, `AZURE_DEV_ADMIN_URL`, `AZURE_DEV_WEB_APP`, `AZURE_DEV_API_APP`, `AZURE_DEV_ADMIN_APP`.

Set Auth0 callback URLs on **each** Next app origin (`/auth/callback`). Point web/admin `NEXT_PUBLIC_API_URL` at the API host `/api/v1`. On the API app set `WEB_URL` and `ADMIN_URL` for CORS.

App settings templates: `deploy/azure/env.dev.example` and `deploy/azure/env.prod.example`. Do not push day-to-day work to `main`.

## Deployment

Azure App Service: **three** Web Apps (web / api / admin). GitHub Actions on `dev` / `main`.

Google Cloud (optional): [`deploy/README.md`](./deploy/README.md). Auth0: [`docs/AUTH0-SETUP.md`](./docs/AUTH0-SETUP.md).

## Sprint 1 — Foundation (Complete)

- Multi-tenant organizations (create, update, soft-delete, permanent delete)
- Email/password authentication with verification, reset, lockout, login history
- RBAC with 8 roles and 13 permissions
- Audit logging with search and CSV export
- User invite and role management
- Onboarding wizard
- Public marketing site (`apps/web`)

See [`docs/SPRINT-01-IMPLEMENTATION.md`](./docs/SPRINT-01-IMPLEMENTATION.md).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run all apps |
| `pnpm dev:web` | Public site |
| `pnpm dev:admin` | Admin dashboard |
| `pnpm dev:api` | API server |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all tests |
| `pnpm db:migrate` | Run migrations (dev) |
| `pnpm db:migrate:deploy` | Run migrations (production) |
| `pnpm db:seed` | Seed roles and permissions |
