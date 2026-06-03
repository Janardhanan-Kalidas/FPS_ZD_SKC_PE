#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_FILE="${REPO_ROOT}/tooling/config/brand-theme-map.json"
cd "$REPO_ROOT"

if ! command -v zcli >/dev/null 2>&1; then
  echo "zcli is not installed. Run: npm install -g @zendesk/zcli"
  exit 1
fi

if [[ ! -f "manifest.json" ]]; then
  echo "manifest.json not found in repository root."
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config file not found: tooling/config/brand-theme-map.json"
  echo "Create it with brand and theme mapping before deploying."
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

get_theme_rows() {
  node - "$CONFIG_FILE" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const themes = Array.isArray(data.themes) ? data.themes : [];
for (const theme of themes) {
  const isDefault = theme.default ? 'true' : 'false';
  console.log([
    theme.key || '',
    theme.name || '',
    theme.themeId || '',
    theme.brandKey || '',
    isDefault,
  ].join('|'));
}
NODE
}

get_brand_rows() {
  node - "$CONFIG_FILE" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const brands = Array.isArray(data.brands) ? data.brands : [];
const defaultBrandKey = data.defaultBrandKey || '';
for (const brand of brands) {
  const isDefault = brand.key === defaultBrandKey ? 'true' : 'false';
  console.log([
    brand.key || '',
    brand.name || '',
    brand.brandId || '',
    isDefault,
  ].join('|'));
}
NODE
}

pick_menu_index() {
  local prompt="$1"
  local default_idx="$2"
  local max_idx="$3"
  local input=""

  while true; do
    read -r -p "$prompt [${default_idx}]: " input
    input="${input:-$default_idx}"
    if [[ "$input" =~ ^[0-9]+$ ]] && (( input >= 1 && input <= max_idx )); then
      printf '%s' "$input"
      return 0
    fi
    echo "Please enter a number between 1 and ${max_idx}."
  done
}

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

echo "Step 1/4: Auto-select current branch"
echo "Current branch: ${current_branch}"
echo "Latest commit: $(git --no-pager log -1 --pretty=format:'%h %s')"
echo

echo "Step 2/4: Zendesk theme selection"
echo "1. Use configured mapping (tooling/config/brand-theme-map.json)"
echo "2. Auto-fetch from Zendesk and type Theme ID"
echo "3. Enter Theme ID manually"
theme_source_mode="$(pick_menu_index "Choose theme source" "1" "3")"

selected_theme_key=""
selected_theme_name=""
selected_theme_id=""
selected_theme_brand_key=""

