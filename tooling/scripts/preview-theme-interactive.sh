#!/usr/bin/env bash
set -euo pipefail

# Preview the local theme working copy against a chosen Zendesk environment.
# Prompts for Production vs Sandbox, switches the active zcli profile, then
# starts the live preview server.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=tooling/scripts/lib/select-environment.sh
source "${SCRIPT_DIR}/lib/select-environment.sh"

if [[ ! -f "manifest.json" ]]; then
  echo "manifest.json not found in repository root."
  exit 1
fi

select_zendesk_environment

echo
echo "Starting theme preview for ${ZD_ENV_NAME} (${ZD_SUBDOMAIN}.zendesk.com)..."
echo "Press Ctrl+C to stop the preview server."
echo
zcli themes:preview .
