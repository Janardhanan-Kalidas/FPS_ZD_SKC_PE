#!/usr/bin/env bash
# Author: Janardhanan Kalidas
# Date: 2026-10-05
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require() { [[ -n "${!1:-}" ]] || fail "Required GitLab variable $1 is not set."; }

readonly EXPECTED_BRAND_ID="36275984782609"
readonly EXPECTED_BRAND_NAME="Hilti PROFIS Engineering"
readonly RELEASE_PATTERN='^release/([0-9]+\.[0-9]+\.[0-9]+)$'

require CI_COMMIT_BRANCH
require CI_COMMIT_SHA
require ZENDESK_SUBDOMAIN
require ZENDESK_EMAIL
require ZENDESK_API_TOKEN

[[ "$CI_COMMIT_BRANCH" =~ $RELEASE_PATTERN ]] || fail "Only release/x.y.z branches may deploy to production."
[[ "${ZENDESK_BRAND_ID:-}" == "$EXPECTED_BRAND_ID" ]] || fail "Unexpected production brand ID."
[[ "${ZENDESK_BRAND_NAME:-}" == "$EXPECTED_BRAND_NAME" ]] || fail "Unexpected production brand name."
[[ "${DEPLOYMENT_TYPE:-}" == "NEW_THEME" ]] || fail "Deployment type must be NEW_THEME."
[[ "$ZENDESK_SUBDOMAIN" =~ ^[A-Za-z0-9-]+$ ]] || fail "ZENDESK_SUBDOMAIN must contain only the account subdomain."

#RELEASE_VERSION="${BASH_REMATCH[1]}"
echo "CI_COMMIT_BRANCH: $CI_COMMIT_BRANCH"
RELEASE_VERSION="${BASH_REMATCH[1]:-}"
THEME_NAME="${THEME_NAME_PREFIX} ${RELEASE_VERSION}"

cat > build.env <<EOF
RELEASE_VERSION=${RELEASE_VERSION}
THEME_NAME=${THEME_NAME}
EOF

printf 'Validated branch: %s\n' "$CI_COMMIT_BRANCH"
printf 'Production brand: %s (%s)\n' "$ZENDESK_BRAND_NAME" "$ZENDESK_BRAND_ID"
printf 'Theme name: %s\n' "$THEME_NAME"