if [[ "$theme_source_mode" == "1" ]]; then
  mapfile -t THEME_ROWS < <(get_theme_rows)
  if [[ ${#THEME_ROWS[@]} -eq 0 ]]; then
    echo "No themes found in tooling/config/brand-theme-map.json"
    exit 1
  fi

  default_theme_idx=1
  for i in "${!THEME_ROWS[@]}"; do
    IFS='|' read -r theme_key theme_display_name theme_id theme_brand_key theme_is_default <<<"${THEME_ROWS[$i]}"
    echo "$((i + 1)). ${theme_display_name} | themeId=${theme_id} | brandKey=${theme_brand_key}"
    if [[ "$theme_is_default" == "true" ]]; then
      default_theme_idx=$((i + 1))
    fi
  done

  selected_theme_idx="$(pick_menu_index "Select mapped theme" "$default_theme_idx" "${#THEME_ROWS[@]}")"
  IFS='|' read -r selected_theme_key selected_theme_name selected_theme_id selected_theme_brand_key _ <<<"${THEME_ROWS[$((selected_theme_idx - 1))]}"

  if [[ -z "$selected_theme_id" || "$selected_theme_id" == "REPLACE_WITH_THEME_ID" ]]; then
    echo "Selected mapped theme is not configured with a valid themeId."
    echo "Update tooling/config/brand-theme-map.json and set themes[].themeId."
    exit 1
  fi
elif [[ "$theme_source_mode" == "2" ]]; then
  echo "Fetching themes from Zendesk..."
  zcli themes:list
  read -r -p "Enter Theme ID from the list: " selected_theme_id
  read -r -p "Enter Theme Name label (optional): " selected_theme_name
  selected_theme_name="${selected_theme_name:-Zendesk Listed Theme}"
  selected_theme_key="zendesk-listed"
  selected_theme_brand_key=""
else
  read -r -p "Enter Theme ID: " selected_theme_id
  read -r -p "Enter Theme Name label (optional): " selected_theme_name
  selected_theme_name="${selected_theme_name:-Manual Theme ID}"
  selected_theme_key="manual"
  selected_theme_brand_key=""
fi

if [[ -z "$selected_theme_id" ]]; then
  echo "Theme ID is required. Deployment cancelled."
  exit 1
fi

theme_version="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));process.stdout.write(String(m.version||'unknown'));")"
branch_key="$(echo "$current_branch" | grep -Eo 'FPSKB-[0-9]+' | head -n 1 || true)"
branch_label="${branch_key:-$current_branch}"
timestamp="$(date -u +"%y%m%d%H%M")"
default_theme_name="Hilti [SKC] - PE ${branch_label} ${theme_version} ${timestamp}"
default_theme_name="$(normalize_theme_name "$default_theme_name")"
theme_name="${ZD_THEME_NAME:-$default_theme_name}"
theme_name="$(normalize_theme_name "$theme_name")"

echo
echo "Step 3/4: Edit theme name (max ${MAX_THEME_NAME_LEN})"
read -r -p "Theme name [${theme_name}]: " input_theme_name
if [[ -n "$input_theme_name" ]]; then
  theme_name="$(normalize_theme_name "$input_theme_name")"
fi

echo
echo "Step 4/4: Choose brand option"
mapfile -t BRAND_ROWS < <(get_brand_rows)
if [[ ${#BRAND_ROWS[@]} -eq 0 ]]; then
  echo "No brands found in tooling/config/brand-theme-map.json"
  exit 1
fi

default_brand_idx=1
for i in "${!BRAND_ROWS[@]}"; do
  IFS='|' read -r brand_key brand_name brand_id brand_is_default <<<"${BRAND_ROWS[$i]}"
  echo "$((i + 1)). ${brand_name} | brandId=${brand_id} | key=${brand_key}"
  if [[ "$brand_key" == "$selected_theme_brand_key" ]]; then
    default_brand_idx=$((i + 1))
  elif [[ "$brand_is_default" == "true" && "$default_brand_idx" -eq 1 ]]; then
    default_brand_idx=$((i + 1))
  fi
done

selected_brand_idx="$(pick_menu_index "Select brand" "$default_brand_idx" "${#BRAND_ROWS[@]}")"
IFS='|' read -r selected_brand_key selected_brand_name selected_brand_id _ <<<"${BRAND_ROWS[$((selected_brand_idx - 1))]}"

if [[ -z "$selected_brand_id" ]]; then
  echo "Selected brand does not have a valid brandId."
  echo "Update tooling/config/brand-theme-map.json and set brands[].brandId."
  exit 1
fi

echo
echo "Deployment summary"
echo "Branch: ${current_branch}"
echo "Theme target: ${selected_theme_name}"
echo "Theme ID: ${selected_theme_id}"
echo "Brand: ${selected_brand_name}"
echo "Brand ID: ${selected_brand_id}"
echo "Theme name: ${theme_name}"
echo "Theme name length: ${#theme_name}/${MAX_THEME_NAME_LEN}"

if [[ -n "$selected_theme_brand_key" && "$selected_brand_key" != "$selected_theme_brand_key" ]]; then
  echo "Warning: selected brand key and theme brand key differ."
fi

read -r -p "Confirm target Theme ID '${selected_theme_id}'? (yes/no): " confirm_theme_id
if [[ "$confirm_theme_id" != "yes" ]]; then
  echo "Deployment cancelled."
  exit 1
fi

read -r -p "Proceed with deployment? (yes/no): " deploy_confirm
if [[ "$deploy_confirm" != "yes" ]]; then
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

echo "Updating existing Zendesk theme..."
zcli themes:update . --themeId="$selected_theme_id"

echo "Deployment finished for branch '${current_branch}'."
echo "Updated themeId: ${selected_theme_id}"
