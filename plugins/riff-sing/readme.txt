=== Riff Sing (Experimental) ===
Contributors: joefusco
Tags: karaoke, singing, music, microphone, midi
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 0.5.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Sing along with the melody in Riff's Now Playing, from a computer microphone or a MIDI instrument, and see how close each line came.

== Description ==

**This plugin is experimental.** It may change or go away between versions.

Riff Sing adds a Sing view to Riff's Now Playing, opened from its button in the player's bar, in the spirit of a karaoke game's vocals: the song's melody scrolls past as a lane of notes with its words under it, the singer's voice is drawn as a line against it, and each line gets a gentle score when it ends, made for children singing at home and students on a lessons site rather than a hard grade.

* Octave doesn't count. A child singing an octave above the recording still matches.
* How close counts is the singer's choice: within two semitones, one, or a quarter tone.
* A computer or USB microphone works through the browser, with a choice of input once it is allowed. Echo cancellation stays on so the speakers don't count as singing; headphones work best.
* A MIDI keyboard, or a microphone that sends MIDI notes, works where the browser has Web MIDI (Chrome and Edge; not Safari yet), with exact notes and no guessing.
* The melody is UltraStar's text format, the open format karaoke games such as UltraStar Deluxe and Performous read: a line per syllable, with its start, length and pitch, its beats counted from the start of the song or, in a chart marked #RELATIVE:yes, from the start of each line. Paste it into the Melody field of the track's audio file in the Media Library.
* Or the melody comes from a score: upload its MIDI file (.mid) to the Media Library and name it in the audio file's Melody file field. Its vocal track, the one its lyrics fall on or else the one named for a voice, is the tune, with the lyrics the file carries, timed from the start of the song. The player fetches the file, so where uploads are served from another host, as an offload plugin does, that host has to allow it (CORS).
* With Riff Lyrics active, a track that has timed lyrics too (LRC, Enhanced LRC or WebVTT in its Lyrics field) shows them under a lone singer's lane, each line and word at the time Riff Lyrics shows it, in place of the melody's syllables; through a break the lyrics mark, the next line waits under the lane. A duet keeps each singer's own words, as lyrics don't say who sings which line.
* A duet's two singers (UltraStar's P1 and P2, and P3 for the lines both sing) each get a lane of their own and are scored on their own, one microphone each or a MIDI input each.
* Visitors see a melody only for files the media REST route already shows them.

= Privacy =

Your voice never leaves the browser. The microphone opens only when the singer presses Sing with the microphone, after the browser asks them, and closes when they press Stop listening, leave the view, close Now Playing or leave the page. The note being sung is worked out on the device, in an AudioWorklet, by the YIN pitch method; no sound is recorded, kept or sent anywhere, and Riff Sing has no server side beyond the melody it reads.

== Changelog ==

= 0.5.0 =
* Riff's icons are WordPress's own, with the few it lacks drawn to match.

= 0.4.1 =
* Fixed: an extension's text domain stops at the end of its main file, so phpcs never holds Riff's own files to it.

= 0.4.0 =
* Now Playing's album is the cover where it is upright and the turntable where it is wide, one view with one button.

= 0.3.1 =
* Fixed: a view's button shows only for a track it has something for, and an open view gives way to one without.

= 0.3.0 =
* A track with Riff Lyrics' timed lyrics shows its words under the lane at Riff Lyrics' times.
* Fixed: through a break the lyrics mark, the next line waits under the lane, and lyrics whose file tag starts with a blank line are still read as timed.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
