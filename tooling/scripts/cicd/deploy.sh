#!/usr/bin/env bash
# Author: Janardhanan Kalidas
# Date: 2026-10-05
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require() { [[ -n "${!1:-}" ]] || fail "Required GitLab variable $1 is not set."; }
# api() {
#   curl --fail-with-body --silent --show-error --user "${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}" --header 'Accept: application/json' "$@"
# }
# api() {
#   curl --silent --show-error --user "${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}" --header 'Accept: application/json' "$@"
# }
api() {
  # encode "email/token:token_value" in Base64 without line breaks and set as auth header
  local auth_token
  auth_token=$(printf '%s/token:%s' "${ZENDESK_EMAIL}" "${ZENDESK_API_TOKEN}" | base64 | tr -d '\n')
  curl --silent --show-error \
    --header "Authorization: Basic ${auth_token}" \
    --header 'Accept: application/json' "$@"
}

[[ -f build.env ]] || fail "build.env is missing."
set -a; source build.env; set +a

require ZENDESK_EMAIL
require ZENDESK_API_TOKEN
require THEME_NAME
require THEME_ARCHIVE
require ZENDESK_SUBDOMAIN
require ZENDESK_BRAND_ID
require ZENDESK_BRAND_NAME
require DEPLOYMENT_TYPE

ARCHIVE="${THEME_ARCHIVE:-dist/theme.zip}"
[[ -s "$ARCHIVE" ]] || fail "Theme archive is missing: ${ARCHIVE}"
[[ "$ZENDESK_BRAND_ID" == "36275984782609" ]] || fail "Production brand ID safety check failed."
[[ "$DEPLOYMENT_TYPE" == "NEW_THEME" ]] || fail "Only NEW_THEME deployment is allowed."

### Set default value forDRY_RUN if it is not set
DRY_RUN="${DRY_RUN:-false}"

#### DEBUGGING: Print the values of key variables for debugging purposes
echo "DEBUG: ENVIRONMENT: $ENVIRONMENT"
echo "DEBUG: ZENDESK_SUBDOMAIN: $ZENDESK_SUBDOMAIN"
echo "DEBUG: ZENDESK_EMAIL: $ZENDESK_EMAIL"
echo "DEBUG: Token length is ${#ZENDESK_API_TOKEN}"
echo "DEBUG: ZENDESK_BRAND_ID: $ZENDESK_BRAND_ID"
echo "DEBUG: ZENDESK_BRAND_NAME: $ZENDESK_BRAND_NAME"
echo "DEBUG: DEPLOYMENT_TYPE: $DEPLOYMENT_TYPE"
echo "DEBUG: DRY_RUN: $DRY_RUN"
echo "DEBUG: THEME_NAME: $THEME_NAME"
echo "DEBUG: THEME_ARCHIVE: $THEME_ARCHIVE"
echo "DEBUG: Archive size: $(wc -c < "$ARCHIVE" | tr -d ' ') bytes"

BASE_URL="https://${ZENDESK_SUBDOMAIN}.zendesk.com"
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

### Temporary exit for debugging
echo "====== DEBUG ======"
echo "= Deploy emulated ="
echo "==================="
exit 0

IMPORT_RESPONSE="$(api   --request POST   --header 'Content-Type: application/json'   --data "{\"job\":{\"attributes\":{\"brand_id\":\"${ZENDESK_BRAND_ID}\",\"format\":\"zip\"}}}"   "${BASE_URL}/api/v2/guide/theming/jobs/themes/imports")"

JOB_ID="$(jq -er '.job.id' <<<"$IMPORT_RESPONSE")" || fail "Import response has no job ID."
THEME_ID="$(jq -er '.job.data.theme_id' <<<"$IMPORT_RESPONSE")" || fail "Import response has no theme ID."
UPLOAD_URL="$(jq -er '.job.data.upload.url' <<<"$IMPORT_RESPONSE")" || fail "Import response has no upload URL."

UPLOAD_ARGS=()
while IFS= read -r encoded; do
  key="$(printf '%s' "$encoded" | base64 -d | jq -r '.key')"
  value="$(printf '%s' "$encoded" | base64 -d | jq -r '.value')"
  UPLOAD_ARGS+=(--form-string "${key}=${value}")
done < <(jq -r '.job.data.upload.parameters | to_entries[] | @base64' <<<"$IMPORT_RESPONSE")

curl --fail-with-body --silent --show-error   --request POST   "${UPLOAD_ARGS[@]}"   --form "file=@${ARCHIVE};type=application/zip"   "$UPLOAD_URL" >/dev/null
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
