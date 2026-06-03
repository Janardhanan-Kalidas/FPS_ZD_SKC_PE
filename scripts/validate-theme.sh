#!/usr/bin/env bash
set -euo pipefail

# Lightweight CI validation for Zendesk theme structure.

required_files=("manifest.json" "script.js" "style.css")
for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Validation failed: missing required file '$file'"
    exit 1
  fi
done

if [[ ! -d "templates" ]]; then
  echo "Validation failed: missing templates directory"
  exit 1
fi

if ! find templates -maxdepth 1 -type f -name "*.hbs" | grep -q .; then
  echo "Validation failed: no .hbs templates found in templates/"
  exit 1
fi

node <<'NODE'
const fs = require('fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const required = ['name', 'author', 'version', 'api_version', 'default_locale', 'settings'];
for (const field of required) {
  if (!(field in manifest)) {
    console.error(`Validation failed: manifest missing '${field}'`);
    process.exit(1);
  }
}
if (!Array.isArray(manifest.settings)) {
  console.error('Validation failed: manifest.settings must be an array');
  process.exit(1);
}
console.log(`Manifest OK: ${manifest.name} v${manifest.version}`);
NODE

echo "Theme structure validation passed."
