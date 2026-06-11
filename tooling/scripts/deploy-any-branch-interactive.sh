#!/usr/bin/env bash
set -euo pipefail

# Run from repository root regardless of where task is launched.
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

theme_version="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));process.stdout.write(String(m.version||'unknown'));")"

echo "Step 1/5: Current branch and local status"
current_branch="$(git branch --show-current)"
echo "Current branch: ${current_branch}"
echo

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Warning: You have uncommitted changes."
  read -r -p "Continue anyway? (yes/no): " continue_dirty
  if [[ "${continue_dirty}" != "yes" ]]; then
    echo "Deployment cancelled."
    exit 1
  fi
fi

echo
echo "Step 2/5: Choose branch to deploy"
git --no-pager branch --all --sort=-committerdate
read -r -p "Enter branch name to deploy [${current_branch}]: " selected_branch
selected_branch="${selected_branch:-$current_branch}"

if [[ "$selected_branch" != "$current_branch" ]]; then
  if git show-ref --verify --quiet "refs/heads/${selected_branch}"; then
    git checkout "$selected_branch"
  elif git show-ref --verify --quiet "refs/remotes/origin/${selected_branch}"; then
    git checkout -b "$selected_branch" "origin/${selected_branch}"
  else
    echo "Branch '${selected_branch}' does not exist locally or on origin."
    exit 1
  fi
fi

echo "Using branch: $(git branch --show-current)"
echo "Latest commit: $(git --no-pager log -1 --pretty=format:'%h %s')"

echo
echo "Step 3/5: List existing Zendesk themes (reference)"
zcli themes:list

echo
echo "Step 4/5: Choose target brand"
echo "If you leave brandId empty, zcli will ask you interactively."
read -r -p "Enter brandId (optional): " brand_id

echo
echo "Step 5/6: Choose theme name"
branch_key="$(echo "$(git branch --show-current)" | grep -Eo 'FPSKB-[0-9]+' | head -n 1 || true)"
branch_label="${branch_key:-$(git branch --show-current)}"
timestamp="$(date -u +"%Y%m%d-%H%M%SZ")"
timestamp="$(date -u +"%y%m%d%H%M")"
default_theme_name="Hilti [SKC] - PE ${branch_label} ${theme_version} ${timestamp}"
default_theme_name="$(normalize_theme_name "$default_theme_name")"
read -r -p "Enter theme name (max ${MAX_THEME_NAME_LEN} chars) [${default_theme_name}]: " theme_name
theme_name="${theme_name:-$default_theme_name}"
theme_name="$(normalize_theme_name "$theme_name")"

echo
echo "Step 6/6: Confirm deployment"
echo "Branch: $(git branch --show-current)"
if [[ -n "$brand_id" ]]; then
  echo "Brand ID: $brand_id"
else
  echo "Brand ID: interactive selection"
fi
echo "Theme name: $theme_name"
echo "Theme name length: ${#theme_name}/${MAX_THEME_NAME_LEN}"
read -r -p "Type DEPLOY to continue: " deploy_confirm
if [[ "$deploy_confirm" != "DEPLOY" ]]; then
  echo "Deployment cancelled."
  exit 1
fi

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

if [[ -n "$brand_id" ]]; then
  zcli themes:import . --brandId="$brand_id"
else
  zcli themes:import .
fi

echo "Deployment finished."
