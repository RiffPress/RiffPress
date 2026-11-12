# The Riff ecosystem

Riff is nine plugins in two repositories, three hosts, and one release train. This page is the map: what each piece is, what it needs, where it lives, and how it reaches a site. Each piece's own docs say how it works.

## The pieces

| Plugin | What it is | Needs | Repository | How it ships |
| --- | --- | --- | --- | --- |
| **Riff** (`riff`) | The player and the Listen app: albums, artists, tracks, Now Playing, the queue, likes, playlists, search, the lock screen, AirPlay and Cast, protected files, the standalone app. Everything else builds on it. | WordPress 7.1, PHP 8.1 | RiffPress, `plugins/riff/` | WordPress.org and the release zip, tagged `riff-vX.Y.Z` |
| **Riff Lyrics** (`riff-lyrics`) | A Lyrics view in Now Playing, from the tags in the audio file or typed into the Media Library. | Riff | RiffPress, `plugins/riff-lyrics/` | Inside Riff's zip, as an extension ([extensions.md](extensions.md)). Its own tag, `riff-lyrics-vX.Y.Z`, marks the version Riff carries. |
| **Riff Sign In** (`riff-sign-in`) | Listeners sign in with a passkey or an emailed code, from a sheet inside the player. No passwords. | Riff | RiffPress, `plugins/riff-sign-in/` | Its own release zip, `riff-sign-in-vX.Y.Z` |
| **Riff Chords** (`riff-chords`) | A Chords view: a chord chart that follows the song, with practice controls. | Riff | RiffPress, `plugins/riff-chords/` | Its own release zip, `riff-chords-vX.Y.Z` |
| **Riff Sing** (`riff-sing`) | A Sing view: sing the melody from a microphone or MIDI and hear how close you came. Audio never leaves the browser. | Riff | RiffPress, `plugins/riff-sing/` | Its own release zip, `riff-sing-vX.Y.Z` |
| **Riff Chimera** (`riff-chimera`) | A Chimera view: CHIMERA, a physical model of a voice, sings the track's melody with the recording, a voice per singer. Experimental. | Riff, Riff Sing | RiffPress, `plugins/riff-chimera/` | Its own release zip, `riff-chimera-vX.Y.Z` |
| **Riff Network** (`riff-network`) | Riff Cloud's own plugin: anyone signs in with their email and gets a Riff of their own on the network. | Riff, Riff Sign In | riffpress-com (private), `network/plugins/riff-network/` | Composer path package, deployed with the network |
| **Riff Account** (`riff-account`) | Login with Riff: the network's main site signs listeners in to other sites with OpenID Connect. Off until `wp-config.php` names its issuer. | Riff Network, Riff Sign In | riffpress-com (private), `network/plugins/riff-account/` | Composer path package, deployed with the network |
| **Presence API** (`presence-api`) | Who is here now, for the Together features. Not Riff's; a WordPress.org plugin. | WordPress | WordPress.org | Composer, from the WordPress.org zip |

Riff Lyrics, Chords and Sing are *extensions*: plugins built only on Riff's public hooks, `window.riff` and REST, as anyone's plugin would be. `.github/scripts/extension-surface.test.js` fails if one of them reaches past that surface. When an extension needs something Riff doesn't offer, Riff grows a documented extension point; the extension never takes a shortcut.

`packages/` holds what isn't a plugin: `wp-api-coverage` (released, `wp-api-coverage-vX.Y.Z`), `types` (the TypeScript types for the REST API and `window.riff`), `fixtures` (the demo recordings and test media), `benchmarks` and `dev` (local tooling).

## The hosts

| Address | What it is | Built from | Runs on |
| --- | --- | --- | --- |
| `source.riffpress.com` | Getting Riff and running it: Download, Add your music, using Riff, running it for others, contributing, verifying a release, Built on the open web, Accessibility, and the demo's files | RiffPress, `site/` and `docs/` | Cloudflare Pages, project `riffpress-developer` |
| `developer.riffpress.com` | Building on Riff: the PHP, hooks, JavaScript, REST, CSS and track schema reference, generated from the code, and the guides to extending Riff | RiffPress, `site/` and `docs/` | Cloudflare Pages, project `build-on-riff` |
| `riffpress.com` | The platform's own site | riffpress-com, `site/` | Cloudflare Pages |
| `cloud.riffpress.com` | Riff Cloud: each person's Riff at `cloud.riffpress.com/<name>/`, a WordPress network | riffpress-com, `network/` | WP Engine |

Source and the developer site are one build: `pages.yml` generates every page, and `developers-site.js` puts each on the host `.github/scripts/site-nav.json` names, links between the two hosts written out in full. The Pages project `riffpress-developer` is named for the time it served both hosts; it serves Source. Until the split both hosts answered every address, so each host's `_redirects` sends the addresses the other now serves there with a 301.

