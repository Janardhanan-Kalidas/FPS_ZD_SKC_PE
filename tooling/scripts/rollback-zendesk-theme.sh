#!/usr/bin/env bash
set -euo pipefail

required_env=("ZD_SUBDOMAIN" "ZD_EMAIL" "ZD_API_TOKEN")
for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Rollback blocked: missing required CI variable '$name'"
    exit 1
  fi
done

if [[ -z "${ROLLBACK_CONFIRM_REQUIRED:-}" ]]; then
  echo "Rollback blocked: missing required CI variable 'ROLLBACK_CONFIRM_REQUIRED'"
  exit 1
fi

if [[ "${ROLLBACK_CONFIRM:-}" != "${ROLLBACK_CONFIRM_REQUIRED}" ]]; then
  echo "Rollback blocked: ROLLBACK_CONFIRM must exactly equal '${ROLLBACK_CONFIRM_REQUIRED}'."
  echo "Set ROLLBACK_CONFIRM when starting the rollback job."
  exit 1
fi

# Use explicit backup file if provided, otherwise choose the newest backup artifact.
backup_file="${ROLLBACK_BACKUP_FILE:-}"
if [[ -z "$backup_file" ]]; then
  backup_file="$(ls -t backups/*.zip 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Rollback blocked: backup ZIP not found."
  echo "Provide ROLLBACK_BACKUP_FILE or run theme_backup_production first."
  exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

unzip -q "$backup_file" -d "$tmp_dir"

# Find the first directory containing a manifest.json and use it as theme root.
theme_root="$(find "$tmp_dir" -type f -name manifest.json -print | head -n 1 | xargs dirname)"
if [[ -z "${theme_root:-}" || ! -f "$theme_root/manifest.json" ]]; then
  echo "Rollback blocked: extracted backup does not contain manifest.json"
  exit 1
fi

echo "Rolling back production theme using backup: $backup_file"

npx zcli themes:import \
  --subdomain "${ZD_SUBDOMAIN}" \
  --username "${ZD_EMAIL}" \
  --password "${ZD_API_TOKEN}" \
  "$theme_root"

echo "Rollback import completed successfully."
