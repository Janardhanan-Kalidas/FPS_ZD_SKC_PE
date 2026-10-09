# Zendesk Theme CI/CD Pipeline — DevOps Guide

This document describes the GitLab CI/CD pipeline that packages and deploys the
Zendesk Guide theme in this repository. It is written for the DevOps team who
own the GitLab project, its CI/CD variables, and the Zendesk OAuth clients.

- **Scope:** the three scripts in `tooling/scripts/cicd/` — `validate.sh`,
  `package.sh`, `deploy.sh`.
- **Audience:** whoever configures GitLab CI/CD variables and the Zendesk OAuth
  clients, and anyone debugging a failed deploy.
- **Not covered here:** the local developer tooling (`zcli` login, interactive
  preview/deploy scripts in `tooling/scripts/*-interactive.sh` and
  `tooling/config/environments.json`). That is a separate, developer-facing
  workflow — see "Relationship to local tooling" at the end.

---

## 1. Overview

The pipeline deploys a Zendesk Guide theme as a **new theme** (import), in three
stages that run in order. Each stage is a plain Bash script and hands state to
the next through a generated `build.env` file plus a packaged archive.

```
┌────────────┐     build.env      ┌────────────┐   dist/theme.zip   ┌────────────┐
│ validate.sh│ ─────────────────▶ │ package.sh │ ─────────────────▶ │ deploy.sh  │
└────────────┘  RELEASE_VERSION   └────────────┘   + build.env      └────────────┘
   gatekeeper      THEME_NAME         build zip        (sourced)       mint OAuth
   branch/vars                        + manifest                      token, import
```

| Stage | Script | Responsibility | Produces |
|-------|--------|----------------|----------|
| Validate | `validate.sh` | Enforce branch rules and required variables | `build.env` (`RELEASE_VERSION`, `THEME_NAME`) |
| Package  | `package.sh`  | Build the theme archive, inject name/version into `manifest.json` | `dist/theme.zip`, `dist/manifest.json` |
| Deploy   | `deploy.sh`   | Authenticate to Zendesk, validate the brand, import/upload/poll | A new theme in the Zendesk brand |

All three scripts use `set -Eeuo pipefail` and a common pattern:
- `fail "<msg>"` prints `ERROR: <msg>` to stderr and exits 1.
- `require VARNAME` fails if the named environment variable is empty.

---

## 2. Authentication model (important)

`deploy.sh` authenticates to Zendesk using the **OAuth 2.0 client-credentials
grant**. It does **not** use API-token (`email/token:...`) basic auth.

At runtime the script:

1. Selects a per-environment OAuth client id/secret based on `ENVIRONMENT`.
2. Mints a short-lived OAuth **access token** by POSTing to
   `https://<subdomain>.zendesk.com/oauth/tokens` with
   `grant_type=client_credentials`.
3. Sends that token as `Authorization: Bearer <token>` on every Zendesk API call.

Verified request contract (Zendesk "OAuth Tokens for Grant Types"):

```
POST https://<subdomain>.zendesk.com/oauth/tokens        # note: no /api/v2 prefix
Content-Type: application/json
{
  "grant_type":    "client_credentials",
  "client_id":     "<client identifier slug>",
  "client_secret": "<client secret>",
  "scope":         "themes:write brands:read",
  "expires_in":    1800
}
→ 201 Created
{ "access_token": "...", "token_type": "bearer", ... }
```

Requirements for this grant to succeed:
- The OAuth client must be **confidential** (public clients are rejected for
  client-credentials).
- The client's allowed scopes must include `themes:write` (theme import) and
  `brands:read` (brand validation). The broad `read write` scopes also satisfy
  this.
- The OAuth client must belong to the **same Zendesk account** as the target
  `ZENDESK_SUBDOMAIN`, otherwise minting returns `invalid_client`.

> `client_id` is the OAuth client's **Identifier** (a short slug set in Admin
> Center, e.g. `fps_skc_pe_sandbox`), **not** the numeric client id and **not**
> the secret.

---

