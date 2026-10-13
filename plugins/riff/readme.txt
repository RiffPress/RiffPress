=== Riff ===
Contributors: josephfusco
Tags: music, audio, video, player, media
Requires at least: 6.5
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A music player for WordPress. The audio and video in your posts, in a player that stays with you, with a full Now Playing screen.

== Description ==

Riff plays the audio and video blocks WordPress already has. Install it, write a post with audio or video in it, and every track in the post plays in a player docked at the bottom of the screen that keeps going while the reader scrolls on. Tap the bar for Now Playing: the artwork, a thick seek bar, the controls, and the rest of the post queued up next.

* A track with a video version switches between the song and the video without losing its place.
* Lock-screen and headphone controls through Media Session; AirPlay and Cast when a device is in reach.
* Swipe the bar to skip, drag Now Playing down to close it; Space, J, L, Shift+N and Shift+P on a keyboard.
* A link to another page keeps playing; a reload picks up paused where it left off.
* A Riff block, or the [riff] shortcode, turns a page into the place to listen: every post with tracks, opened and played without leaving the page.
* The bar's amber line glows with the music and cools when you pause.
* One script and one stylesheet, no build step, nothing to configure.

Roboto, Inter and EB Garamond are bundled under the SIL Open Font License, and the icons are Google's Material Icons under the Apache License 2.0.

== Installation ==

1. Upload the plugin folder to `wp-content/plugins/` and activate it.
2. Add an audio or video block to a post. That is the whole setup.
3. To pair a video with a song, edit the audio file in the Media Library and fill in **Video version** with the address of a video in the library.
4. For one page where everything plays, add the Riff block (or `[riff]`) to a page.

== Frequently Asked Questions ==

= Does it change my theme? =

No. The blocks keep their own markup, and the player is added at the end of every page. A page where the script never runs still plays with the browser's native controls.

= Where do the tracks come from? =

From the post. Every audio and video block in the post you are reading is the queue, in order, starting from the one you tapped.

== Developers ==

Riff is built the way a feature plugin would be: one track shape everywhere, read through WordPress's own APIs. Inside the plugin there is a seam: `src/` is the foundation (tracks, the Media Library fields, the block markup, REST and GraphQL, the player), and `features/listen/` is the Listen block and the drawn covers, which build on the foundation only through the filters, actions and routes below.

* **REST:** every audio and video item in `wp/v2/media` carries `riff_track`: id, src, type, title, artist, album, duration, art, video, post. `riff/v1/library` lists the posts with tracks; `riff/v1/library/{id}` opens one with its tracks and the rendered blocks. Both describe themselves on OPTIONS.
* **WPGraphQL:** when it is active, `MediaItem.riffTrack` and `Post.riffTracks`.
* **Block and shortcode:** `riff/app` and `[riff]` turn a page into the place to listen.
* **Markup:** every core audio and video block carries its track as `data-riff-track` on the figure; anything can read it.
* **Filters:** `riff_enabled`, `riff_track`, `riff_library_query`, `riff_strings`, `riff_player_data`, `riff_art_palettes`, `riff_art_svg`.
* **Actions:** `riff_before_player`, `riff_after_player`.
* **Address:** `?riff-art={post}` serves a post's drawn cover as SVG.

== Changelog ==

See CHANGELOG.md in the repository.
