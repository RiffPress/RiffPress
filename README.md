<p align="center"><img src="site/brand/mark.png" width="160" height="160" alt="Riff"></p>

<p align="center"><strong>A music player for WordPress.</strong> Publish from the Media Library; your listeners get a streaming app.</p>

<p align="center">
<a href="https://github.com/RiffPress/RiffPress/releases?q=v4&expanded=true"><img src="https://img.shields.io/github/v/release/RiffPress/RiffPress?filter=v4*&label=release&color=1e1e1e" alt="Latest release"></a>
<img src="https://img.shields.io/badge/WordPress-7.0%2B-1e1e1e?logo=wordpress" alt="WordPress 7.0 or newer">
<img src="https://img.shields.io/badge/PHP-8.1%2B-1e1e1e?logo=php&logoColor=white" alt="PHP 8.1 or newer">
<a href="LICENSE"><img src="https://img.shields.io/badge/licence-GPL--2.0--or--later-1e1e1e" alt="GPL-2.0-or-later"></a>
</p>

<p align="center"><a href="https://riffpress.com/">Website</a> · <a href="https://riffpress.com/demo">Live demo</a> · <a href="https://riffpress.com/download/">Download</a> · <a href="https://github.com/RiffPress/RiffPress/releases?q=riff-desktop&expanded=true">Desktop app</a></p>

<p align="center"><img src="site/desktop-listen.png" alt="The Listen app in Spotify's layout: the library in a panel at the side, home and search across the top, a grid of album covers, and the player bar along the bottom" width="880"></p>

## What it does

Install Riff, and the audio, video and playlist blocks already in your posts play in one player
docked at the bottom of the screen. Nothing to configure, and no new place to upload: your music
stays in the Media Library.

- **A player that feels like an app:** a full-screen Now Playing, a queue, lyrics with Riff Lyrics,
  and a Song/Video switch for tracks that have both. Media keys and the lock screen work too.
- **A library to browse:** a Listen page with albums, artists and tracks, filed from your files'
  own tags, with search as you type and album pages tinted from their covers.
- **Things for listeners to keep:** likes, playlists and recently played, in their account or in
  the browser if they aren't signed in.
- **An app of its own:** the Listen page installs as a web app, and the
  [desktop app](packages/desktop/) puts it in a window with media keys, a Dock menu and drag and
  drop import.
- **Protected files:** a track can stay unplayable to visitors who can't read its post.
- **Room to extend:** documented hooks, a JavaScript API, REST routes and CSS custom properties,
  with [Riff Lyrics](plugins/riff-lyrics/) built only on them.

## Get started

