#!/usr/bin/env bash
# Author: Janardhanan Kalidas
# Date: 2026-10-05
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require() { [[ -n "${!1:-}" ]] || fail "Required GitLab variable $1 is not set."; }

# ---------------------------------------------------------------------------
# Authentication: Zendesk OAuth client-credentials grant.
#
# The pipeline supplies OAuth client credentials (confidential client), not an
# API token. We mint a short-lived OAuth access token at runtime and send it as
# a Bearer token on every API call.
#
# Verified Zendesk contract (developer.zendesk.com, OAuth Tokens for Grant Types):
#   POST https://{subdomain}.zendesk.com/oauth/tokens      (note: NO /api/v2 prefix)
#   Content-Type: application/json
#   Body: {"grant_type":"client_credentials","client_id":"<id>",
#          "client_secret":"<secret>","scope":"themes:write brands:read",
#          "expires_in":<seconds>}
#   Success: 201 Created -> { "access_token": "...", "token_type": "bearer", ... }
#   The client credentials grant requires a confidential client and needs no
#   user authorization. Scope "themes:write" covers Guide theme imports;
#   "brands:read" covers the brand validation GET below.
# ---------------------------------------------------------------------------

# ACCESS_TOKEN is populated by mint_access_token() before any api() call.
ACCESS_TOKEN=""

# api(): authenticated Zendesk API call using the minted OAuth Bearer token.
### --fail-with-body is not supported in the current curl version in runtime image used.
# api() {
#   curl --fail-with-body --silent --show-error \
#     --header "Authorization: Bearer ${ACCESS_TOKEN}" \
#     --header 'Accept: application/json' "$@"
# }

api() {
  curl --silent --show-error \
    --header "Authorization: Bearer ${ACCESS_TOKEN}" \
    --header 'Accept: application/json' "$@"
}

[[ -f build.env ]] || fail "build.env is missing."
set -a; source build.env; set +a

# ---------------------------------------------------------------------------
# Per-environment OAuth client credential selection.
# ENVIRONMENT selects which GitLab CI variables hold the client credentials:
#   PROD    -> ZENDESK_OAUTH_CLIENT_ID_PROD    / ZENDESK_OAUTH_CLIENT_SECRET_PROD
#   SANDBOX -> ZENDESK_OAUTH_CLIENT_ID_SANDBOX / ZENDESK_OAUTH_CLIENT_SECRET_SANDBOX
# ---------------------------------------------------------------------------

### Will do it in the pipeline template.
# require ENVIRONMENT
# case "$ENVIRONMENT" in
#   PROD)    CLIENT_ID_VAR="ZENDESK_OAUTH_CLIENT_ID_PROD";    CLIENT_SECRET_VAR="ZENDESK_OAUTH_CLIENT_SECRET_PROD" ;;
#   SANDBOX) CLIENT_ID_VAR="ZENDESK_OAUTH_CLIENT_ID_SANDBOX"; CLIENT_SECRET_VAR="ZENDESK_OAUTH_CLIENT_SECRET_SANDBOX" ;;
#   *)       fail "Unknown ENVIRONMENT '${ENVIRONMENT}'. Expected 'PROD' or 'SANDBOX'." ;;
# esac

# # Resolve the selected credentials via indirect expansion (set -u safe).
# ZENDESK_OAUTH_CLIENT_ID="${!CLIENT_ID_VAR:-}"
# ZENDESK_OAUTH_CLIENT_SECRET="${!CLIENT_SECRET_VAR:-}"
# [[ -n "$ZENDESK_OAUTH_CLIENT_ID" ]]     || fail "Required GitLab variable ${CLIENT_ID_VAR} is not set."
# [[ -n "$ZENDESK_OAUTH_CLIENT_SECRET" ]] || fail "Required GitLab variable ${CLIENT_SECRET_VAR} is not set."

require DEPLOYMENT_TYPE
require THEME_NAME
require THEME_ARCHIVE
require ZENDESK_BRAND_ID
require ZENDESK_BRAND_NAME
require ZENDESK_OAUTH_CLIENT_ID
require ZENDESK_OAUTH_CLIENT_SECRET
require ZENDESK_SUBDOMAIN

THEME_NAME="${THEME_NAME}_${CI_JOB_ID}"

