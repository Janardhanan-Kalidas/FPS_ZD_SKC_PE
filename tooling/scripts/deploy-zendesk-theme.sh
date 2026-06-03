#!/usr/bin/env bash
set -euo pipefail

required_env=("ZD_SUBDOMAIN" "ZD_EMAIL" "ZD_API_TOKEN" "DEPLOY_CONFIRM_REQUIRED")
for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Deploy blocked: missing required CI variable '$name'"
    exit 1
  fi
done

if [[ "${DEPLOY_CONFIRM:-}" != "${DEPLOY_CONFIRM_REQUIRED}" ]]; then
  echo "Deploy blocked: DEPLOY_CONFIRM must exactly equal '${DEPLOY_CONFIRM_REQUIRED}'."
  echo "Set DEPLOY_CONFIRM when starting the manual deploy job."
  exit 1
fi

if [[ ! -f "manifest.json" ]]; then
  echo "Deploy blocked: manifest.json not found in repository root."
  exit 1
fi

# Require at least one backup artifact generated in this pipeline before deploy.
if ! ls backups/*.zip >/dev/null 2>&1; then
  echo "Deploy blocked: no backup artifact found in backups/."
  echo "Run theme_backup_production first in the same pipeline."
  exit 1
fi

echo "Deploying current branch '${CI_COMMIT_BRANCH:-unknown}' to production Zendesk theme."

theme_version="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));process.stdout.write(String(m.version||'unknown'));")"
branch_name="${CI_COMMIT_BRANCH:-unknown}"
branch_key="$(echo "$branch_name" | grep -Eo 'FPSKB-[0-9]+' | head -n 1 || true)"
branch_label="${branch_key:-$branch_name}"
timestamp="$(date -u +"%Y%m%d-%H%M%SZ")"
default_theme_name="Hilti [SKC] - PE Branch Name - ${branch_label} - ${theme_version} - ${timestamp}"
theme_name="${ZD_THEME_NAME:-$default_theme_name}"

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

echo "Theme name for import: ${theme_name}"

# NOTE: ZCLI option names may differ by version.
# Current expected command: themes:import with credentials and theme root path.
npx zcli themes:import \
  --subdomain "${ZD_SUBDOMAIN}" \
  --username "${ZD_EMAIL}" \
  --password "${ZD_API_TOKEN}" \
  .

echo "Zendesk theme import completed successfully."
