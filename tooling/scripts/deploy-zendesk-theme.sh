#!/usr/bin/env bash
set -euo pipefail

required_env=("ZD_SUBDOMAIN" "ZD_EMAIL" "ZD_API_TOKEN")
for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Deploy blocked: missing required CI variable '$name'"
    exit 1
  fi
done

is_default_branch="false"
if [[ -n "${CI_DEFAULT_BRANCH:-}" && -n "${CI_COMMIT_BRANCH:-}" && "${CI_COMMIT_BRANCH}" == "${CI_DEFAULT_BRANCH}" ]]; then
  is_default_branch="true"
fi

if [[ "$is_default_branch" == "true" ]]; then
  if [[ -z "${DEPLOY_CONFIRM_REQUIRED:-}" ]]; then
    echo "Deploy blocked: missing required CI variable 'DEPLOY_CONFIRM_REQUIRED'."
    exit 1
  fi
  if [[ "${DEPLOY_CONFIRM:-}" != "${DEPLOY_CONFIRM_REQUIRED}" ]]; then
    echo "Deploy blocked: DEPLOY_CONFIRM must exactly equal '${DEPLOY_CONFIRM_REQUIRED}'."
    echo "Set DEPLOY_CONFIRM when starting the production deploy job."
    exit 1
  fi
else
  if [[ "${DEPLOY_CONFIRM_BRANCH:-}" != "DEPLOY_TO_BRANCH" ]]; then
    echo "Deploy blocked: DEPLOY_CONFIRM_BRANCH must equal 'DEPLOY_TO_BRANCH'."
    exit 1
  fi
fi

if [[ ! -f "manifest.json" ]]; then
  echo "Deploy blocked: manifest.json not found in repository root."
  exit 1
fi

MAX_THEME_NAME_LEN=50
normalize_theme_name() {
  local raw="$1"
  local name
  name="$(printf '%s' "$raw" | tr -s ' ' | sed 's/^ //; s/ $//')"
  if [[ ${#name} -gt ${MAX_THEME_NAME_LEN} ]]; then
    name="${name:0:${MAX_THEME_NAME_LEN}}"
  fi
  printf '%s' "$name"
}

# Require at least one backup artifact generated in this pipeline before production deploy.
if [[ "$is_default_branch" == "true" ]]; then
  if ! ls backups/*.zip >/dev/null 2>&1; then
    echo "Deploy blocked: no backup artifact found in backups/."
    echo "Run theme_backup_production first in the same pipeline."
    exit 1
  fi
fi

if [[ "$is_default_branch" == "true" ]]; then
  echo "Deploying current branch '${CI_COMMIT_BRANCH:-unknown}' to production Zendesk theme."
else
  echo "Deploying current branch '${CI_COMMIT_BRANCH:-unknown}' to preview Zendesk theme."
fi

deploy_mode="${DEPLOY_MODE:-new}"
deploy_mode="$(printf '%s' "$deploy_mode" | tr '[:upper:]' '[:lower:]')"
if [[ "$deploy_mode" != "new" && "$deploy_mode" != "update" ]]; then
  echo "Deploy blocked: DEPLOY_MODE must be 'new' or 'update'."
  exit 1
fi

theme_version="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));process.stdout.write(String(m.version||'unknown'));")"
branch_name="${CI_COMMIT_BRANCH:-unknown}"
branch_key="$(echo "$branch_name" | grep -Eo 'FPSKB-[0-9]+' | head -n 1 || true)"
branch_label="${branch_key:-$branch_name}"
timestamp="$(date -u +"%y%m%d%H%M")"
default_theme_name="Hilti [SKC] - PE ${branch_label} ${theme_version} ${timestamp}"
default_theme_name="$(normalize_theme_name "$default_theme_name")"
theme_name="${ZD_THEME_NAME:-$default_theme_name}"
theme_name="$(normalize_theme_name "$theme_name")"
theme_id="${ZD_THEME_ID:-}"

if [[ "$deploy_mode" == "update" && -z "$theme_id" ]]; then
  echo "Deploy blocked: ZD_THEME_ID is required when DEPLOY_MODE=update."
  exit 1
fi

original_manifest="$(mktemp)"
cp manifest.json "$original_manifest"
restore_manifest() {
  cp "$original_manifest" manifest.json
  rm -f "$original_manifest"
}
trap restore_manifest EXIT

if [[ "$deploy_mode" == "new" ]]; then
  # For new imports, set the generated/custom theme name in manifest.
  ZD_DEPLOY_THEME_NAME="$theme_name" node <<'NODE'
const fs = require('fs');
const path = 'manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
manifest.name = process.env.ZD_DEPLOY_THEME_NAME;
fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

  echo "Deploy mode: new"
  echo "Theme name for import: ${theme_name}"
  echo "Theme name length: ${#theme_name}/${MAX_THEME_NAME_LEN}"

  npx zcli themes:import \
    --subdomain "${ZD_SUBDOMAIN}" \
    --username "${ZD_EMAIL}" \
    --password "${ZD_API_TOKEN}" \
    .

  echo "Zendesk theme import completed successfully."
else
  # For updates, preserve the existing theme name in Zendesk.
  # Query the Zendesk API for the current theme name and write it to manifest
  # so zcli themes:update doesn't rename the theme.
  if [[ -n "${ZD_THEME_NAME:-}" ]]; then
    # Explicit override provided — use it.
    resolved_theme_name="$(normalize_theme_name "$ZD_THEME_NAME")"
    echo "Deploy mode: update (explicit name override: ${resolved_theme_name})"
  else
    # Resolve current theme name from Zendesk API to avoid renaming.
    resolved_theme_name=""
    api_response="$(curl -sS -u "${ZD_EMAIL}/token:${ZD_API_TOKEN}" \
      "https://${ZD_SUBDOMAIN}.zendesk.com/api/v2/guide/theming/themes/${theme_id}" 2>/dev/null || true)"
    if [[ -n "$api_response" ]]; then
      resolved_theme_name="$(printf '%s' "$api_response" | node -e "
        const fs = require('fs');
        const input = fs.readFileSync(0, 'utf8');
        try {
          const data = JSON.parse(input);
          const name = data?.theme?.name || '';
          if (name) process.stdout.write(name);
        } catch {}
      " 2>/dev/null || true)"
    fi
    if [[ -n "$resolved_theme_name" ]]; then
      resolved_theme_name="$(normalize_theme_name "$resolved_theme_name")"
      echo "Deploy mode: update (preserving existing name: ${resolved_theme_name})"
    else
      echo "Deploy mode: update (could not resolve existing name, keeping manifest name)"
    fi
  fi

  if [[ -n "$resolved_theme_name" ]]; then
    ZD_DEPLOY_THEME_NAME="$resolved_theme_name" node <<'NODE'
const fs = require('fs');
const path = 'manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
manifest.name = process.env.ZD_DEPLOY_THEME_NAME;
fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
  fi

  echo "Updating existing themeId: ${theme_id}"

  npx zcli themes:update \
    --subdomain "${ZD_SUBDOMAIN}" \
    --username "${ZD_EMAIL}" \
    --password "${ZD_API_TOKEN}" \
    --themeId "${theme_id}" \
    .

  echo "Zendesk theme update completed successfully."
fi
