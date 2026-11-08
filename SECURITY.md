# Security

Riff renders a player on every front-end page of a site and reads the media attached to posts, so it deserves a real disclosure path.

## Reporting

Use [GitHub Security Advisories](https://github.com/RiffPress/RiffPress/security/advisories/new) to report privately. Expect an acknowledgement within 72 hours and a patched release within 14 days of that, faster if the issue is being exploited.

Please do not open a public issue for a vulnerability.

## Scope

The plugin in `plugins/riff/`. The site in `site/` and the fixtures in `packages/` are not installed on anyone's site.

## Verifying a release

Every zip on a GitHub release carries an artifact attestation, and the same commit always builds the same zip. [docs/verify.md](docs/verify.md) shows how to check one with `gh attestation verify riff.zip --repo RiffPress/RiffPress`, and how to rebuild it and compare hashes.
