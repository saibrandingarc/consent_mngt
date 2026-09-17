# Auth0 setup

Auth0 handles **sign-up / sign-in** for the **web** (user portal) and **admin** (org console). Both apps share the same Auth0 application (`consent_mngt`). After login, each app exchanges the Auth0 ID token for CMP JWT tokens via the API.

## Architecture

```text
User → Web or Admin (Auth0 login) → /auth/sync → API /auth/auth0/callback → CMP JWT
```

| Component | Auth0 role |
|-----------|----------------|
| **Web** (`apps/web`) | User portal — dashboard, settings, onboarding |
| **Admin** (`apps/admin`) | Org console — domains, users, audit logs |
| **API** (`apps/api`) | Verifies Auth0 ID tokens (JWKS) — needs domain + client ID only |

---

## Step 1 — Create Auth0 application

1. Sign in to [Auth0 Dashboard](https://manage.auth0.com/)
2. **Applications** → **Create Application**
3. Name: `CMP Admin`
4. Type: **Regular Web Application**
5. **Create**

Copy from the **Settings** tab:

- **Domain** → `AUTH0_DOMAIN` (e.g. `dev-xxxxx.us.auth0.com`)
- **Client ID** → `AUTH0_CLIENT_ID`
- **Client Secret** → `AUTH0_CLIENT_SECRET`

---

## Step 2 — Application URLs (Auth0 Dashboard)

Open **Applications** → **consent_mngt** → **Settings**.

**Production** — add **both** web and admin URLs (comma-separated on each line):

| Setting | Value |
|---------|--------|
| **Allowed Callback URLs** | `https://consent-management-web-414895350436.us-central1.run.app/auth/callback`, `https://consent-management-admin-414895350436.us-central1.run.app/auth/callback` |
| **Allowed Logout URLs** | `https://consent-management-web-414895350436.us-central1.run.app`, `https://consent-management-admin-414895350436.us-central1.run.app` |
| **Allowed Web Origins** | `https://consent-management-web-414895350436.us-central1.run.app`, `https://consent-management-admin-414895350436.us-central1.run.app` |

**Local** — add:

```text
http://localhost:3000/auth/callback
http://localhost:3000
http://localhost:3001/auth/callback
http://localhost:3001
```

**Azure Dev** — add:

```text
https://consentmngtdev-gtfgamd4c9b4bbcr.eastus2-01.azurewebsites.net/auth/callback
https://consentmngtdev-gtfgamd4c9b4bbcr.eastus2-01.azurewebsites.net
```

**Azure production** — add the production hostname the same way (see `deploy/azure/env.prod.example`).

Click **Save Changes**.

---

## Step 3 — Generate AUTH0_SECRET

Session encryption secret for the admin app (32+ bytes hex):

```bash
openssl rand -hex 32
```

Save as `AUTH0_SECRET`.

---

## Step 4 — Environment variables

### Web (`consent-management-web`)

| Variable | Where | Example |
|----------|--------|---------|
| `AUTH0_DOMAIN` | Env var | Auth0 tenant domain |
| `CM_AUTH0_CLIENT_ID` | **Secret Manager** | CMP-dedicated Auth0 app client ID |
| `CM_AUTH0_CLIENT_SECRET` | **Secret Manager** | CMP-dedicated Auth0 app client secret |
| `AUTH0_SECRET` | **Secret Manager** | `openssl rand -hex 32` |
| `APP_BASE_URL` | Env var | `https://consent-management-web-414895350436.us-central1.run.app` |

### Admin (`consent-management-admin`)

| Variable | Where | Example |
|----------|--------|---------|
| `AUTH0_DOMAIN` | Env var | `dev-xxxxx.us.auth0.com` |
| `AUTH0_CLIENT_ID` | Env var | `abc123...` |
| `AUTH0_CLIENT_SECRET` | **Secret Manager** | (from Auth0) |
| `AUTH0_SECRET` | **Secret Manager** | `openssl rand -hex 32` |
| `APP_BASE_URL` | Env var | `https://consent-management-admin-414895350436.us-central1.run.app` |
| `NEXT_PUBLIC_AUTH0_DOMAIN` | Env var | same as `AUTH0_DOMAIN` |
| `NEXT_PUBLIC_API_URL` | **Build arg** (Docker) | `https://consent-management-api-414895350436.us-central1.run.app/api/v1` |

### API (`consent-management-api`)

| Variable | Where | Example |
|----------|--------|---------|
| `AUTH0_DOMAIN` | Env var | `dev-xxxxx.us.auth0.com` |
| `AUTH0_CLIENT_ID` | Env var | same Client ID as admin |
| `AUTH0_ISSUER_URL` | Env var (optional) | `https://dev-xxxxx.us.auth0.com/` |

The API does **not** need `AUTH0_CLIENT_SECRET` or `AUTH0_SECRET`.

---

## Step 5 — Secret Manager (GCP)

```bash
gcloud config set project myweb-503314

# Client secret from Auth0 dashboard
echo -n "YOUR_AUTH0_CLIENT_SECRET" | gcloud secrets create AUTH0_CLIENT_SECRET --data-file=-

# Session secret
openssl rand -hex 32 | gcloud secrets create AUTH0_SECRET --data-file=-

# Grant Cloud Run access
PROJECT_NUMBER=$(gcloud projects describe myweb-503314 --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for S in CM_AUTH0_CLIENT_ID CM_AUTH0_CLIENT_SECRET AUTH0_SECRET; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## Step 6 — Cloud Run (admin service)

**Console:** Cloud Run → `consent-management-admin` → Edit → Variables & Secrets

**Env vars:**

```text
NODE_ENV=production
APP_BASE_URL=https://consent-management-admin-414895350436.us-central1.run.app
AUTH0_DOMAIN=YOUR_TENANT.us.auth0.com
AUTH0_CLIENT_ID=YOUR_CLIENT_ID
NEXT_PUBLIC_AUTH0_DOMAIN=YOUR_TENANT.us.auth0.com
```

**Secrets:**

```text
CM_AUTH0_CLIENT_ID → CM_AUTH0_CLIENT_ID:latest
CM_AUTH0_CLIENT_SECRET → CM_AUTH0_CLIENT_SECRET:latest
AUTH0_SECRET → AUTH0_SECRET:latest
```

**gcloud:**

```bash
gcloud run services update consent-management-admin \
  --region us-central1 \
  --set-env-vars="NODE_ENV=production,APP_BASE_URL=https://consent-management-admin-414895350436.us-central1.run.app,AUTH0_DOMAIN=YOUR_TENANT.us.auth0.com,AUTH0_CLIENT_ID=YOUR_CLIENT_ID,NEXT_PUBLIC_AUTH0_DOMAIN=YOUR_TENANT.us.auth0.com" \
  --set-secrets="AUTH0_CLIENT_SECRET=AUTH0_CLIENT_SECRET:latest,AUTH0_SECRET=AUTH0_SECRET:latest"
```

Rebuild the admin image with the API URL baked in:

```bash
docker build -f docker/Dockerfile.admin \
  --build-arg NEXT_PUBLIC_API_URL=https://consent-management-api-414895350436.us-central1.run.app/api/v1 \
  --build-arg AUTH0_DOMAIN=YOUR_TENANT.us.auth0.com \
  -t admin .
```

Or set `_NEXT_PUBLIC_API_URL` and `_AUTH0_DOMAIN` on your Cloud Build admin trigger.

---

## Step 7 — Cloud Run (API service)

Add Auth0 env vars to the API (same domain + client ID):

```bash
gcloud run services update consent-management-api \
  --region us-central1 \
  --update-env-vars="AUTH0_DOMAIN=YOUR_TENANT.us.auth0.com,AUTH0_CLIENT_ID=YOUR_CLIENT_ID,AUTH0_ISSUER_URL=https://YOUR_TENANT.us.auth0.com/"
```

---

## Step 8 — Test

1. Open admin: `https://consent-management-admin-414895350436.us-central1.run.app/login`
2. Click **Sign in with Auth0** (or register via Auth0)
3. After redirect, you should land on `/dashboard` or `/onboarding`
4. API health: `https://consent-management-api-414895350436.us-central1.run.app/api/v1/health`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Callback URL mismatch` | Add **both** web and admin `/auth/callback` URLs in Auth0 (see Step 2). The exact URL is shown in the Auth0 error — it must match character-for-character. |
| `AUTH0_NOT_CONFIGURED` | Set all four admin env vars + secrets |
| Login works but sync fails | Check API has `AUTH0_DOMAIN` + `AUTH0_CLIENT_ID`; API must be running |
| `USE_AUTH0` on email login | Expected when Auth0 is enabled — use Auth0 button |
| CORS errors | Set `ADMIN_URL` on API to admin Cloud Run URL |

---

## Local `.env`

```bash
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SECRET=$(openssl rand -hex 32)
AUTH0_ISSUER_URL=https://your-tenant.us.auth0.com/
APP_BASE_URL=http://localhost:3001
```

Restart `pnpm dev:admin` and `pnpm dev:api` after changes.
