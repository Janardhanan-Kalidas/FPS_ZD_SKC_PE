#!/usr/bin/env bash
set -euo pipefail

# Required variables for Zendesk API backup export.
required_env=("ZD_SUBDOMAIN" "ZD_EMAIL" "ZD_API_TOKEN" "ZD_THEME_ID")
for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Backup failed: missing required CI variable '$name'"
    exit 1
  fi
done

mkdir -p backups

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
backup_file="backups/theme-${ZD_THEME_ID}-backup-${timestamp}.zip"
meta_file="backups/theme-${ZD_THEME_ID}-backup-${timestamp}.json"

# Zendesk Guide theming API endpoint for downloading a theme archive.
url="https://${ZD_SUBDOMAIN}.zendesk.com/api/v2/guide/theming/themes/${ZD_THEME_ID}/download"

echo "Creating backup for theme ${ZD_THEME_ID} from ${ZD_SUBDOMAIN}.zendesk.com"
curl --fail --silent --show-error --location \
  --user "${ZD_EMAIL}/token:${ZD_API_TOKEN}" \
  "$url" \
  --output "$backup_file"

cat > "$meta_file" <<EOF
{
  "theme_id": "${ZD_THEME_ID}",
  "subdomain": "${ZD_SUBDOMAIN}",
  "created_at_utc": "${timestamp}",
  "git_branch": "${CI_COMMIT_BRANCH:-unknown}",
  "git_sha": "${CI_COMMIT_SHA:-unknown}",
  "pipeline_url": "${CI_PIPELINE_URL:-unknown}"
}
EOF

echo "Backup completed: ${backup_file}"
