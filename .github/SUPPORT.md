# Support

## Getting help

Ask a question in [Discussions](https://github.com/RiffPress/RiffPress/discussions/categories/q-a), where an answer is marked and stays findable, and share an idea in its [Ideas](https://github.com/RiffPress/RiffPress/discussions/categories/ideas) while it is still a thought. Report a bug or ask for a feature in [issues](https://github.com/RiffPress/RiffPress/issues/new/choose). Report security problems privately, as [SECURITY.md](../SECURITY.md) describes, never in a public issue.

## Supported versions

- **WordPress:** the current release, 7.2. Riff is built on what 7.2 added, so it needs it.
- **PHP:** 8.1 or newer.
- **Riff:** the latest release. Fixes, including security fixes, ship in a new release instead of being backported.

The minimum versions are raised only in a new minor or major version, named in the release notes, and only once CI tests the new minimum (`.github/workflows/phpunit.yml`). `Requires at least` and `Requires PHP` in `plugins/riff/readme.txt` and `riff.php` always match what CI tests.

## Public API

The [developer reference](https://developer.riffpress.com/) lists what is public. Within a major version, public hooks, REST fields and routes, the track schema and public CSS custom properties keep their names and shapes. Anything that has to go is deprecated for at least one release first (`apply_filters_deprecated`, `do_action_deprecated`, `_deprecated_function` or a documented `@deprecated`, plus a note in [docs/deprecations.md](../docs/deprecations.md)) and removed only in the next major version. The routes the reference lists as internal are the Listen app's own, and are not part of this promise.

`node .github/scripts/public-promise.js` holds the code to this: in the pre-commit hook and in CI it compares the hooks, the REST routes, the `window.riff` members, the PHP functions and the public CSS custom properties with the last release's, and fails when one goes or changes shape without a deprecation and its note.

[How Riff is built](https://source.riffpress.com/built/) has the same commitments for site owners.
