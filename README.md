<p align="center"><img src="site/brand/mark.png" width="220" height="220" alt=""></p>

<h1 align="center">Riff</h1>

A music player for WordPress with the fit and finish of a streaming app. Install it and the audio
and video blocks in your posts play in a player that stays docked at the bottom of the screen,
with a full Now Playing view, a queue, and a Song/Video switch for tracks that have both.

This repository is the Riff monorepo. <a href="https://riffpress.com/">Landing page</a> and live demo.

| Path | What it is |
| --- | --- |
| `plugins/riff/` | The WordPress plugin. No build step: `assets/riff.js` and `assets/riff.css` are what ships. |
| `packages/fixtures/` | Public-domain audio, video and artwork for demos and tests, and `seed.php`, which turns any folder of audio into a post. |
| `apps/ios/` | Reserved for the native app. |
| `site/` | The landing page, published with GitHub Pages, with a live demo in WordPress Playground. |
| `blueprint.json` | The Playground demo: installs the plugin, uploads the fixtures, seeds a post. |

## WordPress Playground

No install needed: launch a scratch site with Riff and the demo post, built from `main`.

[![Launch Riff in WordPress Playground](https://img.shields.io/badge/Launch-3858E9?style=for-the-badge&logo=wordpress&logoColor=white)](https://playground.wordpress.net/?mode=seamless&blueprint-url=https://raw.githubusercontent.com/RiffPress/RiffPress/preview-main/blueprint.json)

The `preview-main` branch holds `riff.zip`, the demo media and a blueprint that names them, rebuilt by the Playground Main Build workflow on every push to `main`. The [landing page](https://riffpress.com/) embeds the same demo.

## How the player works

The server marks each core audio and video block with its track as a data attribute on the
figure, and leaves the block's own markup alone, so a page still plays if the script never runs.
The script turns those blocks into rows and plays them through one queue: the post's media is
the queue, the row you tap is where it starts. One `<audio>` and one `<video>` element serve the
whole page; a track with a video version plays through whichever is showing, and switching hands
the position across. A phone pauses video when the page goes to the background, so the track
moves to audio while hidden and back when it returns.

Everything else is what a listener expects from a player: Media Session metadata and lock-screen
controls, keyboard shortcuts (Space or K, J and L, Shift+N and Shift+P), AirPlay and Cast when a
device is in reach, swipe the bar to skip, drag Now Playing down to close it, and the queue and
position remembered for the tab's session, so a link to another page keeps playing and a reload
picks up paused where it left off.

The layout follows YouTube Music's current design and measurements, in Riff's own amber.

A track with a video version is set in the Media Library: edit an audio file and fill in
**Video version** with the address of a video in the library.

## Extending it

Every hook is in [docs/hooks.md](docs/hooks.md), generated from the plugin's docblocks. The script's api, actions, filters and events are in [docs/javascript.md](docs/javascript.md). The plugin readme's Developers section has the stability promise, the sources registry, the track schema, REST and GraphQL, and the theming properties.

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

The repository root is mounted in the containers at `wp-content/riff`, which is why seed paths
start there. `.wp-env.override.json` moves the ports when another wp-env on the machine holds them.

## Licence

GPL-2.0-or-later. Roboto, Inter and EB Garamond are bundled under the SIL Open Font License; the
icons are Google's Material Icons under the Apache License 2.0. The demo recordings are by the Airmen of Note, United
States Air Force Band, and are public domain as U.S. Government works.
