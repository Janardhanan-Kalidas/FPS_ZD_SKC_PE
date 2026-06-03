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

if [[ ! -f "manifest.json" ]]; then
  echo "manifest.json not found in repository root."
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

theme_version="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));process.stdout.write(String(m.version||'unknown'));")"
branch_key="$(echo "$current_branch" | grep -Eo 'FPSKB-[0-9]+' | head -n 1 || true)"
branch_label="${branch_key:-$current_branch}"
timestamp="$(date -u +"%Y%m%d-%H%M%SZ")"
default_theme_name="Hilti [SKC] - PE Branch Name - ${branch_label} - ${theme_version} - ${timestamp}"
theme_name="${ZD_THEME_NAME:-$default_theme_name}"

echo "Deploying current branch: ${current_branch}"
echo "Target brandId: ${BRAND_ID}"
echo "Theme name: ${theme_name}"
echo "Latest commit: $(git --no-pager log -1 --pretty=format:'%h %s')"

echo "Listing themes for reference..."
zcli themes:list

echo "Importing theme package..."
original_manifest="$(mktemp)"
cp manifest.json "$original_manifest"
restore_manifest() {
  cp "$original_manifest" manifest.json
  rm -f "$original_manifest"
}
trap restore_manifest EXIT

ZD_DEPLOY_THEME_NAME="$theme_name" node <<'NODE'
const fs = require('fs');
const path = 'manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
manifest.name = process.env.ZD_DEPLOY_THEME_NAME;
fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

zcli themes:import . --brandId="$BRAND_ID"

echo "Deployment finished for branch '${current_branch}'."
