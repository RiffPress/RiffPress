# Contributing

## Local development

```bash
npm install && composer install
npm run env:start          # WordPress at http://localhost:8890 (admin / password); the tests site at :8891
npm run seed               # a post with ten public-domain jazz tracks, and one with a video
```

The plugin is `plugins/riff/`. It ships one stylesheet and one script with no build step, and the only thing it adds to a page is the player. Keep it that way: transform and opacity animations only, native controls first, every browser feature behind a check.

To play your own music, point the seed script at any folder of audio: `npm run seed -- wp-content/riff/path/inside/the/repo`. The repository root is mounted in the containers at `wp-content/riff`.

## Finding your way

| Path | What it is |
| --- | --- |
| `plugins/riff/` | The WordPress plugin. No build step: `assets/riff.js` and `assets/riff.css` are what ships. |
| `plugins/riff-lyrics/` | Riff Lyrics, the reference extension: a Lyrics tab in Now Playing. |
| `packages/desktop/` | The desktop app: a site's Listen library in an Electron window. |
| `packages/fixtures/` | Public-domain audio, video and artwork for demos and tests, and `seed.php`, which turns any folder of audio into a post. |
| `packages/wp-api-coverage/` | Lists the WordPress APIs a plugin uses and the ones it doesn't yet. |
| `apps/ios/` | Reserved for the native app. |
| `site/` | [riffpress.com](https://riffpress.com/), published with GitHub Pages. |
| `blueprint.json` | The Playground demo: installs the plugin, uploads the fixtures, seeds a post. |

| File | What it covers |
| --- | --- |
| [PRODUCT.md](../PRODUCT.md) | Who Riff is for, what it does, and what is out of scope. |
| [DESIGN.md](../DESIGN.md) | How the player and the Listen block look and behave. |
| [docs/player.md](../docs/player.md) | How the player works, for anyone changing it. |
| [docs/native.md](../docs/native.md) | What Riff uses from WordPress as is, what it adds, and why. |
| [docs/hooks.md](../docs/hooks.md), [docs/javascript.md](../docs/javascript.md) | The hooks and `window.riff`, generated from the code. |
| [docs/iphone-checklist.md](../docs/iphone-checklist.md) | What to check on a real iPhone before a release. |
| [SUPPORT.md](SUPPORT.md), [SECURITY.md](../SECURITY.md) | Supported versions, the API promise, and reporting a vulnerability. |

`.wp-env.override.json` moves the ports when another wp-env holds them. For the demo built from `main`, open the `preview-main` blueprint: `https://playground.wordpress.net/?mode=seamless&blueprint-url=https://raw.githubusercontent.com/RiffPress/RiffPress/preview-main/blueprint.json`

## The reference extension

`plugins/riff-lyrics/` is Riff Lyrics, a real plugin built only on Riff's documented public API: the hooks in `docs/hooks.md`, `window.riff` in `docs/javascript.md`, and REST. `.github/scripts/extension-surface.test.js` fails if it hooks anything undocumented or reaches into Riff's classes. When a feature needs something Riff doesn't offer, add it to Riff as a documented extension point, not as a shortcut in the plugin. wp-env loads both plugins, and PHPUnit, Plugin Check and e2e cover both.

## Running checks

```bash
npm run lint               # PHPCS (WordPress Coding Standards), ESLint and stylelint
npm run test:e2e           # Playwright: desktop Chromium, Chromium at an iPhone size, WebKit smoke (wp-env must be running)
npm run test:php           # PHPUnit on the WordPress test suite, inside the tests container
```

The size-budget workflow builds a 5,000-track catalogue with `packages/benchmarks/catalog.php build messy`, which adds the messy library a real site has (untitled tracks, no covers, one-word and 300-character names, other scripts, emoji), and runs `plugins/riff/tests/e2e/messy.spec.js` over every view that shows it. Locally: `npx wp-env run tests-cli wp eval-file wp-content/riff/packages/benchmarks/catalog.php build tracks=10 messy`, then that spec; it skips itself where the library isn't built, and `npx wp-env reset tests` clears it.

Playwright smoke tests run **before every commit**, from the hook in `.githooks` that `npm install` wires up, against your running wp-env, and the full suite runs in GitHub Actions on every pull request. Skip the suite for one commit with `RIFF_SKIP_E2E=1 git commit ...`, or every hook with `--no-verify`. CI also runs PHPCS, ESLint, the spell check, the workflow script tests, a lint of the workflow files, and Plugin Check against the built zip whenever the code changes.

## Pull requests

1. Branch off `main`.
2. Title the pull request as a [Conventional Commit](https://www.conventionalcommits.org/). Pull requests squash-merge with the title as the commit subject, so the title is what release-please reads. `lint-pr.yml` enforces this.
3. Fill in the template. The line at the top saying what we would miss by only reading the diff is the part that matters most.
4. Every pull request gets a sticky comment with a WordPress Playground link built from its own commit. Use it to check the change on a phone.

## What runs itself

- **Dependencies.** Dependabot opens one grouped pull request per ecosystem each month for minor and patch bumps, and `dependabot-auto-merge.yml` merges it once every required check is green. Major bumps wait for a person. Security updates arrive as soon as an advisory does.
- **Required checks.** `main` is protected behind the single `CI status` check.
- **Weekly against WordPress trunk.** `core-trunk.yml` runs, every Wednesday, the whole suite on trunk and on the current release. A test that fails only on trunk opens a `core-regression` issue, which gets a comment each week it still fails and closes itself once it passes (`.github/scripts/core-regressions.js`). The week's commits to core's and Gutenberg's media code open one `core-watch` issue to look through (`.github/scripts/core-watch.js`).
- **Weekly run.** CI runs the full suite every Monday against current WordPress core. The release and Pages workflows run weekly too.
- **Version strings.** `scripts/sync-versions.sh` writes each package's version everywhere it is read, sets `Tested up to` from the core version the suite just ran against, and writes each plugin's `readme.txt` changelog from its `CHANGELOG.md`.

## The desktop app

`packages/desktop/` is Riff for the desktop: the standalone Listen page in an Electron window. `npm run desktop` runs it from source on your wp-env site, with the developer tools in its View menu and a reload when anything under `plugins/` changes. To use a browser's tools on the same layout instead, add `?riff_desktop=1` to the Listen page's `app/` address; it works only with `SCRIPT_DEBUG` or `WP_DEBUG` on, and `?riff_desktop=0` turns it off. Its [README](../packages/desktop/README.md) has the tests, the builds and how it updates.

## The demo library

The demo library is one uploaded album, `packages/fixtures/compositions`, and a folder per streamed album beside it, each with a `source.json` naming its recordings on Wikimedia Commons. `node packages/fixtures/album.js <slug> --out <dir>` downloads and encodes one, measures each track, and writes its `manifest.json` and `levels.json`, which are committed; the audio is not, since the Pages deploy builds it the same way and publishes it under `demo/<slug>/`. `npm run seed:tests` seeds the uploaded album and every streamed one, pointed at the live demo set (or `RIFF_DEMO_BASE`).

## Translations

`npm run pot` writes the translation template to `plugins/riff/languages/riff.pot` (wp-env must be running). It is generated, not committed: the Plugin Check job builds it into the zip, and translations come from translate.wordpress.org.

Every string uses the `riff` text domain, and Riff Lyrics uses `riff-lyrics`. PHPCS fails a string with a missing or wrong domain, and `.github/scripts/text-domain-check.sh` runs in the same job to show that check still catches one. The player's JavaScript translates its own strings with `__()` and `_n()` from `wp.i18n`, from WordPress's script module translations, so a new string the script shows is a literal `__( '…', 'riff' )` call in the module. `plugins/riff/tests/php/test-i18n.php` checks that every view of the Listen app comes out translated and that each module's translations reach the page.

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please). Four things ship from this repository, and each is released on its own: Riff (`plugins/riff/`, tagged `v4.x.y`), Riff Lyrics (`plugins/riff-lyrics/`, tagged `riff-lyrics-v0.x.y`), wp-api-coverage (`packages/wp-api-coverage/`, tagged `wp-api-coverage-v0.x.y`) and the desktop app (`packages/desktop/`, tagged `riff-desktop-v0.x.y`). release-please reads the titles of the pull requests merged on `main` that touch a package's folder to decide its next version and write its `CHANGELOG.md`. A change only to `site/`, `docs/`, CI or the test tooling releases nothing.

- `feat: ...` → minor bump (before 1.0, a patch bump)
- `fix: ...` → patch bump
- `feat!: ...` or a `BREAKING CHANGE:` footer → major bump (before 1.0, a minor bump)
- `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`, `style:` → no version bump

release-please keeps one release pull request open per package with unreleased changes. Merging Riff's tags the release, publishes a GitHub Release with `riff.zip` built from `plugins/riff/` with `.distignore`, and deploys to WordPress.org once that is switched on. Merging Riff Lyrics' attaches `riff-lyrics.zip` the same way. Merging wp-api-coverage's publishes it to npm as `@riffpress/wp-api-coverage` once the repository variable `NPM_PUBLISH` is `true` and the `NPM_TOKEN` secret is stored. Merging the desktop app's builds it on macOS, Windows and Linux and attaches each build with its update metadata, unsigned until the signing secrets are stored. Riff's release is the one GitHub marks as latest.

Riff Lyrics, wp-api-coverage and the desktop app have `"initial-version": "0.1.0"` in `release-please-config.json`, so their first release is the version they already carry. They aren't in `.release-please-manifest.json` until that first release pull request adds them; that absence is what makes release-please use `initial-version`.

Two things a package's folder doesn't cover:

- A change outside `plugins/riff/` that changes what `riff.zip` or the WordPress.org listing holds (`.distignore`, `.wordpress-org/`) doesn't open a Riff release by itself. It goes out with Riff's next one; if it can't wait, add a `Release-As: x.y.z` footer to a commit that touches `plugins/riff/`.
- A wp-api-coverage version released while `NPM_PUBLISH` is off isn't published to npm later on its own. When turning publishing on, run `npm publish --access public ./packages/wp-api-coverage` once for the current version.

<details>
<summary>How the release pull request gets its checks</summary>

release-please opens its pull request with the workflow's own `GITHUB_TOKEN`. GitHub holds the CI runs for a pull request opened that way until someone approves them, so after syncing the version strings the release workflow approves them itself. CI then runs the full suite on the exact commit that will be tagged. No personal access token is involved, so nothing expires.

</details>
