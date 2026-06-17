#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_FILE="${REPO_ROOT}/tooling/config/brand-theme-map.json"
cd "$REPO_ROOT"

load_local_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

# Support local secret loading in VS Code task shells where direnv may not be initialized.
load_local_env_file ".env"
load_local_env_file ".env.local"

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

get_theme_rows_for_brand() {
  local target_brand_key="$1"
  node - "$CONFIG_FILE" "$target_brand_key" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const targetBrandKey = process.argv[3];
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const themes = Array.isArray(data.themes) ? data.themes : [];
for (const theme of themes) {
  const matchesBrand = !targetBrandKey || theme.brandKey === targetBrandKey;
  if (!matchesBrand) continue;
  const hasValidThemeId = theme.themeId && theme.themeId !== 'REPLACE_WITH_THEME_ID';
  if (!hasValidThemeId) continue;
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

get_theme_name_from_list_output() {
  local list_output="$1"
  local target_theme_id="$2"
  printf '%s' "$list_output" | node - "$target_theme_id" <<'NODE'
const fs = require('fs');
const targetThemeId = process.argv[2];
const input = fs.readFileSync(0, 'utf8');

const objectMatches = input.match(/\{[^}]*\}/g) || [];
for (const objectText of objectMatches) {
  const idMatch = objectText.match(/id:\s*'([^']+)'/);
  const nameMatch = objectText.match(/name:\s*'([^']+)'/);
  if (!idMatch || !nameMatch) continue;
  if (idMatch[1] === targetThemeId) {
    process.stdout.write(nameMatch[1]);
    process.exit(0);
  }
}
NODE
}

