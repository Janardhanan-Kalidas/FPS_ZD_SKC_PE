#!/usr/bin/env bash
# Shared helper: prompt for a target Zendesk environment (Production vs Sandbox),
# switch the active zcli profile, and export environment details for the caller.
#
# Usage (source, do not execute):
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "${SCRIPT_DIR}/lib/select-environment.sh"
#   select_zendesk_environment            # interactive picker
#   # or honor a preset: ZD_ENV=production source + select_zendesk_environment
#
# After a successful call the following are exported:
#   ZD_ENV_KEY        e.g. production | sandbox
#   ZD_ENV_NAME       e.g. Production | Sandbox
#   ZD_SUBDOMAIN      Zendesk subdomain for the chosen environment
#   ZD_PROFILE        zcli profile name that was activated
#   ZD_BRAND_ID       default PE brandId for the chosen environment
#   ZD_BRAND_NAME     human-readable brand label

# Resolve the environment config path. Prefer values the caller already knows
# (REPO_ROOT or ZD_ENV_CONFIG_FILE); fall back to deriving it from this file's
# location. Callers that source via an absolute path get correct resolution;
# the explicit REPO_ROOT path makes it robust regardless of how we were sourced.
if [[ -z "${ZD_ENV_CONFIG_FILE:-}" ]]; then
  if [[ -n "${REPO_ROOT:-}" ]]; then
    ZD_ENV_CONFIG_FILE="${REPO_ROOT}/tooling/config/environments.json"
  else
    _SELECT_ENV_LIB_SOURCE="${BASH_SOURCE[0]}"
    _SELECT_ENV_LIB_DIR="$(cd "$(dirname "$_SELECT_ENV_LIB_SOURCE")" >/dev/null 2>&1 && pwd)"
    ZD_ENV_CONFIG_FILE="$(cd "${_SELECT_ENV_LIB_DIR}/../../.." >/dev/null 2>&1 && pwd)/tooling/config/environments.json"
  fi
fi

_env_rows() {
  node - "$ZD_ENV_CONFIG_FILE" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const envs = Array.isArray(data.environments) ? data.environments : [];
const defaultKey = data.defaultEnvironmentKey || '';
for (const env of envs) {
  console.log([
    env.key || '',
    env.name || '',
    env.subdomain || '',
    env.profile || '',
    env.brandId || '',
    env.brandName || '',
    env.email || '',
    env.key === defaultKey ? 'true' : 'false',
  ].join('|'));
}
NODE
}

