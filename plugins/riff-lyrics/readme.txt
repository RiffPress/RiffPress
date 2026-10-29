=== Riff Lyrics ===
Contributors: joefusco
Tags: lyrics, music, audio, player
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 1.4.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Own every note, and every word. A Lyrics tab beside Up next in Riff's Now Playing.

== Description ==

Riff Lyrics adds a Lyrics tab next to Up next in Riff's Now Playing, the way streaming apps show the words to the song that is playing.

* The lyrics come from your files. WordPress already reads the lyrics tag in an audio file (ID3 USLT) when you upload it; Riff Lyrics shows them.
* Timed lyrics follow the music: the line being sung is marked and kept in view, and a tap on a line takes the track there. They are read in the formats taggers and players already write: LRC, with its [offset:] tag; Enhanced LRC, whose words light up as they are sung; WebVTT; and a file's own synchronised lyrics tag (ID3 SYLT), read when the file is uploaded.
* A file without lyrics gets a Lyrics field in the Media Library. It saves into the same place WordPress keeps the file's own lyrics, so nothing new is stored.
* Visitors see lyrics only for files the media REST route already shows them.

It is also the reference extension for Riff: it is built only on Riff's documented public API, so a change to Riff that would break a plugin breaks this one first.

== Changelog ==

= 1.4.0 =
* Riff, Riff Lyrics and Riff Sign In need WordPress 7.1, and on 7.2 Riff's fields also show in the Media Library's new views.

= 1.3.0 =
* Now Playing is a record in its sleeve, cut to the album's tracks and turned at 33⅓, its tonearm tracking the album, and the Albums view can stand as a shelf.

= 1.2.0 =
* Riff Lyrics and Riff Sign In say which Riff they need, Requires Riff in their headers, stay out of the way on an older one, and CI holds each to the hooks it uses.

= 1.1.1 =
* Fixed: no Show as text switch: the timed lines are already text a screen reader reads as a list.

= 1.1.0 =
* Timed lyrics are read in the formats taggers and players write: LRC with its offset, Enhanced LRC with words that light up as they are sung, WebVTT, and a file's own ID3 SYLT frame on upload.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