A self-hosted Riff is Riff plus whichever extensions and Riff Sign In its owner installs. Riff Cloud is Riff, Riff Sign In, Riff Chords and the Presence API at exact versions, plus Riff Network and Riff Account, all installed by Composer from `network/composer.json`. Riff Lyrics comes along inside Riff. Riff Sing is left off Cloud on purpose.

## How a change travels

Nobody merges a release by hand. Each step starts the next:

1. A pull request merges on `main` in RiffPress. release-please reads its title and, if it touched a package's folder with a `feat` or `fix`, opens or updates the one release pull request (`release-please--branches--main`), which moves every package with changes. `sync-versions` in `release-please.yml` brings that branch up to date with `main`, writes the version into each plugin's header, define and Stable tag, and approves the CI runs GitHub holds on it.

   The release pull request is a draft until then, and GitHub merges no draft, an admin's merge included. release-please opens it as one (`draft-pull-request`), and before each run lets release-please rebuild the branch, which drops the sync commit, the workflow makes the open one a draft again. Only `sync-versions` marks it ready, after `release-check.js tree` and `readme-changelog.js --check` pass on the commit it pushed and that commit is still the branch's head. A draft release pull request means its versions are not synced yet: wait for it, and never mark it ready by hand. CI runs the full suite on it while it is a draft, so it is green the moment it is ready. Merging it before that is how 6.12.0, 6.13.0, 6.14.1 and 6.14.2 were tagged on commits that still said the previous version, which no zip built from them can pass.
2. `release-auto-merge.yml` merges the release pull request once `.github/scripts/release-gate.js` says it is safe: `main`'s newest commit has passed CI and nothing gating on it is red or still running; the release pull request already contains that commit; and on the release pull request's own commit, which is what gets tagged, CI status passed with PHPUnit, Playwright and Plugin Check actually run, along with CodeQL, the scripts' tests, the workflow linters and the title check. It looks each time CI or the scripts' tests finish on either branch, and every half hour. A red check opens the issue "The release train stopped" and merges nothing.
3. The merge tags each package and creates its GitHub release as a draft. Each package's job builds its zip from the tag, checks that the zip's header, define and Stable tag say the tag's version (`release-check.js zip`), attests it, attaches it and publishes the release. `verify-releases` then fails if any package's release is still a draft or has no zip.
4. Riff's release goes to WordPress.org (off until `WPORG_DEPLOY` is `true`): the job downloads the zip the GitHub release carries, verifies its attestation and version, and sends exactly that.
5. `notify-downstream` starts riffpress-com's `riff-upgrade.yml` by dispatch after a Riff or Riff Sign In release is published, which moves `network/composer.json`'s pins and opens or updates its upgrade pull request. riffpress-com also checks on a schedule, for a dispatch that never arrived.
6. Merging that, or anything else under `network/`, runs `network-deploy.yml`: Composer builds `wp-content/plugins/`, one rsync sends it to WP Engine, the page cache is cleared, and the deploy waits for `cloud.riffpress.com` to answer with `riff-network/v1` in its REST index.

Separately, every push to `main` runs `pages.yml`, which deploys the developer site and then Source, so the reference on developer.riffpress.com and the download, docs and demo on source.riffpress.com are always `main`'s. A pull request from this repository gets a preview of each, linked from its Preview comment.

A change to Riff reaches a self-hosted site on its next plugin update, and Cloud as soon as riffpress-com's upgrade pull request merges.

### Who may do what

| Step | Token | May |
| --- | --- | --- |
| Release pull request, tags, releases, zips | `GITHUB_TOKEN` (or `RELEASE_PLEASE_TOKEN`, if set) | write this repository's contents, pull requests and releases |
| Merging the release pull request | `RELEASE_PLEASE_TOKEN` if set, else `GITHUB_TOKEN` | merge, under `main`'s branch protection |
| Telling riffpress-com | `DOWNSTREAM_DISPATCH_TOKEN` | Actions read and write on that one repository, nothing else |
| WordPress.org | `SVN_USERNAME`, `SVN_PASSWORD`, in the `wordpress-org` environment | commit to the plugin's SVN |

A push made with `GITHUB_TOKEN` starts no workflow. When `GITHUB_TOKEN` made the merge, `release-auto-merge.yml` starts `release-please.yml`, CI, WP Engine, Pages and the Playground build on `main` by dispatch, the one event that token may raise. With a `RELEASE_PLEASE_TOKEN` (a fine-grained token on RiffPress/RiffPress with Contents and Pull requests read and write) the merge's push starts them itself.

