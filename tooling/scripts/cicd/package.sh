#!/usr/bin/env bash
# Author: Janardhanan Kalidas
# Date: 2026-10-05
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -f build.env ]] || fail "build.env is missing."
set -a; source build.env; set +a

SOURCE_DIR="${THEME_SOURCE_DIR:-.}"
ARCHIVE="${THEME_ARCHIVE:-dist/theme.zip}"
[[ -f "$SOURCE_DIR/manifest.json" ]] || fail "manifest.json is not present in ${SOURCE_DIR}."

rm -rf .theme-build dist
mkdir -p .theme-build dist

(
  cd "$SOURCE_DIR"
  find . -type f     ! -path './.git/*'     ! -path './.gitlab/*'     ! -path './scripts/*'     ! -path './node_modules/*'     ! -path './dist/*'     ! -path './.theme-build/*'     ! -name '.gitlab-ci.yml'     ! -name 'build.env'     -print0
) | while IFS= read -r -d '' file; do
  mkdir -p ".theme-build/$(dirname "$file")"
  cp "$SOURCE_DIR/$file" ".theme-build/$file"
done

jq --arg name "$THEME_NAME" --arg version "$RELEASE_VERSION"   '.name = $name | .version = $version'   .theme-build/manifest.json > .theme-build/manifest.json.tmp
mv .theme-build/manifest.json.tmp .theme-build/manifest.json
cp .theme-build/manifest.json dist/manifest.json

(cd .theme-build && zip -q -r "../${ARCHIVE}" .)
[[ -s "$ARCHIVE" ]] || fail "Theme archive was not created."
unzip -t "$ARCHIVE" >/dev/null
printf 'Created %s for %s\n' "$ARCHIVE" "$THEME_NAME"