1. Download the zip from [riffpress.com/download](https://riffpress.com/download/), and upload it
   under **Plugins › Add New Plugin › Upload Plugin**. Riff needs WordPress 7.0 and PHP 8.1 or newer.
2. Press **Create Listen page** in the notice on the Dashboard, or add the Riff block to any page.
3. Add music: upload audio to the Media Library, or put an audio or playlist block in a post. Riff
   files each track under its album and artist as it arrives.

To try it first, with nine public-domain albums and nothing to install:

[![Launch Riff in WordPress Playground](https://img.shields.io/badge/Launch-FFB020?style=for-the-badge&logo=wordpress&logoColor=1E1E1E)](https://riffpress.com/demo)

## How the player works

### Blocks become one queue

- The server marks each core audio and video block with its track, as a data attribute on the
  figure, and each item of a playlist block (WordPress 7.1) with its own. It leaves the block's
  markup alone, so a page still plays if the script never runs.
- A playlist's own player is not started, since it fetches the whole current file to draw its
  waveform. The page's player plays the playlist's tracks instead.
- The script turns those blocks into rows and plays them through one queue: the post's media is
  the queue, and the row you tap is where it starts.
- One `<audio>` and one `<video>` element serve the whole page. A track with a video version plays
  through whichever is showing, and switching hands the position across.
- A phone pauses video when the page goes to the background, so the track moves to audio while
  hidden and back when it returns.

### What else it does

The rest is what a player should do:

- Media Session gives the lock screen its metadata and controls.
- AirPlay and Cast appear when a device is in reach.
- A swipe on the bar skips, and a drag on Now Playing closes it.
- The queue and position are kept for the tab's session. A full-page navigation saves them and
  attempts to resume on the next page; a reload restores the same track paused.

On a keyboard:

| Keys | Action |
| --- | --- |
| Space or K | Play and pause |
| J and L | Back and forward ten seconds |
| Shift+N and Shift+P | Next and previous track |
| Escape | Close Now Playing |

Nothing fires while you type in a field. A site can turn the single-key shortcuts off with the
`riff.shortcuts` filter, as WCAG 2.1.4 asks.

### Addresses

| Address | What it opens |
| --- | --- |
| A post's address with `?riff_track=<id>` | The post on that track, focused and not playing. Whatever is already playing is left alone. This is what Share links to. |
| A Listen page with `?riff_page=2` | The same posts Load more showed, when reloaded or shared. It works without JavaScript. |

### A Listen page

A dedicated Listen page lists posts with audio or video. Opening a post keeps you on that page
while its tracks play, and Load more adds the next page of posts in place. To make one, do any of
these:

- Press **Create Listen page** in the notice Riff shows on the Dashboard after activation.
- Create a WordPress page and add the Riff block.
- Put `[riff]` in a page's content.

Listeners can install the Listen page's `app/` address as an app of its own. From their second visit Riff offers it, with the browser's own Install where there is one (Chrome and Edge) and the steps where there is not (Safari's Add to Dock and Add to Home Screen). Installed from Chrome or Edge on a computer it has no title bar and is laid out as the desktop app is. Its name and icon are the site's, so set a site icon under **Settings › General**.

### Video versions

A track with a video version is set in the Media Library: click an audio file and choose a video
under **Video version**.

### Design

On a computer the Listen app is laid out in Spotify's frame: back and forward, home and search across the top, the library and the view as panels on black, and the player bar along the bottom with the seek line under the controls, as Tidal arranges it. Phones and tablets keep a touch layout. It's all in Riff's amber. [DESIGN.md](DESIGN.md) has the rest.

## Extending it

- The developer reference is at [riffpress.com/developers](https://riffpress.com/developers/), one
  section per language: [PHP](https://riffpress.com/developers/php/),
  [JavaScript](https://riffpress.com/developers/javascript/),
  [REST API](https://riffpress.com/developers/rest/) and [CSS](https://riffpress.com/developers/css/).
  Every page is generated from the plugin's own docblocks and registration code.
- CI fails a change that adds a hook, a `window.riff` member, a `Riff\Source` method or a REST
  argument without documenting it. A custom property is public only once it has a docblock.
- [docs/hooks.md](docs/hooks.md) and [docs/javascript.md](docs/javascript.md) are the same hooks and
  `window.riff` reference, for reading on GitHub.
- [.github/SUPPORT.md](.github/SUPPORT.md) has the stability promise.

## What is in this repository

| Path | What it is |
| --- | --- |
| `plugins/riff/` | The WordPress plugin. No build step: `assets/riff.js` and `assets/riff.css` are what ships. |
| `plugins/riff-lyrics/` | Riff Lyrics, the reference extension: a Lyrics tab in Now Playing, built only on Riff's documented API. |
| `packages/fixtures/` | Public-domain audio, video and artwork for demos and tests, and `seed.php`, which turns any folder of audio into a post. |
| `packages/wp-api-coverage/` | A command-line tool that lists the WordPress APIs a plugin uses and the ones it doesn't use yet. `npm run api-coverage` runs it on Riff. |
| `packages/desktop/` | Riff for the desktop: a site's Listen library in an Electron window of its own, with media keys and Now Playing. |
| `apps/ios/` | Reserved for the native app. |
| `site/` | The landing page, published with GitHub Pages, with a live demo in WordPress Playground. |
| `blueprint.json` | The Playground demo: installs the plugin, uploads the fixtures, seeds a post. |

## Docs in this repository

| File | What it covers |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | Who Riff is for, what it does, and what is out of scope. |
| [DESIGN.md](DESIGN.md) | How the player and the Listen block look and behave. |
| [docs/native.md](docs/native.md) | What Riff uses from WordPress as is, what it adds, why, and the core ticket for each. |
| [docs/hooks.md](docs/hooks.md), [docs/javascript.md](docs/javascript.md) | The hooks and `window.riff`, generated from the code. |
| [docs/iphone-checklist.md](docs/iphone-checklist.md) | What to check on a real iPhone before a release. |
| [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) | Setup, checks, pull requests and releases. |
| [.github/SUPPORT.md](.github/SUPPORT.md), [SECURITY.md](SECURITY.md) | Supported versions, the public API promise, and reporting a vulnerability. |
| [AGENTS.md](AGENTS.md) | Notes for coding agents. |

## Development

```
npm install
npm run env:start      # WordPress at http://localhost:8890, the tests site at :8891
npm run seed:tests     # the public-domain demo post on the tests site
npm run seed:tests -- wp-content/riff/path/to/your/music   # any folder of audio, as a post
npm run lint
npm run test:e2e
npm run test:php
```

- The repository root is mounted in the containers at `wp-content/riff`, which is why seed paths
  start there.
- `.wp-env.override.json` moves the ports when another wp-env on the machine holds them.
- [riffpress.com/demo](https://riffpress.com/demo) opens the demo built from the latest release. For
  what is on `main` right now, use the `preview-main` branch: the Playground Main Build workflow
  rebuilds `riff.zip`, the demo media and a blueprint that names them on every push to `main`, at
  `https://playground.wordpress.net/?mode=seamless&blueprint-url=https://raw.githubusercontent.com/RiffPress/RiffPress/preview-main/blueprint.json`.

## Licence

- Riff is GPL-2.0-or-later.
- Roboto, Inter and EB Garamond are bundled under the SIL Open Font License.
- The logo is drawn from EB Garamond and Bravura, both under the SIL Open Font License
  ([site/brand/](site/brand/README.md)).
- The icons are Google's Material Icons, under the Apache License 2.0.
- The demo recordings are by the Airmen of Note, United States Air Force Band, and are public domain
  as U.S. Government works.