get_auto_theme_for_branch() {
  local target_brand_key="$1"
  local current_branch_name="$2"
  local current_branch_key="$3"
  node - "$CONFIG_FILE" "$target_brand_key" "$current_branch_name" "$current_branch_key" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const brandKey = process.argv[3] || '';
const branchName = process.argv[4] || '';
const branchKey = process.argv[5] || '';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const themes = Array.isArray(data.themes) ? data.themes : [];

function hasValidThemeId(theme) {
  return theme.themeId && theme.themeId !== 'REPLACE_WITH_THEME_ID';
}

function branchMatch(theme) {
  if (!hasValidThemeId(theme)) return false;
  if (brandKey && theme.brandKey !== brandKey) return false;

  if (theme.branch && theme.branch === branchName) return true;
  if (theme.branchKey && branchKey && theme.branchKey === branchKey) return true;

  if (theme.branchPattern && branchName) {
    try {
      if (new RegExp(theme.branchPattern, 'i').test(branchName)) return true;
    } catch (error) {
      // Ignore invalid regex in config entry.
    }
  }

  return false;
}

const exact = themes.find(branchMatch);
if (exact) {
  console.log([
    exact.key || '',
    exact.name || '',
    exact.themeId || '',
    exact.brandKey || '',
    'exact',
  ].join('|'));
  process.exit(0);
}

const fallback = themes.find((theme) => {
  if (!hasValidThemeId(theme)) return false;
  if (brandKey && theme.brandKey !== brandKey) return false;
  return Boolean(theme.default);
});

if (fallback) {
  console.log([
    fallback.key || '',
    fallback.name || '',
    fallback.themeId || '',
    fallback.brandKey || '',
    'default',
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

pick_yes_no() {
  local prompt="$1"
  local default_value="$2"
  local input=""

  while true; do
    read -r -p "$prompt [${default_value}]: " input
    input="${input:-$default_value}"
    input="$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')"
    if [[ "$input" == "y" || "$input" == "yes" ]]; then
      printf 'yes'
      return 0
    fi
    if [[ "$input" == "n" || "$input" == "no" ]]; then
      printf 'no'
      return 0
    fi
    echo "Please answer y/n."
  done
}

get_active_zcli_subdomain() {
  if [[ -n "${ZD_SUBDOMAIN:-}" ]]; then
    printf '%s' "${ZD_SUBDOMAIN}"
    return 0
  fi

  if [[ -n "${ZENDESK_SUBDOMAIN:-}" ]]; then
    printf '%s' "${ZENDESK_SUBDOMAIN}"
    return 0
  fi

  local zcli_state_file="${HOME}/.zcli"
  if [[ -f "$zcli_state_file" ]]; then
    local parsed_subdomain=""
    parsed_subdomain="$(node - "$zcli_state_file" <<'NODE'
const fs = require('fs');
const filePath = process.argv[2];
try {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const subdomain = data?.activeProfile?.subdomain || '';
  if (subdomain) process.stdout.write(String(subdomain));
} catch {
  // Ignore parse errors.
}
NODE
)"
    if [[ -n "$parsed_subdomain" ]]; then
      printf '%s' "$parsed_subdomain"
      return 0
    fi
  fi

  local profiles_output=""
  profiles_output="$(zcli profiles:list 2>/dev/null || true)"
  local active_subdomain=""
  active_subdomain="$(printf '%s\n' "$profiles_output" | sed -n 's/^[[:space:]]*\([^[:space:]]\+\)[[:space:]]*<= active[[:space:]]*$/\1/p' | head -n 1)"
  printf '%s' "$active_subdomain"
}

get_manifest_default_locale() {
  node -e "const fs=require('fs');try{const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));process.stdout.write(String(m.default_locale||'en-us'));}catch{process.stdout.write('en-us');}"
}

resolve_confluence_email() {
  if [[ -n "${ATLASSIAN_USER_EMAIL:-}" ]]; then
    printf '%s' "${ATLASSIAN_USER_EMAIL}"
    return 0
  fi

  local git_email=""
  git_email="$(git config --get user.email 2>/dev/null || true)"
  if [[ -n "$git_email" ]]; then
    printf '%s' "$git_email"
    return 0
  fi

  printf '%s' ""
}

resolve_confluence_api_token() {
  if [[ -n "${ATLASSIAN_API_TOKEN:-}" ]]; then
    printf '%s' "${ATLASSIAN_API_TOKEN}"
    return 0
  fi

  if ! command -v security >/dev/null 2>&1; then
    printf '%s' ""
    return 0
  fi

  local service_name="${ATLASSIAN_KEYCHAIN_SERVICE_NAME:-atlassian_api_token_hilti}"
  local account_name="${ATLASSIAN_KEYCHAIN_ACCOUNT_NAME:-${USER}}"
  local token=""
  token="$(security find-generic-password -s "$service_name" -a "$account_name" -w 2>/dev/null || true)"
  printf '%s' "$token"
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

echo "Step 2/4: Choose deployment type"
echo "1. New theme deploy (import as new Zendesk theme)"
echo "2. Update existing theme (select existing themeId)"
deploy_mode="$(pick_menu_index "Choose deploy mode" "2" "2")"

theme_version="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));process.stdout.write(String(m.version||'unknown'));")"
branch_key="$(echo "$current_branch" | grep -Eo 'FPSKB-[0-9]+' | head -n 1 || true)"
branch_label="${branch_key:-$current_branch}"
timestamp="$(date -u +"%y%m%d%H%M")"
default_theme_name="Hilti [SKC] - PE ${branch_label} ${theme_version} ${timestamp}"
default_theme_name="$(normalize_theme_name "$default_theme_name")"
theme_name="$default_theme_name"
theme_name_is_custom="false"

echo
if [[ "$deploy_mode" == "1" ]]; then
  echo "Step 3/4: Edit theme name (max ${MAX_THEME_NAME_LEN})"
  read -r -p "Theme name [${theme_name}]: " input_theme_name
  if [[ -n "$input_theme_name" ]]; then
    theme_name="$(normalize_theme_name "$input_theme_name")"
    theme_name_is_custom="true"
  fi
else
  echo "Step 3/4: Theme name is locked in update mode (no rename prompts)"
fi

echo
echo "Step 4/4: Choose brand option"
BRAND_ROWS=()
while IFS= read -r line; do
  BRAND_ROWS+=("$line")
done < <(get_brand_rows)
if [[ ${#BRAND_ROWS[@]} -eq 0 ]]; then
  echo "No brands found in tooling/config/brand-theme-map.json"
  exit 1
fi

selected_theme_brand_key=""
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

selected_theme_key=""
selected_theme_name=""
selected_theme_id=""
selected_theme_brand_key=""
resolved_update_theme_name=""

if [[ "$deploy_mode" == "2" ]]; then
  echo
  echo "Update mode: auto-resolve theme from branch, then confirm"
  echo "Listing existing Zendesk themes for reference..."
  ZENDESK_THEME_LIST_OUTPUT="$(zcli themes:list --brandId="$selected_brand_id" 2>&1 || true)"
  echo "$ZENDESK_THEME_LIST_OUTPUT"

  auto_theme_row="$(get_auto_theme_for_branch "$selected_brand_key" "$current_branch" "$branch_key" || true)"
  if [[ -n "$auto_theme_row" ]]; then
    IFS='|' read -r auto_theme_key auto_theme_name auto_theme_id auto_theme_brand_key auto_theme_match <<<"$auto_theme_row"
    if [[ -n "$auto_theme_id" ]]; then
      echo
      echo "Auto-resolved theme from branch '${current_branch}':"
      echo "Theme target: ${auto_theme_name}"
      echo "Theme ID: ${auto_theme_id}"
      echo "Match type: ${auto_theme_match}"
      read -r -p "Use this auto-resolved theme? (yes/no): " use_auto_theme
      if [[ "$use_auto_theme" == "yes" ]]; then
        selected_theme_key="$auto_theme_key"
        selected_theme_name="$auto_theme_name"
        selected_theme_id="$auto_theme_id"
        selected_theme_brand_key="$auto_theme_brand_key"
      fi
    fi
  fi

  if [[ -z "$selected_theme_id" ]]; then
    BRAND_THEME_ROWS=()
    while IFS= read -r line; do
      BRAND_THEME_ROWS+=("$line")
    done < <(get_theme_rows_for_brand "$selected_brand_key")
    if [[ ${#BRAND_THEME_ROWS[@]} -gt 0 ]]; then
      echo
      echo "Configured existing theme IDs for selected brand:"
      default_theme_idx=1
      for i in "${!BRAND_THEME_ROWS[@]}"; do
        IFS='|' read -r theme_key theme_display_name theme_id theme_brand_key theme_is_default <<<"${BRAND_THEME_ROWS[$i]}"
        echo "$((i + 1)). ${theme_display_name} | themeId=${theme_id}"
        if [[ "$theme_is_default" == "true" ]]; then
          default_theme_idx=$((i + 1))
        fi
      done
      echo "0. Enter themeId manually"

      while true; do
        read -r -p "Select existing theme [${default_theme_idx}]: " selected_theme_idx
        selected_theme_idx="${selected_theme_idx:-$default_theme_idx}"

        if [[ "$selected_theme_idx" == "0" ]]; then
          read -r -p "Enter existing themeId: " selected_theme_id
          selected_theme_name="Manual themeId"
          selected_theme_key="manual"
          selected_theme_brand_key="$selected_brand_key"
          break
        fi

        if [[ "$selected_theme_idx" =~ ^[0-9]+$ ]] && (( selected_theme_idx >= 1 && selected_theme_idx <= ${#BRAND_THEME_ROWS[@]} )); then
          IFS='|' read -r selected_theme_key selected_theme_name selected_theme_id selected_theme_brand_key _ <<<"${BRAND_THEME_ROWS[$((selected_theme_idx - 1))]}"
          break
        fi

        echo "Please choose a valid option."
      done
    else
      read -r -p "Enter existing themeId to update: " selected_theme_id
      read -r -p "Enter theme label (optional): " selected_theme_name
      selected_theme_name="${selected_theme_name:-Manual themeId}"
      selected_theme_key="manual"
      selected_theme_brand_key="$selected_brand_key"
    fi
  fi

  if [[ -z "$selected_theme_id" ]]; then
    echo "Theme ID is required for update mode. Deployment cancelled."
    exit 1
  fi

  resolved_update_theme_name="$(get_theme_name_from_list_output "$ZENDESK_THEME_LIST_OUTPUT" "$selected_theme_id" || true)"
  if [[ -z "$resolved_update_theme_name" && -n "$selected_theme_name" && "$selected_theme_name" != "Manual themeId" ]]; then
    resolved_update_theme_name="$selected_theme_name"
  fi
  resolved_update_theme_name="$(normalize_theme_name "$resolved_update_theme_name")"
fi

echo
echo "Deployment summary"
echo "Branch: ${current_branch}"
echo "Brand: ${selected_brand_name}"
echo "Brand ID: ${selected_brand_id}"

if [[ "$deploy_mode" == "1" ]]; then
  echo "Deploy mode: New theme deploy (import)"
  echo "Theme name: ${theme_name}"
  echo "Theme name length: ${#theme_name}/${MAX_THEME_NAME_LEN}"
else
  echo "Deploy mode: Update existing theme"
  if [[ -n "$resolved_update_theme_name" ]]; then
    echo "Theme name: preserved from existing Zendesk theme (${resolved_update_theme_name})"
  else
    echo "Theme name: unchanged (kept from existing Zendesk theme)"
  fi
  echo "Theme target: ${selected_theme_name}"
  echo "Theme ID: ${selected_theme_id}"
fi

if [[ "$deploy_mode" == "2" && -n "$selected_theme_brand_key" && "$selected_brand_key" != "$selected_theme_brand_key" ]]; then
  echo "Warning: selected brand key and theme brand key differ."
fi

if [[ "$deploy_mode" == "2" ]]; then
  read -r -p "Confirm target Theme ID '${selected_theme_id}'? (yes/no): " confirm_theme_id
  if [[ "$confirm_theme_id" != "yes" ]]; then
    echo "Deployment cancelled."
    exit 1
  fi
fi

set_theme_live_choice="$(pick_yes_no "Set theme live after deployment? (y/n)" "n")"

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

if [[ "$deploy_mode" == "1" ]]; then
  ZD_DEPLOY_THEME_NAME="$theme_name" node <<'NODE'
const fs = require('fs');
const path = 'manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
manifest.name = process.env.ZD_DEPLOY_THEME_NAME;
fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
elif [[ "$deploy_mode" == "2" && -n "$resolved_update_theme_name" ]]; then
  ZD_DEPLOY_THEME_NAME="$resolved_update_theme_name" node <<'NODE'
const fs = require('fs');
const path = 'manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
manifest.name = process.env.ZD_DEPLOY_THEME_NAME;
fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
fi

if [[ "$deploy_mode" == "1" ]]; then
  echo "Importing as a new Zendesk theme..."
  zcli themes:import . --brandId="$selected_brand_id"
else
  echo "Updating existing Zendesk theme..."
  zcli themes:update . --themeId="$selected_theme_id"
fi

if [[ "$set_theme_live_choice" == "yes" ]]; then
  live_theme_id="${selected_theme_id:-}"
  if [[ -z "$live_theme_id" ]]; then
    read -r -p "Enter themeId to publish live: " live_theme_id
  fi

  if [[ -z "$live_theme_id" ]]; then
    echo "No themeId provided for publish. Skipping live publish."
  else
    echo "Publishing themeId '${live_theme_id}' as live..."
    zcli themes:publish --themeId="$live_theme_id"
    selected_theme_id="$live_theme_id"
  fi
fi

echo
echo "Running automated post-deployment tests..."
test_profile="manual-on-demand"
if [[ "$set_theme_live_choice" == "yes" ]]; then
  test_profile="production"
fi

playwright_visible_choice="${ZD_PLAYWRIGHT_VISIBLE:-}"
if [[ -z "$playwright_visible_choice" ]]; then
  playwright_visible_choice="$(pick_yes_no "Open visible browser for Playwright tests? (y/n)" "n")"
fi

playwright_headless="true"
if [[ "$playwright_visible_choice" == "yes" ]]; then
  playwright_headless="false"
fi

echo "Playwright browser mode: $([[ "$playwright_headless" == "false" ]] && echo "visible" || echo "headless")"

test_base_url="${ZD_POST_DEPLOY_TEST_BASE_URL:-}"
if [[ -z "$test_base_url" ]]; then
  if [[ "$test_profile" == "production" ]]; then
    test_base_url="${ZD_PROD_BASE_URL:-${ZD_PREVIEW_BASE_URL:-${ZD_FEATURE_PREVIEW_BASE_URL:-}}}"
  else
    test_base_url="${ZD_PREVIEW_BASE_URL:-${ZD_FEATURE_PREVIEW_BASE_URL:-${ZD_PROD_BASE_URL:-}}}"
  fi
fi

if [[ -z "$test_base_url" ]]; then
  zcli_subdomain="$(get_active_zcli_subdomain)"
  if [[ -n "$zcli_subdomain" ]]; then
    manifest_locale="$(get_manifest_default_locale)"
    test_base_url="https://${zcli_subdomain}.zendesk.com/hc/${manifest_locale}"
  fi
fi

if [[ -z "$test_base_url" ]]; then
  echo "Unable to auto-resolve test base URL."
  echo "Set one of: ZD_POST_DEPLOY_TEST_BASE_URL, ZD_PREVIEW_BASE_URL, ZD_FEATURE_PREVIEW_BASE_URL, ZD_PROD_BASE_URL"
  echo "or run 'zcli login -i' so the active subdomain can be auto-detected."
  exit 1
fi

echo "Auto-selected test base URL: ${test_base_url}"

safe_target_name="$(echo "$current_branch" | tr '/ ' '--' | tr -cd '[:alnum:]_-')"
run_id="manual-post-deploy-$(date -u +%Y%m%d%H%M%S)"
report_dir="tooling/reports/${run_id}"
mkdir -p "$report_dir"

deployment_report="${report_dir}/${safe_target_name}-deployment.json"
functional_report="${report_dir}/${safe_target_name}-functional-playwright.json"
performance_report="${report_dir}/${safe_target_name}-performance.json"

set +e
node tooling/scripts/run-deployment-tests.mjs \
  --target-name "$safe_target_name" \
  --base-url "$test_base_url" \
  --output "$deployment_report"
deployment_exit=$?

PLAYWRIGHT_HEADLESS="$playwright_headless" node tooling/scripts/run-playwright-functional-tests.mjs \
  --target-name "$safe_target_name" \
  --profile "$test_profile" \
  --base-url "$test_base_url" \
  --output "$functional_report"
functional_exit=$?

PLAYWRIGHT_HEADLESS="$playwright_headless" node tooling/scripts/run-performance-tests.mjs \
  --target-name "$safe_target_name" \
  --base-url "$test_base_url" \
  --output "$performance_report"
performance_exit=$?
set -e

echo "Post-deployment reports:"
echo "- ${deployment_report}"
echo "- ${functional_report}"
echo "- ${performance_report}"

tests_failed="false"
if [[ $deployment_exit -ne 0 || $functional_exit -ne 0 || $performance_exit -ne 0 ]]; then
  tests_failed="true"
  echo "Post-deployment tests failed."
else
  echo "Post-deployment tests passed."
fi

publish_confluence_choice="$(pick_yes_no "Publish Confluence result pages now? (y/n)" "n")"
if [[ "$publish_confluence_choice" == "yes" ]]; then
  quality_report="${report_dir}/${safe_target_name}-quality-gate.json"
  confluence_result="${report_dir}/${safe_target_name}-confluence-result.json"

  QUALITY_REPORT_PATH="$quality_report" \
  TARGET_NAME="$safe_target_name" \
  BASE_URL="$test_base_url" \
  CURRENT_BRANCH="$current_branch" \
  node --input-type=commonjs <<'NODE'
const fs = require('fs');
const path = require('path');

const reportPath = process.env.QUALITY_REPORT_PATH;
const targetName = process.env.TARGET_NAME;
const baseUrl = process.env.BASE_URL;
const branch = process.env.CURRENT_BRANCH;

const reportDir = path.dirname(reportPath);
const deployment = JSON.parse(fs.readFileSync(path.join(reportDir, `${targetName}-deployment.json`), 'utf8'));
const functional = JSON.parse(fs.readFileSync(path.join(reportDir, `${targetName}-functional-playwright.json`), 'utf8'));
const performance = JSON.parse(fs.readFileSync(path.join(reportDir, `${targetName}-performance.json`), 'utf8'));

const failed =
  (deployment?.summary?.failed || 0) > 0 ||
  (functional?.summary?.failed || 0) > 0 ||
  (performance?.summary?.failed || 0) > 0;

const payload = {
  generatedAt: new Date().toISOString(),
  environmentName: 'manual-post-deploy',
  targetName,
  baseUrl,
  branch,
  commit: 'local',
  pipelineUrl: '',
  failed,
  quality: {
    deployment,
    functional,
    performance,
  },
};

fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`);
NODE

  confluence_base_url="${ATLASSIAN_BASE_URL:-https://hilti.atlassian.net}"
  confluence_space_key="${CONFLUENCE_SPACE_KEY:-BFS}"
  confluence_parent_page_id="${CONFLUENCE_PARENT_PAGE_ID:-2900984544}"

  resolved_atlassian_email="$(resolve_confluence_email)"
  resolved_atlassian_token="$(resolve_confluence_api_token)"

  if [[ -z "$resolved_atlassian_email" || -z "$resolved_atlassian_token" ]]; then
    echo "Skipping Confluence publish: missing Atlassian credentials."
    echo "Checked: ATLASSIAN_USER_EMAIL, git user.email, ATLASSIAN_API_TOKEN, macOS Keychain."
    echo "Tip: save token in Keychain with: security add-generic-password -s atlassian_api_token_hilti -a ${USER} -w"
  else
    echo "Publishing Confluence functional/performance pages..."
    ATLASSIAN_BASE_URL="$confluence_base_url" \
    ATLASSIAN_USER_EMAIL="$resolved_atlassian_email" \
    ATLASSIAN_API_TOKEN="$resolved_atlassian_token" \
    CONFLUENCE_SPACE_KEY="$confluence_space_key" \
    CONFLUENCE_PARENT_PAGE_ID="$confluence_parent_page_id" \
    REQUIRE_CONFLUENCE_REPORT="false" \
    node tooling/scripts/publish-confluence-report.mjs \
      --report-file "$quality_report" \
      --output "$confluence_result"

    echo "Confluence publish result: ${confluence_result}"
  fi
fi

if [[ "$tests_failed" == "true" ]]; then
  echo "Deployment completed, but post-deployment tests failed."
  exit 1
fi

echo "Deployment finished for branch '${current_branch}'."
if [[ "$deploy_mode" == "2" ]]; then
  echo "Updated themeId: ${selected_theme_id}"
fi
