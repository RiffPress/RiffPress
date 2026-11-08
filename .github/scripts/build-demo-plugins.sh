#!/usr/bin/env bash
#
# Builds the plugins the demo installs beside Riff, each as a release builds it (through
# .distignore), zipped into <dest>/<name>.zip: the zips blueprint.json names under demo/, so the
# demo set and the blueprint can't name different plugins. Every workflow that lays out a demo set
# runs it into that set's demo/ folder.
#
#   bash .github/scripts/build-demo-plugins.sh <dest>

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dest="${1:?usage: build-demo-plugins.sh <dest>}"
mkdir -p "$dest"
dest="$(cd "$dest" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

names=$(jq -r '.steps[] | select(.step == "installPlugin" and .pluginData.resource == "url") | .pluginData.url | select(startswith("demo/")) | ltrimstr("demo/")' "$root/blueprint.json")

for zip in $names; do
	name="${zip%.zip}"
	if [[ "$zip" != "$name.zip" || ! "$name" =~ ^[a-z0-9-]+$ || ! -f "$root/plugins/$name/$name.php" ]]; then
		echo "blueprint.json: demo/$zip is not a plugin in plugins/" >&2
		exit 1
	fi
	rsync -a --delete --exclude-from="$root/.distignore" "$root/plugins/$name/" "$work/$name/"
	find "$work/$name" -name '*.php' -print0 | xargs -0 -n1 -P 4 php -l > /dev/null
	(cd "$work" && zip -qr "$dest/$zip" "$name/")
	echo "$dest/$zip"
done
