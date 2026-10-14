=== RiffPlayer ===
Contributors: josephfusco
Tags: music, audio, video, player, media
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 4.12.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A music player for WordPress. The audio and video in your posts, in a player that keeps going while you read, with a full Now Playing screen.

== Description ==

Riff plays the audio, video and playlist blocks WordPress already has. Install it, write a post with audio or video in it, and every track in the post plays in a player docked at the bottom of the screen that keeps going while the reader scrolls on. Tap the bar for Now Playing: the artwork, a thick seek bar, the controls, and the rest of the post queued up next.

* A track with a video version switches between the song and the video without losing its place.
* Lock-screen and headphone controls through Media Session; AirPlay and Cast when a device is in reach.
* Swipe the bar to skip, drag Now Playing down to close it; Space, J, L, Shift+N and Shift+P on a keyboard.
* A link to another page keeps playing; a reload picks up paused where it left off.
* A Riff block, or the [riff] shortcode, turns a page into the place to listen: every post with tracks, opened and played without leaving the page.
* Every track shows its quality as WordPress read it from the file: MP3 · 320 kbps, or FLAC · 24-bit 96 kHz.
* The bar's amber line glows with the music and cools when you pause.
* One script and one stylesheet, no build step, nothing to configure.

Roboto, Inter and EB Garamond are bundled under the SIL Open Font License, and the icons are Google's Material Icons under the Apache License 2.0.

== Installation ==

1. Upload the plugin folder to `wp-content/plugins/` and activate it.
2. Add an audio or video block to a post, one per track, or a playlist block holding them all.
3. To pair a video with a song, edit the audio file in the Media Library and fill in **Video version** with the address of a video in the library.
4. For one page where everything plays, add the Riff block (or `[riff]`) to a page.

== Frequently Asked Questions ==

= Does it change my theme? =

No. The blocks keep their own markup, and the player is added at the end of every page. A page where the script never runs still plays with the browser's native controls.

= Where do the tracks come from? =

From the post. Every audio and video block in the post you are reading is the queue, in order, starting from the one you tapped. A playlist block counts as one track per item.

= Which blocks does it read? =

The ones WordPress ships: the [Audio block](https://wordpress.org/documentation/article/audio-block/), the [Video block](https://wordpress.org/documentation/article/video-block/), and on WordPress 7.1 or newer the [Playlist block](https://wordpress.org/documentation/article/playlist-block/), which holds several tracks picked from the Media Library at once. Nothing is added to the editor; the blocks keep their own markup and their own players underneath, and Riff draws its rows over them. A track's title, artist and album are what WordPress reads from the file on upload, and can be edited in the [Media Library](https://wordpress.org/documentation/article/media-library-screen/) along with Riff's Artwork and Video version fields.

== Developers ==

Riff is built the way a feature plugin would be: one track shape everywhere, read through WordPress's own APIs. Inside the plugin there is a seam: `src/` is the foundation (tracks, sources, the Media Library fields, the block markup, REST and GraphQL, the player), and `features/listen/` is the Listen block and the drawn covers, which build on the foundation only through the surface below.

**Stability.** Everything listed here is public and carries an `@since`. Within a major version a hook keeps its name and parameters, a REST field or route keeps its shape, the track schema keeps its version, and a public CSS custom property keeps its name. Anything that has to go is first deprecated for a release (`apply_filters_deprecated`, a notice in the changelog) and removed in the next major. Anything not listed, such as a class method, a CSS class or an internal custom property like `--riff-heat`, may change at any time.

* **Reference:** everything below has a page in the developer reference at https://riffpress.com/developers/, by language (PHP, JavaScript, REST API, CSS), generated from the plugin's docblocks and checked in CI.
* **Hooks:** every filter and action, with its parameters and the line it fires on, has a page under https://riffpress.com/developers/php/ and https://riffpress.com/developers/javascript/.
* **JavaScript:** `window.riff` is the player's api; `riff.*` actions and filters through `wp.hooks`, and `riff:*` events on `#riff`, announce every change of state. https://riffpress.com/developers/javascript/ has the reference.
* **Sources:** tracks come from registered sources. The core source reads audio, video and playlist blocks in posts; a plugin adds its own post type or catalogue by implementing `Riff\Source` and calling `Riff\Sources::register()` on `init`, or through the `riff_sources` filter.
* **Track schema:** one shape, `Riff\Tracks::schema()`, version `Riff\Tracks::SCHEMA_VERSION`, shared by REST, the block markup and the script, and held to after the `riff_track` filter. WPGraphQL's `RiffTrack` carries most of it.
* **REST:** every audio and video item in `wp/v2/media` carries `riff_track`. `riff/v1/library` lists the posts with tracks; `riff/v1/library/{id}` opens one with its tracks and rendered blocks. All describe themselves on OPTIONS.
* **WPGraphQL:** when it is active, `MediaItem.riffTrack` and `Post.riffTracks`.
* **Controls:** `riff_chips` adds chips under Now Playing's controls; `riff_bar_controls` adds controls to the end of the bar on a wide screen. The player announces a press as `riff.action`.
* **Block and shortcode:** `riff/app` (with colour, typography and padding supports) and `[riff]` turn a page into the place to listen.
* **Markup:** every core audio and video block carries its track as `data-riff-track` on the figure; `riff_before_player` and `riff_after_player` wrap the player's markup.
* **Theming:** the public custom properties on `#riff` are `--riff-accent`, `--riff-bg`, `--riff-surface`, `--riff-fg`, `--riff-fg-2`, `--riff-fg-3`, `--riff-line`, `--riff-hover` and `--riff-bar-h`; on the Listen block, `--riff-app-bg`, `--riff-app-surface`, `--riff-app-ink`, `--riff-app-ink-2`, `--riff-app-line`, `--riff-app-accent`, `--riff-app-accent-deep` and `--riff-app-accent-tint`. A theme sets the accent in `theme.json` under `settings.custom.riff.accent`, or any plugin through `riff_accent`.
* **Covers:** a post with no image of its own gets a drawn cover, a record with one groove per track in wordpress.org's palette, from `?riff-art={post}` as SVG with the fonts embedded; `riff_art_palettes` and `riff_art_layouts` shape it, `riff_art_svg` can replace it, and `?riff-art=sheet` shows every palette and layout to anyone who can edit posts.

== Changelog ==

See CHANGELOG.md in the repository.
