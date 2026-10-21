#!/usr/bin/env bash
#
# Reads each package's version from .release-please-manifest.json and syncs it
# into every place it is read verbatim:
#
# riff (plugins/riff):
#   - plugins/riff/riff.php plugin header `* Version:` and `RIFF_VERSION`
#   - plugins/riff/readme.txt `Stable tag:`, `Tested up to:` and its changelog
#   - package.json, package-lock.json and plugins/riff/package.json `version`
#     (the repository's own version follows Riff's)
#
# riff-lyrics (plugins/riff-lyrics):
#   - plugins/riff-lyrics/riff-lyrics.php plugin header and `RIFF_LYRICS_VERSION`
#   - plugins/riff-lyrics/readme.txt `Stable tag:`, `Tested up to:` and its changelog
#
# wp-api-coverage (packages/wp-api-coverage):
#   - packages/wp-api-coverage/package.json and its package-lock.json entry
#
# riff-desktop (packages/desktop):
#   - packages/desktop/package.json and its package-lock.json entry, which
#     electron-builder stamps into the app and its update metadata
#
# `Tested up to:` comes from the current WordPress release. wp-env runs the
# suite against current core, so at release time that is the version the
# plugin was in fact tested on. Skipped quietly when api.wordpress.org cannot
# be reached.
#
# Each package is released on its own, so .github/workflows/release-please.yml
# syncs only the package a release pull request is for, and nothing of the
# others lands with it:
#
#   bash scripts/sync-versions.sh riff-lyrics
#
# With no argument it syncs all four, as a maintainer would locally.
#
# Each target line is grep-checked before the edit and verified afterwards so a
# miss fails loudly instead of shipping a half-bumped plugin.

set -euo pipefail

cd "$(dirname "$0")/.."

command -v jq  >/dev/null 2>&1 || { echo "jq is required to run scripts/sync-versions.sh" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required to run scripts/sync-versions.sh" >&2; exit 1; }

ONLY=${1:-all}
case "$ONLY" in
	all | riff | riff-lyrics | wp-api-coverage | riff-desktop) ;;
	*) echo "Unknown package '$ONLY': use riff, riff-lyrics, wp-api-coverage or riff-desktop" >&2; exit 1 ;;
esac

# A package's version, or nothing for one that has never been released: it is
# missing from the manifest until its first release pull request adds it, and
# its files already carry the version that release will be.
manifest_version() {
	jq -r --arg path "$1" '.[$path] // empty' .release-please-manifest.json
}

