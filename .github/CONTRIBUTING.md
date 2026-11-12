# Contributing

## Local development

You need Node (the version in `.nvmrc`), PHP (`.php-version`; 8.1 is the oldest Riff runs on), Composer and Docker. `npm run doctor` checks each and, for anything missing, says how to get it on your machine: through the Node version manager you already have (nvm, fnm, Volta, mise or asdf all read `.nvmrc`), or Homebrew, winget or your package manager. CI reads the same two files, so what passes here passes there. Or skip all of it: open the repository in a GitHub Codespace or a dev container, and `.devcontainer/` installs everything, the browsers for the tests included.

In VS Code, accept the recommended extensions (`.vscode/extensions.json`): ESLint, stylelint, Prettier with WordPress's config, PHP CodeSniffer with `phpcs.xml.dist`, Playwright and the spell check run in the editor as they do in CI.

```bash
npm install && composer install
npm run env:start          # WordPress at http://localhost:8890 (admin / password); the tests site at :8891. Core is the 7.2 beta or release candidate until 7.2 ships on 8 December 2026, so the fields only 7.2 shows can be worked on; Riff itself needs 7.1
npm run seed               # a post with ten public-domain jazz tracks
```

Until 7.2 ships, `.wp-env.json` names its current pre-release zip (Beta 5 today, then the release candidates), and `plugin-check.yml` names the same one. Each new build is a one-line change in those two files, then `npm run env:start` again; the PHPUnit rows and the weekly suite follow `.wp-env.json`, the trunk rows stay on trunk, and the Playground demo asks for `beta`, which is always the newest pre-release. On release day the zip becomes `WordPress/WordPress#7.2`.

The plugin is `plugins/riff/`. It ships plain stylesheets and scripts with no build step, each loaded only where it applies, and the only thing it adds to a page is the player. Keep it that way: transform and opacity animations only, native controls first, every browser feature behind a check.

To play your own music, point the seed script at any folder of audio: `npm run seed -- wp-content/riff/path/inside/the/repo`. The repository root is mounted in the containers at `wp-content/riff`.

## Finding your way

