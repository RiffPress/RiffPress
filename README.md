<p align="center"><img src="site/brand/mark.png" width="128" height="128" alt="Riff"></p>

<p align="center"><strong>Your music, on your own site, played the way your listeners already love.</strong><br>A music player for WordPress.</p>

<p align="center"><a href="https://next.riffpress.com/listen/app/"><strong>Try the live demo</strong></a> · <a href="https://riffpress.com/download/">Download</a> · <a href="https://riffpress.com/">riffpress.com</a></p>

<p align="center"><img src="site/desktop-listen.png" alt="Riff on a computer: the library at the side, a grid of album covers, and the player bar along the bottom" width="880"></p>

- **Upload, and it's an album.** Put your music in the Media Library. Riff files it by album and artist. Nothing to sign up for, and nobody takes a cut.
- **Everything a streaming app does.** Now Playing, Up next, likes, playlists, search, the lock screen, AirPlay and Cast.
- **It keeps playing.** The music carries on as listeners move around your site, and they can install it as an app.

## Get started

1. Download [riff.zip](https://riffpress.com/download/) and upload it under **Plugins › Add New Plugin**.
2. Press **Create Listen page** on the Dashboard.

Riff needs WordPress 7.1 and PHP 8.1. There is nothing to configure. On WordPress 7.2 its fields also show in the Media Library's new views and forms.

## Build on it

Riff's [PHP, JavaScript, REST and CSS reference](https://developer.riffpress.com/) is the whole public API, and [Riff Lyrics](plugins/riff-lyrics/) is built on nothing else. To work on Riff itself, start with [CONTRIBUTING](.github/CONTRIBUTING.md).

## What Riff finds in WordPress

Building a music library on the Media Library turns up places where WordPress falls short, some of them long known. Riff works around each one and writes it down in [docs/native.md](docs/native.md) with its core ticket, so the workaround can go once core fixes it.

| Core ticket | What Riff ran into |
|---|---|
| [#66417](https://core.trac.wordpress.org/ticket/66417), reported while building Riff | A FLAC, Ogg or M4A file's tags are read and then dropped, because WordPress keeps only ID3, so those files arrive with no title, artist or album. |
| [#17255](https://core.trac.wordpress.org/ticket/17255) | Every upload is a public file, whatever post it belongs to. |
| [#55950](https://core.trac.wordpress.org/ticket/55950) | No passkeys, and no way to sign in without a password. |
| [#59510](https://core.trac.wordpress.org/ticket/59510), [#61900](https://core.trac.wordpress.org/ticket/61900) | No way to stop core printing the title and viewport tags on a page that prints its own. |
| [#61728](https://core.trac.wordpress.org/ticket/61728) | No stable block supports for border and typography, after Gutenberg reverted them. |

## Licence

Riff is GPL-2.0-or-later.

<details>
<summary>Credits</summary>

- Roboto, Inter and EB Garamond are bundled under the SIL Open Font License.
- The logo is drawn from EB Garamond and Bravura, both under the SIL Open Font License ([site/brand/](site/brand/README.md)).
- The icons are WordPress's own (`@wordpress/icons`, GPL), with the few it lacks drawn to match.
- The demo recordings are by the Airmen of Note, United States Air Force Band, and are public domain as U.S. Government works.

</details>
