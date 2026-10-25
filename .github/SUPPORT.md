# Support

## Getting help

Ask a question or report a bug in [GitHub issues](https://github.com/RiffPress/RiffPress/issues). Report security problems privately, as [SECURITY.md](../SECURITY.md) describes, never in a public issue.

## Supported versions

- **WordPress:** the current release, 7.2. Riff is built on what 7.2 added, so it needs it.
- **PHP:** 8.1 or newer.
- **Riff:** the latest release. Fixes, including security fixes, ship in a new release instead of being backported.

The minimum versions are raised only in a new minor or major version, named in the release notes, and only once CI tests the new minimum (`.github/workflows/phpunit.yml`). `Requires at least` and `Requires PHP` in `plugins/riff/readme.txt` and `riff.php` always match what CI tests.

## Public API

The [developer reference](https://riffpress.com/developers/) lists what is public. Within a major version, public hooks, REST fields and routes, the track schema and public CSS custom properties keep their names and shapes. Anything that has to go is deprecated for at least one release first (`apply_filters_deprecated`, plus a notice in the changelog) and removed only in the next major version.

[How Riff is built](https://riffpress.com/built/) has the same commitments for site owners.
