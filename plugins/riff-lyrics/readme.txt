=== Riff Lyrics ===
Contributors: joefusco
Tags: lyrics, music, audio, player
Requires at least: 7.2
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Own every note, and every word. A Lyrics tab beside Up next in Riff's Now Playing.

== Description ==

Riff Lyrics adds a Lyrics tab next to Up next in Riff's Now Playing, the way streaming apps show the words to the song that is playing.

* The lyrics come from your files. WordPress already reads the lyrics tag in an audio file (ID3 USLT) when you upload it; Riff Lyrics shows them.
* Lyrics with a time on each line, as the LRC format has them and most taggers write them, follow the music: the line being sung is marked and kept in view, and a tap on a line takes the track there.
* A file without lyrics gets a Lyrics field in the Media Library. It saves into the same place WordPress keeps the file's own lyrics, so nothing new is stored.
* Visitors see lyrics only for files the media REST route already shows them.

It is also the reference extension for Riff: it is built only on Riff's documented public API, so a change to Riff that would break a plugin breaks this one first.

== Changelog ==

= 1.0.0 =
* Captions for a video version, a cover's alt text, a track's language, and the song's transcript; the site's accessibility statement.
* Riff needs WordPress 7.2, and registers its media fields with the Entity Fields API so the Media Library's views and forms show them.

= 0.3.0 =
* Timed lyrics follow the music, and a tap on a line seeks to it.

= 0.2.0 =
* Riff's design tokens are one stylesheet, riff-tokens, that its extensions depend on.
* Fixed: signed in, the Listen app and Riff Lyrics ask Riff's and WordPress's routes as the account.

= 0.1.0 =
* Riff Lyrics, a Lyrics tab beside Up next, as a plugin built only on Riff's public API.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