## 3. GitLab CI/CD variables

Set these under **GitLab → Settings → CI/CD → Variables**. Mark the OAuth
secrets as **Masked** and **Protected**. Never commit any secret to the repo.

### Secrets (per environment)

| Variable | Environment | Description |
|----------|-------------|-------------|
| `ZENDESK_OAUTH_CLIENT_ID_PROD` | PROD | Production OAuth client **Identifier** slug |
| `ZENDESK_OAUTH_CLIENT_SECRET_PROD` | PROD | Production OAuth client **Secret** |
| `ZENDESK_OAUTH_CLIENT_ID_SANDBOX` | SANDBOX | Sandbox OAuth client **Identifier** slug |
| `ZENDESK_OAUTH_CLIENT_SECRET_SANDBOX` | SANDBOX | Sandbox OAuth client **Secret** |

`deploy.sh` resolves which pair to use from `ENVIRONMENT`:

| `ENVIRONMENT` | Client id variable | Client secret variable |
|---------------|--------------------|------------------------|
| `PROD` | `ZENDESK_OAUTH_CLIENT_ID_PROD` | `ZENDESK_OAUTH_CLIENT_SECRET_PROD` |
| `SANDBOX` | `ZENDESK_OAUTH_CLIENT_ID_SANDBOX` | `ZENDESK_OAUTH_CLIENT_SECRET_SANDBOX` |

Any other `ENVIRONMENT` value fails fast with a clear error.

### Non-secret configuration

Provide these as CI/CD variables (or in the pipeline template). They are read by
`validate.sh`, `package.sh`, and/or `deploy.sh`:

| Variable | Used by | Example | Notes |
|----------|---------|---------|-------|
| `ENVIRONMENT` | deploy | `SANDBOX` / `PROD` | Selects the OAuth credential pair |
| `ZENDESK_SUBDOMAIN` | deploy | `help-profisengineering` | Account subdomain only (no `.zendesk.com`) |
| `ZENDESK_BRAND_ID` | validate, deploy | `36290156819345` | Target brand id |
| `ZENDESK_BRAND_NAME` | validate, deploy | `Hilti PROFIS Engineering` | Must match the brand returned by the API |
| `DEPLOYMENT_TYPE` | validate, deploy | `NEW_THEME` | Only `NEW_THEME` is allowed |
| `THEME_NAME_PREFIX` | validate | `Hilti [SKC] - PE_Theme` | Theme name is `"<prefix> <version>"` |
| `THEME_SOURCE_DIR` | package | `.` | Defaults to repo root |
| `THEME_ARCHIVE` | package, deploy | `dist/theme.zip` | Archive path |
| `DRY_RUN` | deploy | `true` / `false` | `true` validates auth + brand, then skips the import |
| `JOB_POLL_INTERVAL_SECONDS` | deploy | `5` | Import status poll interval (default 5) |
| `JOB_POLL_TIMEOUT_SECONDS` | deploy | `600` | Import poll timeout (default 600) |

### Provided by GitLab automatically

`validate.sh` requires `CI_COMMIT_BRANCH` and `CI_COMMIT_SHA`, which GitLab sets
on every pipeline run.

---

## 4. Stage details

### 4.1 `validate.sh` — gatekeeper

- Requires: `CI_COMMIT_BRANCH`, `CI_COMMIT_SHA`, `ZENDESK_SUBDOMAIN`,
  `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`, `ZENDESK_BRAND_ID`, `ZENDESK_BRAND_NAME`.
- Enforces the branch must match `release/x.y.z`.
- Enforces `DEPLOYMENT_TYPE == NEW_THEME`.
- Enforces `ZENDESK_SUBDOMAIN` is a bare subdomain (`^[A-Za-z0-9-]+$`).
- Derives `RELEASE_VERSION` from the branch (`release/0.0.6` → `0.0.6`) and
  `THEME_NAME` as `"<THEME_NAME_PREFIX> <RELEASE_VERSION>"`.
- Writes `build.env` with `RELEASE_VERSION` and `THEME_NAME`.

