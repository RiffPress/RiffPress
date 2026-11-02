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
	# Inside Riff its strings are Riff's, since WordPress.org translates a plugin under its own slug
	# alone. Only the text domain changes: the last argument of a translation call, and the header
	# and PHPCS lines that name it. The same word as a handle, a key or a class is left alone.
	find "$dest/riff/extensions/$name" -name '*.php' -print0 | xargs -0 perl -pi -e "
		s/, '\Q$name\E' \)/, 'riff' )/g;
		s/^( \* Text Domain:\s*)\Q$name\E/\${1}riff/;
		s/^(\/\/ phpcs:set WordPress\.WP\.I18n text_domain\[\] )\Q$name\E/\${1}riff/;
	"
	if grep -rnE "(__|_e|_x|_n|_nx)\(.*'$name' \)" --include='*.php' "$dest/riff/extensions/$name" >&2; then
		echo "extensions.json: $name still has strings in its own text domain" >&2
		exit 1
	fi
done
