#!/usr/bin/env bash
set -euo pipefail

# List existing Zendesk themes for a chosen environment (Production vs Sandbox).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=tooling/scripts/lib/select-environment.sh
source "${SCRIPT_DIR}/lib/select-environment.sh"

select_zendesk_environment

echo
echo "Themes for ${ZD_ENV_NAME} (brandId=${ZD_BRAND_ID}):"
zcli themes:list --brandId="$ZD_BRAND_ID"
