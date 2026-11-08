#!/usr/bin/env bash
#
# Builds a plugin's release zip, <dest>/<name>.zip (build/ by default), the same bytes every time
# from the same commit, so anyone can rebuild a release and compare its hash with the attested one.
# Riff is built by build-riff.sh, with its extensions inside; any other plugin is plugins/<name>/
# through .distignore.
#
# A zip records each file's time, mode, owner and order, none of which the commit fixes: a checkout
# stamps files with the time it ran, the extensions' text domain is rewritten in place, and a
# directory lists its files in whatever order the disk keeps them. So every file and folder is
# stamped with the commit's time (SOURCE_DATE_EPOCH, when it is set), given the same mode, listed
# in byte order, and zipped without the extra fields that hold owners and access times.
#
#   bash .github/scripts/build-zip.sh <name> [dest]

set -euo pipefail

name="${1:?usage: build-zip.sh <name> [dest]}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dest="${2:-build}"

if [[ ! "$name" =~ ^[a-z0-9-]+$ || ! -f "$root/plugins/$name/$name.php" ]]; then
	echo "build-zip.sh: plugins/$name/$name.php is not in the repository" >&2
	exit 1
fi

mkdir -p "$dest"
dest="$(cd "$dest" && pwd)"
rm -rf "${dest:?}/$name" "$dest/$name.zip"

if [[ "$name" == "riff" ]]; then
	bash "$root/.github/scripts/build-riff.sh" "$dest"
else
	mkdir -p "$dest/$name"
	rsync -a --delete --exclude-from="$root/.distignore" "$root/plugins/$name/" "$dest/$name/"
fi

epoch="${SOURCE_DATE_EPOCH:-$(git -C "$root" log -1 --format=%ct)}"
# Zip keeps DOS times, which start in 1980 and are read in the local time zone.
if (( epoch < 315532800 )); then
	epoch=315532800
fi
stamp="$(TZ=UTC date -u -r "$epoch" +%Y%m%d%H%M.%S 2>/dev/null || TZ=UTC date -u -d "@$epoch" +%Y%m%d%H%M.%S)"

chmod -R u=rwX,go=rX "$dest/$name"
find "$dest/$name" -exec env TZ=UTC touch -h -t "$stamp" {} +

(
	cd "$dest"
	find "$name" -print | LC_ALL=C sort | TZ=UTC zip -q -X -@ "$name.zip"
)