select_zendesk_environment() {
  if [[ ! -f "$ZD_ENV_CONFIG_FILE" ]]; then
    echo "Environment config not found: $ZD_ENV_CONFIG_FILE" >&2
    return 1
  fi

  local rows=()
  local line
  while IFS= read -r line; do
    rows+=("$line")
  done < <(_env_rows)

  if [[ ${#rows[@]} -eq 0 ]]; then
    echo "No environments configured in $ZD_ENV_CONFIG_FILE" >&2
    return 1
  fi

  # Determine the default index and (optionally) a preset selection via ZD_ENV.
  local default_idx=1
  local preset_idx=0
  local i
  for i in "${!rows[@]}"; do
    IFS='|' read -r key name subdomain profile brand_id brand_name email is_default <<<"${rows[$i]}"
    if [[ "$is_default" == "true" ]]; then
      default_idx=$((i + 1))
    fi
    if [[ -n "${ZD_ENV:-}" && "$key" == "${ZD_ENV}" ]]; then
      preset_idx=$((i + 1))
    fi
  done

  local chosen_idx
  if [[ "$preset_idx" -gt 0 ]]; then
    chosen_idx="$preset_idx"
    echo "Environment preset via ZD_ENV=${ZD_ENV}"
  else
    echo "Choose target Zendesk environment:"
    for i in "${!rows[@]}"; do
      IFS='|' read -r key name subdomain profile brand_id brand_name email is_default <<<"${rows[$i]}"
      local marker=""
      [[ "$is_default" == "true" ]] && marker=" (default)"
      echo "$((i + 1)). ${name} | ${subdomain}.zendesk.com${marker}"
    done

    local input=""
    while true; do
      read -r -p "Select environment [${default_idx}]: " input
      input="${input:-$default_idx}"
      if [[ "$input" =~ ^[0-9]+$ ]] && (( input >= 1 && input <= ${#rows[@]} )); then
        chosen_idx="$input"
        break
      fi
      echo "Please enter a number between 1 and ${#rows[@]}."
    done
  fi

  IFS='|' read -r ZD_ENV_KEY ZD_ENV_NAME ZD_SUBDOMAIN ZD_PROFILE ZD_BRAND_ID ZD_BRAND_NAME ZD_ENV_EMAIL _ <<<"${rows[$((chosen_idx - 1))]}"
  # Only set ZD_EMAIL from config when the caller hasn't already provided one.
  if [[ -z "${ZD_EMAIL:-}" && -n "${ZD_ENV_EMAIL:-}" ]]; then
    ZD_EMAIL="$ZD_ENV_EMAIL"
  fi
  export ZD_ENV_KEY ZD_ENV_NAME ZD_SUBDOMAIN ZD_PROFILE ZD_BRAND_ID ZD_BRAND_NAME ZD_ENV_EMAIL ZD_EMAIL

  if ! command -v zcli >/dev/null 2>&1; then
    echo "zcli is not installed. Run: npm install -g @zendesk/zcli" >&2
    return 1
  fi

  # zcli profiles:use exits 0 even for a missing profile (it just prints an
  # error), so we can't rely on its exit code. Instead, check whether the
  # profile is present in `zcli profiles:list`, which is the source of truth
  # for which accounts are logged in.
  if ! _zcli_profile_exists "$ZD_PROFILE"; then
    echo "No zcli profile '${ZD_PROFILE}' is logged in for ${ZD_ENV_NAME} (${ZD_SUBDOMAIN}.zendesk.com)."
    local do_login="yes"
    # Allow non-interactive callers to opt out via ZD_AUTO_LOGIN=no.
    if [[ "${ZD_AUTO_LOGIN:-yes}" == "no" ]]; then
      do_login="no"
    else
      read -r -p "Log in now with 'zcli login -i' for ${ZD_SUBDOMAIN}? (yes/no) [yes]: " do_login
      do_login="${do_login:-yes}"
    fi

    if [[ "$do_login" != "yes" ]]; then
      echo "Cannot continue without an authenticated profile for ${ZD_ENV_NAME}." >&2
      echo "Run manually: zcli login -i   (choose subdomain ${ZD_SUBDOMAIN}), then re-run." >&2
      return 1
    fi

    echo "Starting interactive login for ${ZD_SUBDOMAIN}.zendesk.com..."
    echo "When prompted, use subdomain '${ZD_SUBDOMAIN}' (email: ${ZD_EMAIL:-your Zendesk email})."
    if ! zcli login -i; then
      echo "Login failed for ${ZD_SUBDOMAIN}." >&2
      return 1
    fi

    if ! _zcli_profile_exists "$ZD_PROFILE"; then
      echo "Logged in, but profile '${ZD_PROFILE}' still not found." >&2
      echo "Check the subdomain used during login matches '${ZD_SUBDOMAIN}'." >&2
      return 1
    fi
  fi

  echo "Switching zcli active profile to '${ZD_PROFILE}' (${ZD_ENV_NAME})..."
  zcli profiles:use "$ZD_PROFILE" >/dev/null 2>&1

  # Confirm the switch actually took effect.
  local active_now=""
  active_now="$(cat "${HOME}/.zcli" 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(String(d?.activeProfile?.subdomain||''))}catch{}" 2>/dev/null || true)"
  if [[ "$active_now" != "$ZD_PROFILE" ]]; then
    echo "Warning: active profile reads '${active_now}', expected '${ZD_PROFILE}'." >&2
  fi

  echo "Active environment: ${ZD_ENV_NAME} | subdomain=${ZD_SUBDOMAIN} | brandId=${ZD_BRAND_ID}"
  return 0
}

# Return 0 if a zcli profile with the given name is present in profiles:list.
_zcli_profile_exists() {
  local target="$1"
  local list_output=""
  list_output="$(zcli profiles:list 2>/dev/null || true)"
  # profiles:list prints one account name per row (optionally with "<= active").
  printf '%s\n' "$list_output" \
    | sed 's/<= active//' \
    | awk '{$1=$1; print}' \
    | grep -Fxq "$target"
}
