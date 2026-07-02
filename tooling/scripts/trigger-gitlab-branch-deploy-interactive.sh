#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

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

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd"
    exit 1
  fi
}

derive_project_path_from_remote() {
  local remote_url
  remote_url="$(git config --get remote.origin.url || true)"

  if [[ -z "$remote_url" ]]; then
    return 0
  fi

  # Supports URLs like:
  # - ssh://host:7999/group/subgroup/repo.git
  # - git@host:group/subgroup/repo.git
  if [[ "$remote_url" == ssh://* ]]; then
    local without_scheme="${remote_url#ssh://}"
    local path_part="${without_scheme#*/}"
    printf '%s' "${path_part%.git}"
    return 0
  fi

  if [[ "$remote_url" == *:*/* ]]; then
    local path_part="${remote_url#*:}"
    printf '%s' "${path_part%.git}"
    return 0
  fi
}

list_remote_branches() {
  git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes/origin \
    | sed 's#^origin/##' \
    | grep -v '^HEAD$' \
    | awk '!seen[$0]++'
}

require_command git
require_command curl
require_command node

if [[ ! -f "manifest.json" ]]; then
  echo "manifest.json not found in repository root."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Warning: You have uncommitted changes."
  read -r -p "Continue anyway? (yes/no): " continue_dirty
  if [[ "$continue_dirty" != "yes" ]]; then
    echo "Cancelled."
    exit 1
  fi
fi

gitlab_api_url="${GITLAB_API_URL:-https://git.hilti.com/api/v4}"
gitlab_project_path="${GITLAB_PROJECT_PATH:-$(derive_project_path_from_remote)}"
gitlab_ref="${GITLAB_TRIGGER_REF:-}"
gitlab_trigger_token="${GITLAB_TRIGGER_TOKEN:-}"

if [[ -z "$gitlab_project_path" ]]; then
  echo "Unable to derive GitLab project path."
  echo "Set GITLAB_PROJECT_PATH, e.g. bu-f-ps/sw-support-group/fps_zd_skc_pe"
  exit 1
fi

if [[ -z "$gitlab_trigger_token" ]]; then
  echo "Missing required variable: GITLAB_TRIGGER_TOKEN"
  echo "Set it in your shell, .env, or .env.local before running this task."
  exit 1
fi

echo "Step 1/4: Select branch"
BRANCHES=()
while IFS= read -r line; do
  BRANCHES+=("$line")
done < <(list_remote_branches)

if [[ ${#BRANCHES[@]} -eq 0 ]]; then
  echo "No remote branches found under origin/."
  exit 1
fi

default_branch_idx=1
current_branch="$(git branch --show-current || true)"
for i in "${!BRANCHES[@]}"; do
  b="${BRANCHES[$i]}"
  echo "$((i + 1)). ${b}"
  if [[ -n "$current_branch" && "$b" == "$current_branch" ]]; then
    default_branch_idx=$((i + 1))
  fi
done

branch_idx="$(pick_menu_index "Choose branch" "$default_branch_idx" "${#BRANCHES[@]}")"
selected_branch="${BRANCHES[$((branch_idx - 1))]}"
echo "Selected branch: ${selected_branch}"

echo
echo "Step 2/4: Choose deployment type"
echo "1. New theme deploy (import as new Zendesk theme)"
echo "2. Update existing theme (requires themeId)"
deploy_mode_choice="$(pick_menu_index "Choose deploy mode" "1" "2")"

deploy_mode="new"
theme_name=""
theme_id=""

theme_version="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));process.stdout.write(String(m.version||'unknown'));")"
branch_key="$(echo "$selected_branch" | grep -Eo 'FPSKB-[0-9]+' | head -n 1 || true)"
branch_label="${branch_key:-$selected_branch}"
timestamp="$(date -u +"%y%m%d%H%M")"
default_theme_name="Hilti [SKC] - PE ${branch_label} ${theme_version} ${timestamp}"
default_theme_name="$(normalize_theme_name "$default_theme_name")"

echo
if [[ "$deploy_mode_choice" == "1" ]]; then
  deploy_mode="new"
  echo "Step 3/4: Theme name (auto-generated, max ${MAX_THEME_NAME_LEN})"
  read -r -p "Theme name [${default_theme_name}]: " input_theme_name
  theme_name="${input_theme_name:-$default_theme_name}"
  theme_name="$(normalize_theme_name "$theme_name")"
  echo "Theme name length: ${#theme_name}/${MAX_THEME_NAME_LEN}"
else
  deploy_mode="update"
  echo "Step 3/4: Existing theme ID"
  read -r -p "Enter themeId to update: " theme_id
  if [[ -z "$theme_id" ]]; then
    echo "themeId is required for update mode."
    exit 1
  fi
fi

echo
echo "Step 4/4: Confirm and trigger GitLab pipeline"
echo "GitLab API URL: ${gitlab_api_url}"
echo "Project path: ${gitlab_project_path}"
echo "Branch: ${selected_branch}"
echo "Deploy mode: ${deploy_mode}"
if [[ "$deploy_mode" == "new" ]]; then
  echo "Theme name: ${theme_name}"
else
  echo "Theme ID: ${theme_id}"
fi
read -r -p "Proceed? (yes/no): " proceed
if [[ "$proceed" != "yes" ]]; then
  echo "Cancelled."
  exit 1
fi

encoded_project_path="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$gitlab_project_path")"
trigger_url="${gitlab_api_url}/projects/${encoded_project_path}/trigger/pipeline"

trigger_ref="$selected_branch"
if [[ -n "$gitlab_ref" ]]; then
  trigger_ref="$gitlab_ref"
fi

response_file="$(mktemp)"
set +e
http_code="$(curl -sS -o "$response_file" -w "%{http_code}" \
  -X POST "$trigger_url" \
  --form "token=${gitlab_trigger_token}" \
  --form "ref=${trigger_ref}" \
  --form "variables[DEPLOY_CONFIRM_BRANCH]=DEPLOY_TO_BRANCH" \
  --form "variables[DEPLOY_MODE]=${deploy_mode}" \
  --form "variables[ZD_THEME_NAME]=${theme_name}" \
  --form "variables[ZD_THEME_ID]=${theme_id}")"
curl_exit=$?
set -e

if [[ $curl_exit -ne 0 || "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
  echo "Failed to trigger pipeline (HTTP ${http_code})."
  cat "$response_file"
  rm -f "$response_file"
  exit 1
fi

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

rm -f "$response_file"
echo "GitLab pipeline triggered successfully."
if [[ -n "$pipeline_web_url" ]]; then
  echo "Pipeline URL: ${pipeline_web_url}"
fi
