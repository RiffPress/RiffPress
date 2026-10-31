#!/usr/bin/env bash
#
# Builds Riff as a release ships it, into <dest>/riff/ (build/riff/ by default): the plugin through
# .distignore, and each extension plugins/riff/extensions.json names copied from plugins/<name>/
# into riff/extensions/<name>/, through .distignore too. Every workflow that builds riff.zip or
# deploys Riff builds it here, so what a release carries is decided in one place.
#
# Riff Sign In is never an extension: it is installed on its own, by whoever runs the site.
#
#   bash .github/scripts/build-riff.sh [dest]

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dest="${1:-build}"
mkdir -p "$dest/riff"
rsync -a --delete --exclude-from="$root/.distignore" "$root/plugins/riff/" "$dest/riff/"

names=$(php -r '$m = json_decode( (string) file_get_contents( $argv[1] ), true ); foreach ( (array) ( $m["extensions"] ?? array() ) as $n ) { echo $n, PHP_EOL; }' "$root/plugins/riff/extensions.json")

for name in $names; do
	if [[ ! "$name" =~ ^[a-z0-9-]+$ ]]; then
		echo "extensions.json: \"$name\" is not a plugin's folder name" >&2
		exit 1
	fi
	if [[ "$name" == "riff-sign-in" ]]; then
		echo "extensions.json: Riff Sign In is installed on its own, never inside Riff" >&2
		exit 1
	fi
	if [[ ! -f "$root/plugins/$name/$name.php" ]]; then
		echo "extensions.json: plugins/$name/$name.php is not in the repository" >&2
		exit 1
	fi
	mkdir -p "$dest/riff/extensions/$name"
	rsync -a --delete --exclude-from="$root/.distignore" "$root/plugins/$name/" "$dest/riff/extensions/$name/"
done
