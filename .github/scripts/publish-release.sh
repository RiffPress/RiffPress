#!/usr/bin/env bash
#
# Publishes a plugin's draft GitHub release. A plugin that needs a WordPress newer than the current
# release (Requires at least in its header, against api.wordpress.org) goes out as a pre-release
# and never as the latest, so releases/latest and the Download page keep offering the last build
# that runs on today's WordPress. Otherwise it is published, as the latest only when asked (Riff
# itself; never an extension).
#
#   publish-release.sh <tag> <plugin main file> latest|not-latest
set -euo pipefail
TAG=$1
MAIN=$2
WANT=$3
NEEDS=$(sed -nE 's/^[ *]*Requires at least: *([0-9.]+).*$/\1/p' "$MAIN" | head -n1)
CURRENT=$(curl -fsSL https://api.wordpress.org/core/version-check/1.7/ | jq -r '.offers[0].current // empty' || true)
[[ -n "$NEEDS" ]] || { echo "::error::No Requires at least in $MAIN"; exit 1; }
ahead=false
if [[ -n "$CURRENT" ]] && [[ "$(printf '%s\n%s\n' "$CURRENT" "$NEEDS" | sort -V | tail -n1)" != "$CURRENT" ]]; then
	ahead=true
fi
if $ahead; then
	echo "$TAG needs WordPress $NEEDS; the current release is $CURRENT, so it is a pre-release."
	gh release edit "$TAG" --draft=false --prerelease --latest=false
elif [[ "$WANT" == latest ]]; then
	gh release edit "$TAG" --draft=false --prerelease=false --latest
else
	gh release edit "$TAG" --draft=false --prerelease=false --latest=false
fi