### Settings

| Name | Kind | What it does |
| --- | --- | --- |
| `RELEASE_AUTO_MERGE` | variable | `false` is the kill switch: release pull requests wait for a person, as before. Unset, they merge themselves. |
| `DOWNSTREAM_REPO`, `DOWNSTREAM_WORKFLOW` | variables | Which repository and workflow `notify-downstream` starts. |
| `DOWNSTREAM_DISPATCH_TOKEN` | secret | The token it starts them with. When any of the three is missing, the job fails after the release is published, so it shows. |
| `WPORG_DEPLOY` | variable | `true` sends Riff's releases to WordPress.org. |

### When the release train stops

Every failure opens one issue, "The release train stopped", with the run and each job's result, and nothing more while that issue is open; close it once the release is out. Success says nothing.

- **The release pull request is red.** Nothing was tagged. Fix `main`, or re-run what was flaky; the next green CI result merges it.
- **A package's release job failed.** Its tag exists and its release is a draft without a zip, and release-please will not come back to it. Re-run the failed job if the tag is still right; otherwise build the zip from the tag with `.github/scripts/build-zip.sh`, attach it with `gh release upload`, and publish with `.github/scripts/publish-release.sh`. `verify-releases` fails on every run until it is published.
- **The zip "is not" the tag's version.** The tag is on a commit whose versions were never synced, so nothing built from it can pass, and `main` is out of step with its manifest until a pull request runs `bash scripts/sync-versions.sh` on it. Delete the draft and its tag with `gh release delete <tag> --cleanup-tag --yes`, sync `main`, and let the next release ship from the synced tree; or point the tag at the synced commit and re-run the failed job, which builds from the tag.
- **`sync-versions` says the release branch no longer exists.** The release pull request merged or closed while the run was going; there was nothing to sync, and the job passes.
- **`notify-downstream` failed.** The release is out; only riffpress-com was not told, and its schedule will pick it up. Usually the token expired: renew it with the same permission.
- **WordPress.org failed.** The GitHub release is out. Re-run the job; it sends the released zip again.

## Local development

RiffPress runs under wp-env with every plugin in `plugins/` loaded; `npm run env:start` starts it, Mailpit with it, and opens both. riffpress-com's network runs under its own wp-env from `network/plugins/riff-network/`, as a multisite, with the Composer-installed copies of Riff, Riff Sign In, Riff Chords and the Presence API mounted from `network/wp-content/plugins/`.

Things that have bitten, so they don't again:

- **Stop the network's wp-env before `composer install` or `composer update` in `network/`.** Composer replaces a plugin's folder by deleting it and extracting the new zip. The running container has that folder bind-mounted, the delete fails, and Composer leaves an empty folder behind. WordPress then sees no plugin header, the plugin silently stops loading, and the first sign is a REST route that no longer exists, such as "No route was found matching the URL and request method" from the sign-in form. Stop the containers, install, start them again.
- **Composer's own output under PHP 8.5.** Composer 2.8.9's phar prints deprecations from its bundled libraries, and when a step fails, that deprecation text is what Composer reports as the reason. "Could not delete …: Case statements followed by a semicolon are deprecated" means "could not delete". Look at the folder, not the message.
- **The pre-commit hook wants the tests site on port 8891.** It runs the Playwright suite before every commit. For a change to docs, `site/`, or a single PHPUnit test, `RIFF_SKIP_E2E=1 git commit` skips it; CI still runs everything.
- **PHP 8.5 turns deprecations into test errors.** The WordPress test suite fails a test on any deprecation notice. `ReflectionMethod::setAccessible()` was the first to go; the CI matrix runs PHP 8.5 on both latest and trunk, so a deprecation that passes locally on 8.4 fails there.
- **WP Engine's object cache outlives the database.** After changing the network's tables by hand, only the Object cache toggle in WP Engine's portal clears what WordPress has cached. Flushing from WP-CLI isn't enough.

## Where to look

| Question | Page |
| --- | --- |
| How the player works | [player.md](player.md) |
| What Riff takes from WordPress as is, and what it works around | [native.md](native.md) |
| How an extension is bundled and what it may use | [extensions.md](extensions.md), [hooks.md](hooks.md), [javascript.md](javascript.md) |
| Every piece of state in the player and who owns it | [state.md](state.md) |
| What each site on a network may do, and what a host can set | [learn/network.md](learn/network.md) |
| How sign-in works for a listener | [learn/sign-in.md](learn/sign-in.md) |
| How the network's plugins are built, tested and deployed | riffpress-com's README and `docs/state.md` |
| What's in scope and what isn't | [PRODUCT.md](../PRODUCT.md) |
