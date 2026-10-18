=== Riff Lyrics ===
Contributors: joefusco
Tags: lyrics, music, audio, player
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Own every note, and every word. A Lyrics tab beside Up next in Riff's Now Playing.

== Description ==

Riff Lyrics adds a Lyrics tab next to Up next in Riff's Now Playing, the way streaming apps show the words to the song that is playing.

* The lyrics come from your files. WordPress already reads the lyrics tag in an audio file (ID3 USLT) when you upload it; Riff Lyrics shows them.
* A file without lyrics gets a Lyrics field in the Media Library. It saves into the same place WordPress keeps the file's own lyrics, so nothing new is stored.
* Visitors see lyrics only for files the media REST route already shows them.

It is also the reference extension for Riff: it is built only on Riff's documented public API, so a change to Riff that would break a plugin breaks this one first.

== Changelog ==

= 0.1.0 =
* The Lyrics tab, lyrics read from the file's tags, and the Lyrics field in the Media Library.
