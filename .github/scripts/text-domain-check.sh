#!/usr/bin/env bash
# Shows that the PHPCS text domain check catches a wrong or missing domain. Each fixture names the
# error it should raise ("Expect: <sniff code>", or "Expect: nothing"), and this fails when PHPCS
# reports anything else. Run from the repository root after composer install.
set -euo pipefail
cd "$(dirname "$0")/../.."

status=0
for file in .github/scripts/fixtures/text-domain/*.php; do
	expect=$(sed -n 's/.*Expect: \([A-Za-z0-9.]*\).*/\1/p' "$file" | head -n 1)
	report=$(./vendor/bin/phpcs --standard=phpcs.xml.dist --sniffs=WordPress.WP.I18n --report=csv -q "$file" || true)
	found=$(printf '%s\n' "$report" | grep -o 'WordPress\.WP\.I18n\.[A-Za-z]*' | sort -u | tr '\n' ' ' || true)
	found=${found% }
	if [[ "$expect" == "nothing" && -n "$found" ]]; then
		echo "::error file=$file::expected no text domain error, got: $found"
		status=1
	elif [[ "$expect" != "nothing" && "$found" != *"$expect"* ]]; then
		echo "::error file=$file::expected $expect, got: ${found:-nothing}"
		status=1
	else
		echo "$file: ${found:-no error}, as expected"
	fi
done
exit "$status"
