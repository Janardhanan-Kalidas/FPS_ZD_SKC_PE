#!/usr/bin/env bash
set -euo pipefail

required_env=("ZD_SUBDOMAIN" "ZD_EMAIL" "ZD_API_TOKEN" "DEPLOY_CONFIRM_REQUIRED")
for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Deploy blocked: missing required CI variable '$name'"
    exit 1
  fi
done

if [[ "${DEPLOY_CONFIRM:-}" != "${DEPLOY_CONFIRM_REQUIRED}" ]]; then
  echo "Deploy blocked: DEPLOY_CONFIRM must exactly equal '${DEPLOY_CONFIRM_REQUIRED}'."
  echo "Set DEPLOY_CONFIRM when starting the manual deploy job."
  exit 1
fi

# Require at least one backup artifact generated in this pipeline before deploy.
if ! ls backups/*.zip >/dev/null 2>&1; then
  echo "Deploy blocked: no backup artifact found in backups/."
  echo "Run theme_backup_production first in the same pipeline."
  exit 1
fi

echo "Deploying current branch '${CI_COMMIT_BRANCH:-unknown}' to production Zendesk theme."

# NOTE: ZCLI option names may differ by version.
# Current expected command: themes:import with credentials and theme root path.
npx zcli themes:import \
  --subdomain "${ZD_SUBDOMAIN}" \
  --username "${ZD_EMAIL}" \
  --password "${ZD_API_TOKEN}" \
  .

echo "Zendesk theme import completed successfully."
