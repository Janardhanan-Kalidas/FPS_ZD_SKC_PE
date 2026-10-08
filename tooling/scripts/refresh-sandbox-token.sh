#!/usr/bin/env bash
set -euo pipefail

# Re-mint the Sandbox OAuth access token via the client_credentials grant and
# write it into .env.local as ZD_SANDBOX_OAUTH_TOKEN.
#
# Reads from .env.local (git-ignored):
#   ZD_SANDBOX_OAUTH_CLIENT_ID  - OAuth client "Unique Identifier"
#   ZD_SANDBOX_OAUTH_SECRET     - OAuth client secret
# Subdomain comes from tooling/config/environments.json (sandbox.subdomain).
#
# Usage:
#   bash tooling/scripts/refresh-sandbox-token.sh
# Secrets are never printed.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${REPO_ROOT}/.env.local"
CONFIG_FILE="${REPO_ROOT}/tooling/config/environments.json"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env.local found at ${ENV_FILE}." >&2
  echo "Create it with ZD_SANDBOX_OAUTH_CLIENT_ID and ZD_SANDBOX_OAUTH_SECRET." >&2
  exit 1
fi

# Load secrets.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${ZD_SANDBOX_OAUTH_CLIENT_ID:-}" || -z "${ZD_SANDBOX_OAUTH_SECRET:-}" ]]; then
  echo "ZD_SANDBOX_OAUTH_CLIENT_ID and ZD_SANDBOX_OAUTH_SECRET must be set in .env.local." >&2
  exit 1
fi

# Resolve the sandbox subdomain from the environment config.
SANDBOX_SUBDOMAIN="$(node - "$CONFIG_FILE" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const env = (data.environments || []).find(e => e.key === 'sandbox');
process.stdout.write((env && env.subdomain) || '');
NODE
)"

if [[ -z "$SANDBOX_SUBDOMAIN" ]]; then
  echo "Could not resolve sandbox.subdomain from ${CONFIG_FILE}." >&2
  exit 1
fi

echo "Requesting a new OAuth token for ${SANDBOX_SUBDOMAIN}.zendesk.com (client_credentials)..."

PAYLOAD="$(ZCID="$ZD_SANDBOX_OAUTH_CLIENT_ID" ZSEC="$ZD_SANDBOX_OAUTH_SECRET" node -e "
process.stdout.write(JSON.stringify({
  grant_type: 'client_credentials',
  client_id: process.env.ZCID,
  client_secret: process.env.ZSEC,
  scope: 'read write'
}));
")"

RESP_FILE="$(mktemp)"
trap 'rm -f "$RESP_FILE"' EXIT

HTTP_CODE="$(curl -s -o "$RESP_FILE" -w '%{http_code}' --max-time 25 -X POST \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "https://${SANDBOX_SUBDOMAIN}.zendesk.com/oauth/tokens")"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Token request failed (HTTP ${HTTP_CODE})." >&2
  node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.error('error:',d.error||'(none)','-',d.error_description||d.description||'');}catch{console.error('(non-JSON response)');}" "$RESP_FILE" >&2
  exit 1
fi

NEW_TOKEN="$(node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(d.access_token||'');" "$RESP_FILE")"
if [[ -z "$NEW_TOKEN" ]]; then
  echo "Response did not contain an access_token." >&2
  exit 1
fi

# Verify the new token authenticates before persisting it.
VERIFY_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -H "Authorization: Bearer ${NEW_TOKEN}" \
  "https://${SANDBOX_SUBDOMAIN}.zendesk.com/api/v2/account/settings.json")"
if [[ "$VERIFY_CODE" != "200" ]]; then
  echo "New token did not verify (HTTP ${VERIFY_CODE}); not writing it." >&2
  exit 1
fi

# Write the token into .env.local, replacing the existing line (or appending).
NEW_TOKEN="$NEW_TOKEN" ENV_FILE="$ENV_FILE" node -e "
const fs = require('fs');
const f = process.env.ENV_FILE;
let s = fs.readFileSync(f, 'utf8');
const line = 'ZD_SANDBOX_OAUTH_TOKEN=' + process.env.NEW_TOKEN;
if (/^ZD_SANDBOX_OAUTH_TOKEN=.*$/m.test(s)) {
  s = s.replace(/^ZD_SANDBOX_OAUTH_TOKEN=.*$/m, line);
} else {
  if (!s.endsWith('\n')) s += '\n';
  s += line + '\n';
}
fs.writeFileSync(f, s);
"

echo "Sandbox OAuth token refreshed and verified (written to .env.local)."
