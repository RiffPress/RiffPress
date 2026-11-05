=== Riff Lyrics ===
Contributors: joefusco
Tags: lyrics, music, audio, player
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 1.7.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Own every note, and every word. A Lyrics view in Riff's Now Playing.

== Description ==

Riff Lyrics adds a Lyrics view to Riff's Now Playing, opened from its button in the bar or its chip in Now Playing on a phone, the way streaming apps show the words to the song that is playing.

* The lyrics come from your files. WordPress already reads the lyrics tag in an audio file (ID3 USLT) when you upload it; Riff Lyrics shows them.
* Timed lyrics follow the music: the line being sung is marked and kept in view, and a tap on a line takes the track there. They are read in the formats taggers and players already write: LRC, with its [offset:] tag; Enhanced LRC, whose words light up as they are sung; WebVTT; and a file's own synchronised lyrics tag (ID3 SYLT), read when the file is uploaded.
* A file without lyrics gets a Lyrics field in the Media Library. It saves into the same place WordPress keeps the file's own lyrics, so nothing new is stored.
* Visitors see lyrics only for files the media REST route already shows them.

It is also the reference extension for Riff: it is built only on Riff's documented public API, so a change to Riff that would break a plugin breaks this one first.

== Changelog ==

= 1.7.1 =
* Fixed: an extension's text domain stops at the end of its main file, so phpcs never holds Riff's own files to it.
* Fixed: a press on the bar opens Now Playing, and the album's button in the bar is gone.
* Fixed: a tap, a long-press or a double-click on a button never selects its label, while rows, lyrics and chord charts still select.

= 1.7.0 =
* Now Playing's album is the cover where it is upright and the turntable where it is wide, one view with one button.

= 1.6.1 =
* Fixed: a view's button shows only for a track it has something for, and an open view gives way to one without.

= 1.6.0 =
* A track with Riff Lyrics' timed lyrics shows its words under the lane at Riff Lyrics' times.
* Fixed: through a break the lyrics mark, the next line waits under the lane, and lyrics whose file tag starts with a blank line are still read as timed.

= 1.5.0 =
* Riff ships the plugins its manifest names inside itself, each turned on or off from Settings › Riff.
* Now Playing is a view at a time and the bar's controls and views are registered on the server; Lyrics, Sing and Chords are views, Up next and Together are panels, and the tabs are gone.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
