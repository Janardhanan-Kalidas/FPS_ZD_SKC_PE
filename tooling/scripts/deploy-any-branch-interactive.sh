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

trigger_external_validation_pipeline() {
  local base_url="$1"
  local validation_environment="$2"
  local validation_source="$3"
  local gate_mode="$4"
  local validation_phase="$5"
  local deployment_type="$6"

  if [[ "${ENABLE_EXTERNAL_VALIDATION_TRIGGER:-true}" != "true" ]]; then
    echo "External validation trigger disabled by ENABLE_EXTERNAL_VALIDATION_TRIGGER."
    return 0
  fi

  local gitlab_api_url="${VALIDATION_GITLAB_API_URL:-https://git.hilti.com/api/v4}"
  local validation_project_path="${VALIDATION_PROJECT_PATH:-bu-f-ps/sw-support-group/skc_pe_deployment_validation}"
  local validation_ref="${VALIDATION_REF:-main}"
  local trigger_token="${VALIDATION_TRIGGER_TOKEN:-}"

  if [[ -z "$trigger_token" ]]; then
    echo "Skipping external validation trigger: VALIDATION_TRIGGER_TOKEN is not set."
    if [[ "$gate_mode" == "hard" ]]; then
      return 1
    fi
    return 0
  fi

  local encoded_project_path
  encoded_project_path="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$validation_project_path")"
  local trigger_url="${gitlab_api_url}/projects/${encoded_project_path}/trigger/pipeline"

  local response_file
  response_file="$(mktemp)"

  local http_code
  set +e
  http_code="$(curl -sS -o "$response_file" -w "%{http_code}" \
    -X POST "$trigger_url" \
    --form "token=${trigger_token}" \
    --form "ref=${validation_ref}" \
    --form "variables[TEST_BASE_URL]=${base_url}" \
    --form "variables[TARGET_NAME]=${validation_environment}" \
    --form "variables[VALIDATION_ENVIRONMENT]=${validation_environment}" \
    --form "variables[VALIDATION_SOURCE]=${validation_source}" \
    --form "variables[VALIDATION_GATE_MODE]=${gate_mode}" \
    --form "variables[VALIDATION_PHASE]=${validation_phase}" \
    --form "variables[VALIDATION_DEPLOYMENT_TYPE]=${deployment_type}" \
    --form "variables[VALIDATION_REF_NAME]=$(git branch --show-current)" \
    --form "variables[VALIDATION_COMMIT_SHA]=$(git rev-parse HEAD)" \
    --form "variables[DEPLOYMENT_TIMESTAMP]=$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  local curl_exit=$?
  set -e

  local pipeline_web_url=""
  pipeline_web_url="$(node - "$response_file" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
try {
  const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (payload && payload.web_url) process.stdout.write(String(payload.web_url));
} catch {
  // Ignore parse errors.
}
NODE
)"

  if [[ $curl_exit -ne 0 || "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    echo "External validation trigger failed (HTTP ${http_code})."
    cat "$response_file"
    rm -f "$response_file"
    if [[ "$gate_mode" == "hard" ]]; then
      return 1
    fi
    return 0
  fi

  rm -f "$response_file"
  echo "External validation pipeline triggered successfully."
  if [[ -n "$pipeline_web_url" ]]; then
    echo "Validation pipeline URL: ${pipeline_web_url}"
  fi

  return 0
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

test_base_url="${ZD_POST_DEPLOY_TEST_BASE_URL:-${ZD_PREVIEW_BASE_URL:-${ZD_FEATURE_PREVIEW_BASE_URL:-${ZD_PROD_BASE_URL:-}}}}"
validation_environment="preview"
validation_source="local_deploy_new_theme"
validation_gate_mode="soft"
validation_deployment_type="branch_new"

echo
echo "Triggering pre-deployment validation pipeline..."
if [[ -z "$test_base_url" ]]; then
  echo "Unable to auto-resolve deployment URL for external validation trigger."
  echo "Set one of: ZD_POST_DEPLOY_TEST_BASE_URL, ZD_PREVIEW_BASE_URL, ZD_FEATURE_PREVIEW_BASE_URL, ZD_PROD_BASE_URL"
  echo "Soft gate mode for new-theme deployment, continuing without pre-deploy trigger."
else
  echo "Auto-selected validation base URL: ${test_base_url}"
  if ! trigger_external_validation_pipeline "$test_base_url" "$validation_environment" "$validation_source" "$validation_gate_mode" "pre_deploy" "$validation_deployment_type"; then
    echo "Pre-deployment validation trigger failed in hard-gate mode."
    exit 1
  fi
fi

if [[ -n "$brand_id" ]]; then
  zcli themes:import . --brandId="$brand_id"
else
  zcli themes:import .
fi

echo
echo "Triggering post-deployment validation pipeline..."
if [[ -z "$test_base_url" ]]; then
  echo "Post-deploy validation skipped: TEST_BASE_URL could not be resolved."
else
  if ! trigger_external_validation_pipeline "$test_base_url" "$validation_environment" "$validation_source" "$validation_gate_mode" "post_deploy" "$validation_deployment_type"; then
    echo "Post-deployment validation trigger failed in hard-gate mode."
    exit 1
  fi
fi

echo "Deployment finished."
