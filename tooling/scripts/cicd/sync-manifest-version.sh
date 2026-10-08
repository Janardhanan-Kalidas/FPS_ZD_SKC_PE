#!/usr/bin/env bash
# Author: Janardhanan Kalidas
# Purpose: Sync the committed root manifest.json version + name to the release
#          branch version produced by validate.sh (via build.env). Idempotent:
#          makes no change when the manifest already matches.
#
# This script ONLY edits manifest.json. All git operations (commit/push back to
# the release branch) are performed by the CI job in .gitlab-ci.yml so this
# script stays unit-testable in isolation.
#
# Inputs (from build.env, written by validate.sh):
#   RELEASE_VERSION  e.g. 1.2.3   (must be strict X.Y.Z)
#   THEME_NAME       e.g. "Hilti [SKC] - PE_Theme 1.2.3"
#
# Optional:
#   MANIFEST_PATH    override path to manifest.json (default: ./manifest.json)
#   BUILD_ENV_FILE   override path to build.env     (default: ./build.env)
#
# Exit codes:
#   0  manifest updated OR already up to date (no change needed)
#   1  validation / IO error
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require() { [[ -n "${!1:-}" ]] || fail "Required variable $1 is not set."; }

MANIFEST_PATH="${MANIFEST_PATH:-manifest.json}"
BUILD_ENV_FILE="${BUILD_ENV_FILE:-build.env}"

# RELEASE_VERSION/THEME_NAME may be supplied directly (tests) or via build.env.
if [[ -z "${RELEASE_VERSION:-}" || -z "${THEME_NAME:-}" ]]; then
  [[ -f "$BUILD_ENV_FILE" ]] || fail "build.env not found at '${BUILD_ENV_FILE}' and RELEASE_VERSION/THEME_NAME not provided."
  set -a
  # shellcheck disable=SC1090
  source "$BUILD_ENV_FILE"
  set +a
fi

require RELEASE_VERSION
require THEME_NAME

[[ "$RELEASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || fail "RELEASE_VERSION must be strict semver X.Y.Z. Received: '${RELEASE_VERSION}'."

[[ -f "$MANIFEST_PATH" ]] || fail "manifest.json not found at '${MANIFEST_PATH}'."
command -v jq >/dev/null 2>&1 || fail "jq is required but not installed."

current_version="$(jq -r '.version // ""' "$MANIFEST_PATH")"
current_name="$(jq -r '.name // ""' "$MANIFEST_PATH")"

if [[ "$current_version" == "$RELEASE_VERSION" && "$current_name" == "$THEME_NAME" ]]; then
  printf 'manifest.json already at version %s and name "%s". No change needed.\n' \
    "$RELEASE_VERSION" "$THEME_NAME"
  exit 0
fi

printf 'Updating manifest.json: version %s -> %s | name "%s" -> "%s"\n' \
  "${current_version:-<none>}" "$RELEASE_VERSION" "${current_name:-<none>}" "$THEME_NAME"

tmp="$(mktemp)"
# 2-space indent and a single trailing newline are jq defaults, matching the
# repo style written by package.sh / version-theme.mjs.
jq --arg name "$THEME_NAME" --arg version "$RELEASE_VERSION" \
  '.name = $name | .version = $version' "$MANIFEST_PATH" > "$tmp"
mv "$tmp" "$MANIFEST_PATH"

printf 'manifest.json updated to version %s.\n' "$RELEASE_VERSION"
