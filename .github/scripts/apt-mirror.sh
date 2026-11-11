#!/usr/bin/env bash
#
# Gives apt a mirror that answers, before a job installs system packages. A hosted runner reads
# Ubuntu's packages through the mirrors listed in /etc/apt/apt-mirrors.txt (Azure's, then
# archive.ubuntu.com and security.ubuntu.com). When a runner can't reach any of them, apt-get update
# fails for every one, and the install that follows waits on downloads that never start until the
# step times out. This asks each listed mirror for the release's index; if one answers, apt is left
# as it is. If none does and the fallback answers, the list becomes the fallback alone. apt checks
# every package's signature against Ubuntu's keys whichever mirror serves it.
#
#   apt-mirror.sh [fallback mirror]
set -euo pipefail
LIST=/etc/apt/apt-mirrors.txt
FALLBACK=${1:-https://mirrors.edge.kernel.org/ubuntu/}
if [[ ! -f "$LIST" ]]; then
	echo "No $LIST on this runner; apt is left as it is."
	exit 0
fi
# shellcheck source=/dev/null
SUITE=$(. /etc/os-release && echo "$VERSION_CODENAME")
answers() {
	curl -fsSL --max-time 15 -o /dev/null "${1%/}/dists/$SUITE/InRelease"
}
while read -r url _; do
	[[ -n "$url" ]] || continue
	if answers "$url"; then
		echo "$url answers; apt is left as it is."
		exit 0
	fi
	echo "$url does not answer."
done < "$LIST"
if ! answers "$FALLBACK"; then
	echo "::warning::No Ubuntu mirror answers, and neither does $FALLBACK; apt is left as it is."
	exit 0
fi
echo "::notice::No listed Ubuntu mirror answers; apt reads from $FALLBACK for this job."
printf '%s\tpriority:1\n' "$FALLBACK" | sudo tee "$LIST" > /dev/null
