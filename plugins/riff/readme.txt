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
* A reload or a link to another page picks up paused where it left off.
* The bar's amber line glows with the music and cools when you pause.
* One script and one stylesheet, no build step, nothing to configure.

Roboto is bundled under the SIL Open Font License, and the icons are Google's Material Icons under the Apache License 2.0.

== Installation ==

1. Upload the plugin folder to `wp-content/plugins/` and activate it.
2. Add an audio or video block to a post. That is the whole setup.
3. To pair a video with a song, edit the audio file in the Media Library and fill in **Video version** with the address of a video in the library.

== Frequently Asked Questions ==

= Does it change my theme? =

No. The blocks keep their own markup, and the player is added at the end of every page. A page where the script never runs still plays with the browser's native controls.

= Where do the tracks come from? =

From the post. Every audio and video block in the post you are reading is the queue, in order, starting from the one you tapped.

== Changelog ==

See CHANGELOG.md in the repository.
