=== Riff Sing ===
Contributors: joefusco
Tags: karaoke, singing, music, microphone, midi
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Sing along with the melody in Riff's Now Playing, from a computer microphone or a MIDI instrument, and see how close each line came.

== Description ==

Riff Sing adds a Sing tab next to Up next in Riff's Now Playing, in the spirit of a karaoke game's vocals: the song's melody scrolls past as a lane of notes with its words under it, the singer's voice is drawn as a line against it, and each line gets a gentle score when it ends, made for children singing at home and students on a lessons site rather than a hard grade.

* Octave doesn't count. A child singing an octave above the recording still matches.
* How close counts is the singer's choice: within two semitones, one, or a quarter tone.
* A computer or USB microphone works through the browser, with a choice of input once it is allowed. Echo cancellation stays on so the speakers don't count as singing; headphones work best.
* A MIDI keyboard, or a microphone that sends MIDI notes, works where the browser has Web MIDI (Chrome and Edge; not Safari yet), with exact notes and no guessing.
* The melody is UltraStar's text format, the open format karaoke games such as UltraStar Deluxe and Performous read: a line per syllable, with its start, length and pitch. Paste it into the Melody field of the track's audio file in the Media Library.
* Visitors see a melody only for files the media REST route already shows them.

= Privacy =

Your voice never leaves the browser. The microphone opens only when the singer presses Sing with the microphone, after the browser asks them, and closes when they press Stop listening, leave the tab, close Now Playing or leave the page. The note being sung is worked out on the device, in an AudioWorklet, by the YIN pitch method; no sound is recorded, kept or sent anywhere, and Riff Sing has no server side beyond the melody it reads.

== Changelog ==

= 0.1.0 =
* Riff Sing: a Sing tab beside Up next, where the melody scrolls past and each line is scored by how close the singer comes, from a microphone or a MIDI instrument.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