| Path | What it is |
| --- | --- |
| `plugins/riff/` | The WordPress plugin. No build step: `assets/riff.js`, `assets/riff.css` and the files under `features/listen/` are what ships. |
| `plugins/riff-lyrics/` | Riff Lyrics, the reference extension: a Lyrics view of Now Playing. |
| `plugins/riff-chords/` | Riff Chords: a chord chart that follows the song in a Chords view of Now Playing, with practice controls. Built the way Riff Lyrics is. |
| `plugins/riff-sign-in/` | Riff Sign In: listeners sign in with a passkey or an email code, from a sheet inside the player. |
| `plugins/riff-sing/` | Riff Sing: a Sing view of Now Playing, where the melody scrolls past and the singer is scored by pitch, from a microphone or a MIDI instrument. Built like Riff Lyrics, only on the public API. |
| `plugins/riff-chimera/` | Riff Chimera (experimental): CHIMERA, a physical model of a voice, sings Riff Sing's melody for the track in a Chimera view of Now Playing, one voice per singer. Carries a pinned build of CHIMERA in `assets/chimera/`, rebuilt by `.github/scripts/build-chimera.sh`. Built like Riff Lyrics, only on the public API. |
| `packages/fixtures/` | Public-domain audio and artwork for demos, small files made for the tests, and `seed.php`, which turns any folder of audio into a post. |
| `packages/wp-api-coverage/` | Lists the WordPress APIs a plugin uses and the ones it doesn't yet. |
| `apps/ios/` | Reserved for the native app. |
| `site/` | [source.riffpress.com](https://source.riffpress.com/): the reference, the pages about the software and the live demo's files, published to Cloudflare Pages by `pages.yml`. [riffpress.com](https://riffpress.com/) is the business's site, from a repository of its own. |
| `blueprint.json` | The Playground demo: installs Riff, and Riff Chords and Riff Sing for the charted song, uploads the fixtures, seeds the posts. |

| File | What it covers |
| --- | --- |
| [PRODUCT.md](../PRODUCT.md) | Who Riff is for, what it does, and what is out of scope. |
| [DESIGN.md](../DESIGN.md) | How the player and the Listen block look and behave. |
| [REVIEW.md](../REVIEW.md) | What a reviewer, a person or an agent, looks for in a pull request, and what to leave out. |
| [docs/ecosystem.md](../docs/ecosystem.md) | The map: every plugin, what it needs, where it lives, how it ships, and the local-dev traps. |
| [docs/player.md](../docs/player.md) | How the player works, for anyone changing it. |
| [docs/native.md](../docs/native.md) | What Riff uses from WordPress as is, what it adds, and why. |
| [docs/hooks.md](../docs/hooks.md), [docs/javascript.md](../docs/javascript.md) | The hooks and `window.riff`, generated from the code. |
| [docs/iphone-checklist.md](../docs/iphone-checklist.md) | What to check on a real iPhone before merging a change to the player. |
| [docs/screen-reader-checklist.md](../docs/screen-reader-checklist.md) | What to hear with VoiceOver, NVDA, JAWS or TalkBack before merging a change that touches the surface. |
| [docs/accessibility.md](../docs/accessibility.md) | What the page is to a screen reader, what is said and when, and what a new control needs. |
| [SUPPORT.md](SUPPORT.md), [SECURITY.md](../SECURITY.md) | Supported versions, the API promise, and reporting a vulnerability. |

`.wp-env.override.json` moves the ports when another wp-env holds them. `npm run mail` starts Mailpit, which catches the local site's mail at http://localhost:8025, for every worktree, and sends nothing out. Without it, Riff Sign In's codes are still in the log (`packages/dev/sign-in-codes.php`): run `npx wp-env logs development` and sign in with the code or the link it prints. The demo built from `main` is [next.riffpress.com](https://next.riffpress.com/listen/app/); a pull request's own demo is the Playground link in its preview comment

## The reference extension

`plugins/riff-lyrics/` is Riff Lyrics, a real plugin built only on Riff's documented public API: the hooks in `docs/hooks.md`, `window.riff` in `docs/javascript.md`, and REST. `.github/scripts/extension-surface.test.js` fails if it, or Riff Sing or Riff Chords, built the same way, hooks anything undocumented or reaches into Riff's classes. When a feature needs something Riff doesn't offer, add it to Riff as a documented extension point, not as a shortcut in the plugin. wp-env loads every plugin in `plugins/`, and PHPUnit, Plugin Check and e2e cover each.

## Working on several branches at once

`npm run wt -- new fix/the-thing` makes a worktree in `.claude/worktrees/` on a new branch from `origin/main` and pushes it. It links the main checkout's `node_modules` and installs its own `vendor`. `npm run wt -- env` in it writes a `.wp-env.override.json` with a pair of ports from 8900 up and starts a WordPress of its own that serves that worktree's code, both sites seeded. The pre-commit hook then tests the branch you're committing, not whatever the main checkout has, and stops in a worktree that has no site yet. A worktree made any other way gets `node_modules` and `vendor` with `npm run wt -- setup`, which the hook runs for you.

`npm run wt -- list` shows each worktree's branch, ports, uncommitted and unpushed work and pull request. `npm run wt -- prune` lists the worktrees whose pull request merged or closed with every commit they hold, and that have nothing uncommitted, unpushed or ignored that nothing rebuilds (a music library in `tests/`, `.claude/settings.local.json`, an `.env`); `--yes` removes them, their branch and their wp-env.

## Running checks

```bash
npm run lint               # PHPCS (WordPress Coding Standards), ESLint and stylelint
npm run test:e2e           # Playwright: desktop Chromium, Chromium at an iPhone size, WebKit smoke (wp-env must be running)
npm run test:php           # PHPUnit on the WordPress test suite, inside the tests container
```

The size-budget workflow builds a 5,000-track catalogue with `packages/benchmarks/catalog.php build messy`, which adds the messy library a real site has (untitled tracks, no covers, one-word and 300-character names, other scripts, emoji), and runs `plugins/riff/tests/e2e/app/messy.spec.js` over every view that shows it. Locally: `npx wp-env run tests-cli wp eval-file wp-content/riff/packages/benchmarks/catalog.php build tracks=10 messy`, then that spec; it skips itself where the library isn't built, and `npx wp-env reset tests` clears it.

Playwright smoke tests run **before every commit**, from the hook in `.githooks` that `npm install` wires up, against your running wp-env, retrying a failed test once so only a test that fails twice stops the commit, and the full suite runs in GitHub Actions on every pull request that isn't a draft: a draft gets lint, the references and the Node tests, and marking it ready runs PHPUnit, Playwright and Plugin Check. Skip the suite for one commit with `RIFF_SKIP_E2E=1 git commit ...`, or every hook with `--no-verify`. CI also runs PHPCS, ESLint, the spell check, the workflow script tests, a lint of the workflow files, and Plugin Check against the built zip whenever the code changes.

## Pull requests

1. Branch off `main`.
2. Title the pull request as a [Conventional Commit](https://www.conventionalcommits.org/). Pull requests squash-merge with the title as the commit subject, so the title is what release-please reads. `lint-pr.yml` enforces this.
3. Fill in the template. The line at the top saying what we would miss by only reading the diff is the part that matters most.
4. Every pull request gets a sticky comment with Playground links built from its own commit, signed in as admin. **Standalone app** opens `/listen/app/`, the installable player with no theme. **Listen page** opens `/listen/`, the same player as a block in the theme, which is where theme and block changes show. **Blog post** opens an album's post. **Website** is the site as the branch builds it, before its pages are split between the hosts. Use them to check the change on a phone.

## What runs itself

- **Dependencies.** Dependabot opens one grouped pull request per ecosystem each month for minor and patch bumps, and `dependabot-auto-merge.yml` merges it once every required check is green. Major bumps wait for a person. Security updates arrive as soon as an advisory does.
- **Required checks.** `main` is protected behind the single `CI status` check.
- **Weekly against WordPress trunk.** `core-trunk.yml` runs, every Wednesday, the whole suite on trunk and on the current release. A test that fails only on trunk opens a `core-regression` issue, which gets a comment each week it still fails and closes itself once it passes (`.github/scripts/core-regressions.js`). The week's commits to core's and Gutenberg's media code open one `core-watch` issue to look through (`.github/scripts/core-watch.js`).
- **WordPress release day.** `core-release.yml` checks api.wordpress.org four times a day, and when WordPress ships a major release that Riff's `readme.txt` isn't tested up to, it opens one `core-release` issue with the release-day steps below (`.github/scripts/core-release.js`).
- **Weekly run.** CI runs the full suite every Monday against current WordPress core. The release and Pages workflows run weekly too.
- **Version strings.** `scripts/sync-versions.sh` writes each package's version everywhere it is read, sets `Tested up to` from the core version the suite just ran against, and writes each plugin's `readme.txt` changelog from its `CHANGELOG.md`.

## The demo library

The demo library is one uploaded album, `packages/fixtures/compositions`, and a folder per streamed album beside it, each with a `source.json` naming its recordings on Wikimedia Commons.

To add or change a streamed album, edit its `source.json` and run `npm run albums <slug>` (needs ffmpeg). That downloads and encodes the recordings into `packages/fixtures/<slug>/audio/`, which git ignores, and writes `manifest.json` and `levels.json`, which you commit. `npm run seed` then plays the album from your checkout. Without a local `audio/` folder, or with `RIFF_DEMO_BASE` set, an album plays from source.riffpress.com.

Nothing else needs editing: the deploy bundles every streamed album into one `demo/albums.json`, so `blueprint.json` never lists them. A pull request's Playground preview builds the albums whose `source.json` it adds or changes and plays them from the preview, and plays the rest from source.riffpress.com. Once merged, the Pages deploy publishes their audio under `demo/<slug>/`.

## Translations

`npm run pot` writes the translation template to `plugins/riff/languages/riff.pot` (wp-env must be running). It is generated, not committed: the Plugin Check job builds it into the zip, and translations come from translate.wordpress.org.

Every string uses the `riff` text domain, and each plugin beside it its own slug, such as `riff-lyrics`. PHPCS fails a string with a missing or wrong domain, and `.github/scripts/text-domain-check.sh` runs in the same job to show that check still catches one. The player's JavaScript translates its own strings with `__()` and `_n()` from `wp.i18n`, from WordPress's script module translations, so a new string the script shows is a literal `__( '…', 'riff' )` call in the module. `plugins/riff/tests/php/test-i18n.php` checks that every view of the Listen app comes out translated and that each module's translations reach the page.

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please). Six packages ship from this repository, each with its own version, tag and changelog: Riff (`plugins/riff/`, tagged `riff-v6.x.y`), Riff Lyrics, Riff Chords, Riff Sign In and Riff Sing (each in `plugins/<slug>/`, tagged `<slug>-vx.y.z`), and wp-api-coverage (`packages/wp-api-coverage/`, tagged `wp-api-coverage-v0.x.y`). release-please reads the titles of the pull requests merged on `main` that touch a package's folder to decide its next version and write its `CHANGELOG.md`. A change only to `site/`, `docs/`, CI or the test tooling releases nothing.

- `feat: ...` → minor bump (before 1.0, a patch bump)
- `fix: ...` → patch bump
- `feat!: ...` or a `BREAKING CHANGE:` footer → major bump (before 1.0, a minor bump)
- `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`, `style:` → no version bump

release-please keeps one release pull request open for every package with unreleased changes, and it merges itself once `main` and the pull request are green with the full suite run on it (`release-auto-merge.yml`, `.github/scripts/release-gate.js`); the repository variable `RELEASE_AUTO_MERGE` set to `false` leaves it for a person to merge instead. The merge tags each package and publishes its GitHub Release with its zip: `riff.zip` built from `plugins/riff/` with `.distignore`, and each extension's the same way, each checked to say its tag's version before it is uploaded (`.github/scripts/release-check.js`). Riff's then goes to WordPress.org, as the very zip the GitHub release carries, once that is switched on. Merging wp-api-coverage's publishes it to npm as `@riffpress/wp-api-coverage` once the repository variable `NPM_PUBLISH` is `true` and the `NPM_TOKEN` secret is stored. Riff's release is the one GitHub marks as latest. Publishing a Riff or Riff Sign In release starts the workflow named by the repository variables `DOWNSTREAM_REPO` and `DOWNSTREAM_WORKFLOW` with the `DOWNSTREAM_DISPATCH_TOKEN` secret (a fine-grained token for that one repository with Actions read and write), once per run, and fails visibly when any of the three is missing. A failure anywhere opens one issue, "The release train stopped" ([docs/ecosystem.md](../docs/ecosystem.md#when-the-release-train-stops)). Every release zip is built by `.github/scripts/build-zip.sh`, the same bytes from the same commit, and attested before it is uploaded ([docs/verify.md](../docs/verify.md)); `release-attest.test.js` fails if a workflow releases a zip it hasn't attested.

Every package but Riff has `"initial-version": "0.1.0"` in `release-please-config.json`, so its first release is the version it already carries. A package isn't in `.release-please-manifest.json` until its first release pull request adds it; that absence is what makes release-please use `initial-version`.

Two things a package's folder doesn't cover:

- A change outside `plugins/riff/` that changes what `riff.zip` holds (`.distignore`) doesn't open a Riff release by itself. It goes out with Riff's next one; if it can't wait, add a `Release-As: x.y.z` footer to a commit that touches `plugins/riff/`.
- The listing's banner, icon and screenshots in `.wordpress-org/`, and `readme.txt`, go to WordPress.org on their own when they change on `main` (`wporg-assets.yml`), once `WPORG_DEPLOY` is on. `wporg-dry-run.yml`, run by hand, does the whole release deploy without the final commit, against `riff` or a test plugin's slug.
- A wp-api-coverage version released while `NPM_PUBLISH` is off isn't published to npm later on its own. When turning publishing on, run `npm publish --access public ./packages/wp-api-coverage` once for the current version.

### On WordPress's release day

When WordPress ships a major release, Riff ships the same day, tested against it. The `core-release` issue lists the steps:

1. Point `.wp-env.json` and `plugin-check.yml` at `WordPress/WordPress#7.2` (the new version) instead of the pre-release zip. The pull request runs the whole suite on it; merge it once it passes.
2. Have a Riff release pull request open. If nothing in `plugins/riff/` is waiting to release, merge a change there that does. Or merge one that touches `plugins/riff/` with a `Release-As: x.y.z` footer in the squash commit itself (`gh pr merge --squash --body 'Release-As: 6.2.0'`): squash commits here start with a blank body, so a footer in the pull request description never reaches `main`.
3. Check that every `readme.txt` in it says the new `Tested up to`. The release workflow writes it from api.wordpress.org each time it runs, so any run after WordPress ships does.
4. Merge it the same day.

### Codenames

WordPress names each major release after a jazz musician. Each minor or major release of Riff, never a patch, takes the name of a musician who played with the current WordPress release's namesake, as if Riff sat in with the band. The version stays the one release-please gives it.

- The namesake is in wordpress.org's post for that release: [7.1 is "Mary Lou"](https://wordpress.org/news/2026/08/mary-lou/), for Mary Lou Williams. From WordPress's release day, the new namesake's band is the one to pick from.
- The source comes first. The musician needs a citable record of playing or recording with the namesake: an album's credits, a discography, a label's or a festival's own page. With no source, the release goes out without a name. No name is used twice.
- Once the release is published, its title and notes can still be edited (only the tag and the assets are locked):

```bash
gh release edit riff-v6.2.0 --title 'riff: v6.2.0 "Name"' \
  --notes "$(printf '%s\n\n' 'Name, on instrument, played with the namesake on *Album* (year). [Source](https://…)'; gh release view riff-v6.2.0 --json body --jq .body)"
```

To check one, open the source link in the release's first line and find both names in the same credits.

### How the release pull request gets its checks

release-please opens its pull request with the workflow's own `GITHUB_TOKEN`. GitHub holds the CI runs for a pull request opened that way until someone approves them, so after syncing the version strings the release workflow approves them itself. CI then runs the full suite on the exact commit that will be tagged. No personal access token is involved, so nothing expires.
