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

| Environment | How you run it | URL |
|-------------|----------------|-----|
| **local** | `pnpm dev` with `.env` | web `http://localhost:3000`, admin `http://localhost:3001`, API `http://localhost:4000` |
| **dev** | `git push origin dev` | One App Service: **web** on the site hostname, **API** at `/api/v1` (and `api.` host if bound), **admin** on `admin.` host |
| **main** | merge / `git push origin main` | Same layout on the production App Service |

Azure uses **one** Web App. Bind extra hostnames on that same app (not new App Services):

- apex / `www` → web  
- `api.` → API  
- `admin.` → admin  

Set `WEB_URL`, `ADMIN_URL`, `API_HOST`, `ADMIN_HOST` in App settings. Until those DNS names exist, open the Azure hostname for web and `…/api/v1/health` for the API.

Do not push day-to-day work to `main`. Use `dev` for Azure Dev. Production App Service settings: `deploy/azure/env.prod.example`. Dev App Service settings: `deploy/azure/env.dev.example`.

GitHub: add secret `AZUREAPPSERVICE_PUBLISHPROFILE_PROD` and optional variables `AZURE_PROD_APP_NAME`, `AZURE_PROD_URL` when the production App Service exists.

## Deployment

Azure App Service: one resource, three hostnames (web / `api.` / `admin.`). GitHub Actions on `dev` / `main`.

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