ARCHIVE="${THEME_ARCHIVE:-dist/theme.zip}"
[[ -s "$ARCHIVE" ]] || fail "Theme archive is missing: ${ARCHIVE}"
# [[ "$ZENDESK_BRAND_ID" == "36275984782609" ]] || fail "Production brand ID safety check failed."
[[ "$DEPLOYMENT_TYPE" == "NEW_THEME" ]] || fail "Only NEW_THEME deployment is allowed."

### Set default value forDRY_RUN if it is not set
DRY_RUN="${DRY_RUN:-false}"

#### DEBUGGING: Print the values of key variables for debugging purposes
# Mask the client id/secret: show only first4****last4, never the full value.
CLIENT_ID_MASKED="${ZENDESK_OAUTH_CLIENT_ID:0:4}****${ZENDESK_OAUTH_CLIENT_ID: -4}"
echo "DEBUG: ENVIRONMENT: $ENVIRONMENT"
echo "DEBUG: ZENDESK_SUBDOMAIN: $ZENDESK_SUBDOMAIN"
#echo "DEBUG: OAuth client id var: $CLIENT_ID_VAR"
echo "DEBUG: OAuth client id: $CLIENT_ID_MASKED"
echo "DEBUG: OAuth client secret length: ${#ZENDESK_OAUTH_CLIENT_SECRET}"
echo "DEBUG: ZENDESK_BRAND_ID: $ZENDESK_BRAND_ID"
echo "DEBUG: ZENDESK_BRAND_NAME: $ZENDESK_BRAND_NAME"
echo "DEBUG: DEPLOYMENT_TYPE: $DEPLOYMENT_TYPE"
echo "DEBUG: DRY_RUN: $DRY_RUN"
echo "DEBUG: THEME_NAME: $THEME_NAME"
echo "DEBUG: THEME_ARCHIVE: $THEME_ARCHIVE"
echo "DEBUG: Archive size: $(wc -c < "$ARCHIVE" | tr -d ' ') bytes"

BASE_URL="https://${ZENDESK_SUBDOMAIN}.zendesk.com"

# ---------------------------------------------------------------------------
# mint_access_token(): exchange the OAuth client credentials for a short-lived
# Bearer access token via the client_credentials grant. Fails hard (no silent
# fallback) if minting fails or the client is not permitted to use this grant.
# Never prints the client secret or the resulting access token.
# ---------------------------------------------------------------------------
mint_access_token() {
  local scope="themes:write brands:read"
  local expires_in=1800
  local payload
  payload="$(jq -n \
    --arg gt "client_credentials" \
    --arg id "$ZENDESK_OAUTH_CLIENT_ID" \
    --arg secret "$ZENDESK_OAUTH_CLIENT_SECRET" \
    --arg scope "$scope" \
    --argjson expires_in "$expires_in" \
    '{grant_type:$gt, client_id:$id, client_secret:$secret, scope:$scope, expires_in:$expires_in}')"

  local response
  # Do not use --fail-with-body here so we can surface Zendesk's JSON error body.
  response="$(curl --silent --show-error \
    --request POST \
    --header 'Content-Type: application/json' \
    --header 'Accept: application/json' \
    --data "$payload" \
    "${BASE_URL}/oauth/tokens")" || fail "Token request to Zendesk failed (network/curl error)."

  ACCESS_TOKEN="$(jq -er '.access_token' <<<"$response" 2>/dev/null || true)"
  if [[ -z "$ACCESS_TOKEN" || "$ACCESS_TOKEN" == "null" ]]; then
    local err
    err="$(jq -c '{error: (.error // "unknown"), description: (.error_description // .description // "")}' <<<"$response" 2>/dev/null || printf '%s' "$response")"
    fail "OAuth client_credentials token minting failed: ${err}"
  fi

  local token_masked="${ACCESS_TOKEN:0:4}****${ACCESS_TOKEN: -4}"
  printf 'Obtained OAuth access token: %s (expires in %ss)\n' "$token_masked" "$expires_in"
}

mint_access_token

BRAND_RESPONSE="$(api "${BASE_URL}/api/v2/brands/${ZENDESK_BRAND_ID}.json")"

### DEBUGGING: Print the brand response for debugging purposes
echo "DEBUG: Brand response: $BRAND_RESPONSE"

