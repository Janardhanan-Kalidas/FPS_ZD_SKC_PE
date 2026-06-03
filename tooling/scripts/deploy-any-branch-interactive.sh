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
echo "Step 5/5: Confirm deployment"
echo "Branch: $(git branch --show-current)"
if [[ -n "$brand_id" ]]; then
  echo "Brand ID: $brand_id"
else
  echo "Brand ID: interactive selection"
fi
read -r -p "Type DEPLOY to continue: " deploy_confirm
if [[ "$deploy_confirm" != "DEPLOY" ]]; then
  echo "Deployment cancelled."
  exit 1
fi

if [[ -n "$brand_id" ]]; then
  zcli themes:import . --brandId="$brand_id"
else
  zcli themes:import .
fi

echo "Deployment finished."