> Note: `validate.sh` still `require`s `ZENDESK_EMAIL` and `ZENDESK_API_TOKEN`.
> These are leftovers from the previous API-token auth model and are **not** used
> by the OAuth deploy. See "Known cleanup items".

### 4.2 `package.sh` — build the archive

- Sources `build.env`; requires `RELEASE_VERSION` and `THEME_NAME`.
- Requires `manifest.json` to exist in `THEME_SOURCE_DIR`.
- Copies theme files into `.theme-build/`, excluding `.git`, `.gitlab`,
  `scripts`, `node_modules`, `dist`, `.theme-build`, `.gitlab-ci.yml`,
  `build.env`.
- Injects `THEME_NAME` and `RELEASE_VERSION` into `.theme-build/manifest.json`
  via `jq`.
- Zips to `dist/theme.zip` and verifies the archive integrity (`unzip -t`).

### 4.3 `deploy.sh` — authenticate and import

1. Sources `build.env`; resolves the per-environment OAuth credentials.
2. Requires `THEME_NAME`, `THEME_ARCHIVE`, `ZENDESK_SUBDOMAIN`,
   `ZENDESK_BRAND_ID`, `ZENDESK_BRAND_NAME`, `DEPLOYMENT_TYPE`.
3. Verifies the archive exists and is non-empty; enforces
   `DEPLOYMENT_TYPE == NEW_THEME`.
4. Mints the OAuth access token (`mint_access_token`). Fails hard, surfacing
   Zendesk's error body, if minting fails.
5. Fetches the brand via `GET /api/v2/brands/<id>.json` and asserts the returned
   brand name matches `ZENDESK_BRAND_NAME`.
6. If `DRY_RUN=true`: prints a summary and exits 0 (no import).
7. Otherwise, performs the Zendesk theme import:
   - `POST /api/v2/guide/theming/jobs/themes/imports` → returns a job id, theme
     id, and a presigned upload URL with form parameters.
   - Uploads `dist/theme.zip` to the presigned URL as multipart form data.
   - Polls `GET /api/v2/guide/theming/jobs/<job_id>` until `completed`
     (success), `failed` (error), or timeout.

Secrets are never printed. The client id, secret, and access token are shown only
as masked `first4****last4` or by length.

---

## 5. Running a deploy

### 5.1 Via GitLab (normal path)

1. Create a `release/x.y.z` branch (e.g. `release/0.0.6`).
2. Ensure the CI/CD variables in section 3 are set for the target environment.
3. Run the pipeline. With `DRY_RUN=true`, the pipeline authenticates and validates
   the brand without importing. Set `DRY_RUN=false` for a real deploy.

### 5.2 Locally (for testing/debugging the scripts)

The scripts only need `bash`, `curl`, `jq`, and `zip`. To reproduce a run on a
workstation:

```bash
cd <repo-root>

# 1. Build the archive (writes build.env + dist/theme.zip)
cat > build.env <<'EOF'
RELEASE_VERSION="0.0.6"
THEME_NAME="Hilti [SKC] - PE_Theme local-test"
THEME_ARCHIVE="dist/theme.zip"
EOF
bash tooling/scripts/cicd/package.sh

# 2. Add the deploy inputs to build.env (SANDBOX example)
cat >> build.env <<'EOF'
ENVIRONMENT="SANDBOX"
ZENDESK_SUBDOMAIN="help-profisengineering"
ZENDESK_BRAND_ID="36290156819345"
ZENDESK_BRAND_NAME="Hilti PROFIS Engineering"
DEPLOYMENT_TYPE="NEW_THEME"
DRY_RUN="true"
EOF

# 3. Export the OAuth credentials in the shell — NEVER put these in a file
export ZENDESK_OAUTH_CLIENT_ID_SANDBOX="<real client identifier>"
export ZENDESK_OAUTH_CLIENT_SECRET_SANDBOX="<real client secret>"

# 4. Run
bash tooling/scripts/cicd/deploy.sh
```

A successful `DRY_RUN=true` run ends with:

