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
| **Riff Meters** (`riff-meters`) | Experimental. A VU meter and a spectrum under the turntable. | Riff | RiffPress, `plugins/riff-meters/` | Its own release zip, `riff-meters-vX.Y.Z` |
| **Riff Network** (`riff-network`) | Riff Cloud's own plugin: anyone signs in with their email and gets a Riff of their own on the network. | Riff, Riff Sign In | riffpress-com (private), `network/plugins/riff-network/` | Composer path package, deployed with the network |
| **Riff Account** (`riff-account`) | Login with Riff: the network's main site signs listeners in to other sites with OpenID Connect. Off until `wp-config.php` names its issuer. | Riff Network, Riff Sign In | riffpress-com (private), `network/plugins/riff-account/` | Composer path package, deployed with the network |
| **Presence API** (`presence-api`) | Who is here now, for the Together features. Not Riff's; a WordPress.org plugin. | WordPress | WordPress.org | Composer, from the WordPress.org zip |

Riff Lyrics, Chords, Sing and Meters are *extensions*: plugins built only on Riff's public hooks, `window.riff` and REST, as anyone's plugin would be. `.github/scripts/extension-surface.test.js` fails if one of them reaches past that surface. When an extension needs something Riff doesn't offer, Riff grows a documented extension point; the extension never takes a shortcut.

`packages/` holds what isn't a plugin: `wp-api-coverage` (released, `wp-api-coverage-vX.Y.Z`), `types` (the TypeScript types for the REST API and `window.riff`), `fixtures` (the demo recordings and test media), `benchmarks` and `dev` (local tooling).

## The hosts

| Address | What it is | Built from | Runs on |
| --- | --- | --- | --- |
| `source.riffpress.com` | Open-source Riff: self-hosting, the reference, release notes, the demo | RiffPress, `site/` | Cloudflare Pages |
| `developer.riffpress.com` | The PHP, JavaScript, REST and CSS reference, generated from the code | RiffPress, `docs/` | Cloudflare Pages |
| `riffpress.com` | The platform's own site | riffpress-com, `site/` | Cloudflare Pages |
| `cloud.riffpress.com` | Riff Cloud: each person's Riff at `cloud.riffpress.com/<name>/`, a WordPress network | riffpress-com, `network/` | WP Engine |

A self-hosted Riff is Riff plus whichever extensions and Riff Sign In its owner installs. Riff Cloud is Riff, Riff Sign In, Riff Chords and the Presence API at exact versions, plus Riff Network and Riff Account, all installed by Composer from `network/composer.json`. Riff Lyrics comes along inside Riff. Riff Sing and Riff Meters are left off Cloud on purpose.

## How a change travels

1. A pull request merges on `main` in RiffPress. release-please reads its title and, if it touched a package's folder with a `feat` or `fix`, opens or updates that package's release pull request.
2. Merging the release pull request tags the package, builds its zip with `.github/scripts/build-riff.sh`, and publishes the GitHub release. Riff's release also goes to WordPress.org.
3. Each week, riffpress-com's `riff-upgrade.yml` compares those releases with the pins in `network/composer.json` and opens one pull request moving Riff, Riff Sign In and Riff Chords to the newest.
4. Merging that, or anything else under `network/`, runs `network-deploy.yml`: Composer builds `wp-content/plugins/`, one rsync sends it to WP Engine, the page cache is cleared, and the deploy waits for `cloud.riffpress.com` to answer with `riff-network/v1` in its REST index.

A change to Riff reaches a self-hosted site on its next plugin update, and reaches Cloud within a week, or the same day if the upgrade pull request is run by hand.

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