ACTUAL_BRAND="$(jq -er '.brand.name' <<<"$BRAND_RESPONSE")" || fail "Unable to read Zendesk brand response."
[[ "$ACTUAL_BRAND" == "$ZENDESK_BRAND_NAME" ]] || fail "Brand mismatch. Expected '${ZENDESK_BRAND_NAME}', received '${ACTUAL_BRAND}'."
printf 'Validated Zendesk brand: %s (%s)\n' "$ACTUAL_BRAND" "$ZENDESK_BRAND_ID"

# CHECK DRY_RUN: 
if [[ "$DRY_RUN" == "true" ]]; then
  echo "=================================================="
  echo "📢 DRY_RUN is active. Skipping actual deployment."
  echo "=================================================="
  echo "Target Subdomain : ${ZENDESK_SUBDOMAIN}"
  echo "Base URL         : ${BASE_URL}"
  echo "Brand ID         : ${ZENDESK_BRAND_ID}"
  echo "Brand Name       : ${ACTUAL_BRAND}"
  echo "Deployment Type  : ${DEPLOYMENT_TYPE}"
  echo "Theme Name       : ${THEME_NAME:-Not set (will use archive defaults)}"
  echo "Archive Path     : ${ARCHIVE}"
  echo "Archive Size     : $(wc -c < "$ARCHIVE" | tr -d ' ') bytes"
  echo "=================================================="
  exit 0
fi

IMPORT_RESPONSE="$(api   --request POST   --header 'Content-Type: application/json'   --data "{\"job\":{\"attributes\":{\"brand_id\":\"${ZENDESK_BRAND_ID}\",\"format\":\"zip\"}}}"   "${BASE_URL}/api/v2/guide/theming/jobs/themes/imports")"
echo "DEBUG: IMPORT_RESPONSE: $IMPORT_RESPONSE"

JOB_ID="$(jq -er '.job.id' <<<"$IMPORT_RESPONSE")" || fail "Import response has no job ID."
THEME_ID="$(jq -er '.job.data.theme_id' <<<"$IMPORT_RESPONSE")" || fail "Import response has no theme ID."
UPLOAD_URL="$(jq -er '.job.data.upload.url' <<<"$IMPORT_RESPONSE")" || fail "Import response has no upload URL."

UPLOAD_ARGS=()
while IFS= read -r encoded; do
  key="$(printf '%s' "$encoded" | base64 -d | jq -r '.key')"
  value="$(printf '%s' "$encoded" | base64 -d | jq -r '.value')"
  UPLOAD_ARGS+=(--form-string "${key}=${value}")
done < <(jq -r '.job.data.upload.parameters | to_entries[] | @base64' <<<"$IMPORT_RESPONSE")

# curl --fail-with-body --silent --show-error   --request POST   "${UPLOAD_ARGS[@]}"   --form "file=@${ARCHIVE};type=application/zip"   "$UPLOAD_URL" >/dev/null
curl --silent --show-error   --request POST   "${UPLOAD_ARGS[@]}"   --form "file=@${ARCHIVE};type=application/zip"   "$UPLOAD_URL" >/dev/null
printf 'Uploaded theme archive for job %s.\n' "$JOB_ID"

INTERVAL="${JOB_POLL_INTERVAL_SECONDS:-5}"
TIMEOUT="${JOB_POLL_TIMEOUT_SECONDS:-600}"
ELAPSED=0
while (( ELAPSED < TIMEOUT )); do
  STATUS_RESPONSE="$(api "${BASE_URL}/api/v2/guide/theming/jobs/${JOB_ID}")"
  STATUS="$(jq -er '.job.status' <<<"$STATUS_RESPONSE")" || fail "Unable to read import status."
  printf 'Import status: %s\n' "$STATUS"
  case "$STATUS" in
    completed)
      printf 'Deployment successful. Theme: %s | Theme ID: %s\n' "$THEME_NAME" "$THEME_ID"
      exit 0
      ;;
    failed)
      ERRORS="$(jq -c '.job.errors // []' <<<"$STATUS_RESPONSE")"
      fail "Zendesk import failed: ${ERRORS}"
      ;;
    pending) ;;
    *) fail "Unexpected import status: ${STATUS}" ;;
  esac
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done
fail "Import job did not complete within ${TIMEOUT} seconds."
