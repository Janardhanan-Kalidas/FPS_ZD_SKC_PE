#!/usr/bin/env bash
set -euo pipefail

# Fast deploy for current branch using a fixed brand ID.
# Override default by exporting ZD_BRAND_ID before running.
DEFAULT_BRAND_ID="36275984782609"
BRAND_ID="${ZD_BRAND_ID:-$DEFAULT_BRAND_ID}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v zcli >/dev/null 2>&1; then
  echo "zcli is not installed. Run: npm install -g @zendesk/zcli"
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ -z "$current_branch" ]]; then
  echo "Unable to detect current git branch."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Deployment blocked: uncommitted changes detected."
  echo "Commit or stash changes, then run again."
  exit 1
fi

echo "Deploying current branch: ${current_branch}"
echo "Target brandId: ${BRAND_ID}"
echo "Latest commit: $(git --no-pager log -1 --pretty=format:'%h %s')"

echo "Listing themes for reference..."
zcli themes:list

echo "Importing theme package..."
zcli themes:import . --brandId="$BRAND_ID"

echo "Deployment finished for branch '${current_branch}'."
