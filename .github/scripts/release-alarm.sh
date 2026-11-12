#!/usr/bin/env bash
#
# Opens the one issue that says the release train stopped, with the given body, unless it is
# already open: one notice per stop, not one per run. Closing the issue re-arms it. Used by
# release-please.yml and release-auto-merge.yml.
#
#   release-alarm.sh <body file>   (GH_TOKEN and GH_REPO set)
set -euo pipefail
BODY=${1:?usage: release-alarm.sh <body file>}
TITLE='The release train stopped'
# The list, not --search: the search index lags, and the two workflows that call this can fire
# seconds apart.
OPEN=$(gh issue list --state open --limit 500 --json number,title --jq "[.[] | select(.title == \"$TITLE\") | .number][0] // empty")
if [[ -n "$OPEN" ]]; then
	echo "::warning::The release train is stopped; issue #$OPEN is already open."
	exit 0
fi
gh issue create --title "$TITLE" --body-file "$BODY"
