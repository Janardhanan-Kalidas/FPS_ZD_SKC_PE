#!/usr/bin/env bash
set -euo pipefail

# Preview the local theme working copy against a chosen Zendesk environment.
# Prompts for Production vs Sandbox, switches the active zcli profile, then
# starts the live preview server.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=tooling/scripts/lib/select-environment.sh
source "${SCRIPT_DIR}/lib/select-environment.sh"

if [[ ! -f "manifest.json" ]]; then
  echo "manifest.json not found in repository root."
  exit 1
fi

select_zendesk_environment

# zcli themes:preview binds a local HTTP server (default 4567). A leftover
# preview from an earlier run can hold that port and cause EADDRINUSE. Resolve
# a usable port: honor PREVIEW_PORT if set, else find the first free port
# starting at 4567. If a stale zcli preview is holding the chosen port, offer
# to reclaim it.

is_port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pid_on_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -n 1
}

pick_preview_port() {
  local start="${PREVIEW_PORT:-4567}"
  local p="$start"
  local max=$((start + 20))
  while (( p <= max )); do
    if ! is_port_in_use "$p"; then
      printf '%s' "$p"
      return 0
    fi
    # If the port is held by a stale zcli preview, offer to reclaim it (only
    # for the first/preferred port, and only when not explicitly overridden).
    if [[ "$p" == "$start" ]]; then
      local pid cmd
      pid="$(pid_on_port "$p")"
      cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      if [[ -n "$pid" && "$cmd" == *"zcli"*"themes:preview"* ]]; then
        echo "Port ${p} is held by a previous zcli preview (pid ${pid})." >&2
        local ans="yes"
        if [[ "${PREVIEW_RECLAIM:-ask}" == "ask" ]]; then
          read -r -p "Stop it and reuse port ${p}? (yes/no) [yes]: " ans
          ans="${ans:-yes}"
        fi
        if [[ "$ans" == "yes" ]]; then
          kill "$pid" 2>/dev/null || true
          sleep 2
          if ! is_port_in_use "$p"; then
            printf '%s' "$p"
            return 0
          fi
          echo "Port ${p} still busy after stopping pid ${pid}; trying another port." >&2
        fi
      fi
    fi
    p=$((p + 1))
  done
  echo "No free port found in range ${start}-${max}." >&2
  return 1
}

preview_port="$(pick_preview_port)" || exit 1

echo
echo "Starting theme preview for ${ZD_ENV_NAME} (${ZD_SUBDOMAIN}.zendesk.com) on port ${preview_port}..."
echo "Press Ctrl+C to stop the preview server."
echo
zcli themes:preview . --port="$preview_port"