# BSD and GNU sed disagree on -i, so write through a temp file.
sed_inplace() {
	local expr=$1 file=$2
	sed -E "$expr" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

TESTED=$(curl -sf --max-time 10 https://api.wordpress.org/core/version-check/1.7/ 2>/dev/null \
	| jq -r '.offers[0].version' 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+' || true)
[[ -n "$TESTED" ]] || echo "Could not reach api.wordpress.org; leaving Tested up to as is" >&2

# A WordPress plugin: its header Version, its version define, and its readme's
# Stable tag and Tested up to.
sync_plugin() {
	local php=$1 define=$2 readme=$3 version=$4
	grep -q '^ \* Version: ' "$php" \
		|| { echo "Plugin header 'Version:' line not found in $php" >&2; exit 1; }
	grep -q "^define( '${define}'" "$php" \
		|| { echo "${define} define not found in $php" >&2; exit 1; }
	grep -q '^Stable tag: ' "$readme" \
		|| { echo "'Stable tag:' line not found in $readme" >&2; exit 1; }

	sed_inplace "s/^( \* Version: ).*/\1${version}/" "$php"
	sed_inplace "s/^(define\( '${define}', ')[^']*(' \);)/\1${version}\2/" "$php"
	sed_inplace "s/^(Stable tag: ).*/\1${version}/" "$readme"

	grep -q "^ \* Version: ${version}\$" "$php" \
		|| { echo "Failed to update plugin header Version in $php" >&2; exit 1; }
	grep -q "^define( '${define}', '${version}' );" "$php" \
		|| { echo "Failed to update ${define} in $php" >&2; exit 1; }
	grep -q "^Stable tag: ${version}\$" "$readme" \
		|| { echo "Failed to update Stable tag in $readme" >&2; exit 1; }

	if [[ -n "$TESTED" ]]; then
		sed_inplace "s/^(Tested up to: ).*/\1${TESTED}/" "$readme"
		grep -q "^Tested up to: ${TESTED}\$" "$readme" \
			|| { echo "Failed to update Tested up to in $readme" >&2; exit 1; }
	fi
}

if [[ "$ONLY" == all || "$ONLY" == riff ]]; then
	VERSION=$(manifest_version plugins/riff)
	[[ -n "$VERSION" ]] || { echo "Riff has no version in .release-please-manifest.json" >&2; exit 1; }
	sync_plugin plugins/riff/riff.php RIFF_VERSION plugins/riff/readme.txt "$VERSION"
	npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
	npm version "$VERSION" --no-git-tag-version --allow-same-version --workspace=plugins/riff >/dev/null
	[[ "$(jq -r .version package.json)" == "$VERSION" ]] \
		|| { echo "Failed to update version in package.json" >&2; exit 1; }
	[[ "$(jq -r .version plugins/riff/package.json)" == "$VERSION" ]] \
		|| { echo "Failed to update version in plugins/riff/package.json" >&2; exit 1; }
	node .github/scripts/readme-changelog.js riff
	echo "Synced Riff to ${VERSION}"
fi

if [[ "$ONLY" == all || "$ONLY" == riff-lyrics ]]; then
	LYRICS_VERSION=$(manifest_version plugins/riff-lyrics)
	if [[ -n "$LYRICS_VERSION" ]]; then
		sync_plugin plugins/riff-lyrics/riff-lyrics.php RIFF_LYRICS_VERSION plugins/riff-lyrics/readme.txt "$LYRICS_VERSION"
		node .github/scripts/readme-changelog.js riff-lyrics
		echo "Synced Riff Lyrics to ${LYRICS_VERSION}"
	else
		echo "Riff Lyrics has not been released yet; nothing to sync"
	fi
fi

if [[ "$ONLY" == all || "$ONLY" == wp-api-coverage ]]; then
	COVERAGE_VERSION=$(manifest_version packages/wp-api-coverage)
	if [[ -n "$COVERAGE_VERSION" ]]; then
		npm version "$COVERAGE_VERSION" --no-git-tag-version --allow-same-version --workspace=packages/wp-api-coverage >/dev/null
		[[ "$(jq -r .version packages/wp-api-coverage/package.json)" == "$COVERAGE_VERSION" ]] \
			|| { echo "Failed to update version in packages/wp-api-coverage/package.json" >&2; exit 1; }
		echo "Synced wp-api-coverage to ${COVERAGE_VERSION}"
	else
		echo "wp-api-coverage has not been released yet; nothing to sync"
	fi
fi

if [[ "$ONLY" == all || "$ONLY" == riff-desktop ]]; then
	DESKTOP_VERSION=$(manifest_version packages/desktop)
	if [[ -n "$DESKTOP_VERSION" ]]; then
		npm version "$DESKTOP_VERSION" --no-git-tag-version --allow-same-version --workspace=packages/desktop >/dev/null
		[[ "$(jq -r .version packages/desktop/package.json)" == "$DESKTOP_VERSION" ]] \
			|| { echo "Failed to update version in packages/desktop/package.json" >&2; exit 1; }
		echo "Synced riff-desktop to ${DESKTOP_VERSION}"
	else
		echo "riff-desktop has not been released yet; nothing to sync"
	fi
fi

[[ -z "$TESTED" ]] || echo "Tested up to: ${TESTED}"
