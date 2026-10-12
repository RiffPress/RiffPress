#!/usr/bin/env bash
#
# Reads the canonical version from .release-please-manifest.json and syncs it
# into every place WordPress reads it verbatim:
#
#   - plugins/riff/riff.php plugin header `* Version:`
#   - plugins/riff/riff.php `RIFF_VERSION` define
#   - plugins/riff/readme.txt `Stable tag:`
#   - package.json, package-lock.json and plugins/riff/package.json `version`
#
# It also writes readme.txt's `Tested up to:` from the current WordPress
# release. wp-env runs the suite against current core, so at release time that
# is the version the plugin was in fact tested on. Skipped quietly when
# api.wordpress.org cannot be reached.
#
# Called from .github/workflows/release-please.yml after release-please opens
# (or updates) its release pull request. Also runnable locally:
#
#   bash scripts/sync-versions.sh
#
# Each target line is grep-checked before the edit and verified afterwards so a
# miss fails loudly instead of shipping a half-bumped plugin.

set -euo pipefail

cd "$(dirname "$0")/.."

command -v jq  >/dev/null 2>&1 || { echo "jq is required to run scripts/sync-versions.sh" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required to run scripts/sync-versions.sh" >&2; exit 1; }
VERSION=$(jq -r '."."' .release-please-manifest.json)

if [[ -z "$VERSION" || "$VERSION" == "null" ]]; then
	echo "Could not read version from .release-please-manifest.json" >&2
	exit 1
fi

PLUGIN=plugins/riff/riff.php
README=plugins/riff/readme.txt

grep -q '^ \* Version: ' "$PLUGIN" \
	|| { echo "Plugin header 'Version:' line not found in $PLUGIN" >&2; exit 1; }
grep -q "^define( 'RIFF_VERSION'" "$PLUGIN" \
	|| { echo "RIFF_VERSION define not found in $PLUGIN" >&2; exit 1; }
grep -q '^Stable tag: ' "$README" \
	|| { echo "'Stable tag:' line not found in $README" >&2; exit 1; }

# BSD and GNU sed disagree on -i, so write through a temp file.
sed_inplace() {
	local expr=$1 file=$2
	sed -E "$expr" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

sed_inplace "s/^( \* Version: ).*/\1${VERSION}/" "$PLUGIN"
sed_inplace "s/^(define\( 'RIFF_VERSION', ')[^']*(' \);)/\1${VERSION}\2/" "$PLUGIN"
sed_inplace "s/^(Stable tag: ).*/\1${VERSION}/" "$README"
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
npm version "$VERSION" --no-git-tag-version --allow-same-version --workspace=plugins/riff >/dev/null

grep -q "^ \* Version: ${VERSION}\$" "$PLUGIN" \
	|| { echo "Failed to update plugin header Version in $PLUGIN" >&2; exit 1; }
grep -q "^define( 'RIFF_VERSION', '${VERSION}' );" "$PLUGIN" \
	|| { echo "Failed to update RIFF_VERSION in $PLUGIN" >&2; exit 1; }
grep -q "^Stable tag: ${VERSION}\$" "$README" \
	|| { echo "Failed to update Stable tag in $README" >&2; exit 1; }

TESTED=$(curl -sf --max-time 10 https://api.wordpress.org/core/version-check/1.7/ 2>/dev/null \
	| jq -r '.offers[0].version' 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+' || true)
if [[ -n "$TESTED" ]]; then
	sed_inplace "s/^(Tested up to: ).*/\1${TESTED}/" "$README"
	grep -q "^Tested up to: ${TESTED}\$" "$README" \
		|| { echo "Failed to update Tested up to in $README" >&2; exit 1; }
	echo "Tested up to: ${TESTED}"
else
	echo "Could not reach api.wordpress.org; leaving Tested up to as is" >&2
fi
[[ "$(jq -r .version package.json)" == "$VERSION" ]] \
	|| { echo "Failed to update version in package.json" >&2; exit 1; }
[[ "$(jq -r .version plugins/riff/package.json)" == "$VERSION" ]] \
	|| { echo "Failed to update version in plugins/riff/package.json" >&2; exit 1; }

echo "Synced all version references to ${VERSION}"