```
Obtained OAuth access token: xxxx****xxxx (expires in 1800s)
Validated Zendesk brand: Hilti PROFIS Engineering (<brand id>)
📢 DRY_RUN is active. Skipping actual deployment.
```

> `build.env`, `dist/`, and `.theme-build/` are git-ignored. Keep OAuth
> credentials in shell exports (or a GitLab masked variable), never in a file.

---

## 6. Setting up a Zendesk OAuth client (one time, per account)

Done by a Zendesk admin, once per Zendesk account (sandbox and production each
need their own client):

1. Admin Center → **Apps and integrations → APIs → OAuth clients → Add client**.
2. Set a **Unique identifier** (this becomes `client_id`, e.g. `fps_skc_pe_sandbox`).
3. Set client **kind** to **confidential**.
4. Configure **Allowed scopes** to include at least `themes:write` and
   `brands:read` (or broad `read write`).
5. Save and copy the generated **Secret** immediately — Zendesk shows it only
   once.
6. Store the Identifier and Secret in the matching GitLab CI/CD variables
   (section 3). Rotate the secret if it is ever exposed.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `OAuth client_credentials token minting failed: {"error":"invalid_client"...}` | Wrong/placeholder client id or secret, or client not in the target account | Use the real Identifier + Secret; confirm the client belongs to `ZENDESK_SUBDOMAIN`'s account |
| `invalid_client` with real credentials | OAuth client is **public**, not confidential | Recreate/convert the client as confidential |
| `400 invalid_scope` | Client's allowed scopes exclude a requested scope | Add `themes:write` / `brands:read` (or `read write`) to the client |
| Brand GET returns `403` | Token lacks `brands:read` | Add the scope to the client |
| `Brand mismatch. Expected ... received ...` | `ZENDESK_BRAND_ID` and `ZENDESK_BRAND_NAME` don't match the account | Correct the brand id/name variables |
| `Only release/x.y.z branches may deploy` | Branch name doesn't match the release pattern | Deploy from a `release/x.y.z` branch |
| `Theme archive is missing` | `package.sh` didn't run or `THEME_ARCHIVE` path wrong | Run `package.sh`; check `THEME_ARCHIVE` |
| Deploy stops after "Deploy emulated" | Temporary debug stub in `deploy.sh` (see below) | Remove the stub for a real import |

---

## 8. Known cleanup items (not yet done)

These are intentional and documented so the next change doesn't trip over them:

- **Debug exit stub in `deploy.sh`.** After the dry-run block there is a
  `### Temporary exit for debugging` block ending in `exit 0`. A real import
  (`DRY_RUN=false`) stops there and never reaches the import/upload/poll logic.
  Remove this block to enable live deploys.
- **Verbose `DEBUG:` output** in `deploy.sh` prints masked credentials and the
  full brand response. Trim before production use.
- **Stale requires in `validate.sh`.** It still requires `ZENDESK_EMAIL` and
  `ZENDESK_API_TOKEN`, which the OAuth deploy no longer uses. They can be removed
  once confirmed unused elsewhere.
- **Commented-out safety checks.** Brand-ID assertions in `deploy.sh` and the
  strict release-regex / brand checks in `validate.sh` are commented out. Re-enable
  for production hardening.
- **`.gitlab-ci.yml`** currently includes a local template (`/theme.yml`) and sets
  `DRY_RUN: "true"`. Point it at the shared pipeline template and flip `DRY_RUN`
  when ready.

---

## 9. Relationship to local tooling

`tooling/config/environments.json` and the interactive scripts
(`tooling/scripts/*-interactive.sh`, VS Code tasks like "Zendesk: Deploy Current
Branch") are a **separate, developer-facing** workflow built on the `zcli` CLI.
That workflow uses its own auth (profile for production, an OAuth token env var
named by `tokenEnvVar` for sandbox) and is **not** used by this CI/CD pipeline.
The `tokenEnvVar` field holds the *name* of an environment variable, never a
secret value. Do not place credentials in `environments.json`.
