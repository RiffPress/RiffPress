=== Riff Chords (Experimental) ===
Contributors: joefusco
Tags: chords, guitar, music, practice, player
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 0.7.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A Chords view in Riff's Now Playing: a chord chart that follows the song, and practice controls for playing along.

== Description ==

**This plugin is experimental.** It may change or go away between versions.

Riff Chords adds a Chords view to Riff's Now Playing, opened from its button in the player's bar, for lessons, music shops and anyone learning a song by ear.

* The chart is ChordPro, the format chord sheets are already written in: a chord in square brackets before the word it falls on, such as [G]Here [C]it comes, and directives in braces for the title, key, capo, tempo, time signature, comments and the song's parts ({start_of_verse}, {start_of_chorus: Chorus 2}, {start_of_tab} and the rest).
* The chart follows the music when it has times, written the way LRC times a lyric line: [01:02.50] at the start of a line, and before any chord that falls somewhere else, as in [01:02.50][G]. A line's first chord is played when the line starts, and chords without a time of their own are spread evenly between the times around them.
* The chord being played is drawn as a guitar or ukulele fingering, or on a piano's keys, with the next chord beside it. A chart without times shows every chord in it instead. The instrument is chosen in the Chords view, and the listener's browser remembers it.
* Slow the song down, or speed it up, from 50% to 150%, and its pitch stays where it was.
* Loop a part: A where it starts and B where it ends, or Loop beside a part's name. For a chart with a {tempo}, Count in clicks out the last bar before B at that tempo, as many beats as its {time} gives (four without one), so a player knows when the loop comes round; the music plays on under it, and it is off until it is turned on.
* Transpose and capo change the chords' names and fingerings, not the music. A piano has no capo, so with Piano chosen the chords are named as they sound.
* The loop, the speed and transpose have keys, which act while the Chords view shows a chart: A sets where the loop starts, then where it ends, then clears it, and pressed again before the music is past the start, moves the start; S and F slow the song down and speed it up; D and U transpose it down and up. They are single-key shortcuts like Riff's own, on and off with them on the listener's profile.
* A tap on a line, or on a part's name, takes the song there.
* Practice this, in the ⋯ menu of a track with a chart, plays it and opens the Chords view on it. A track already in the queue is played from its place there; with shuffle on, the tracks after it are shuffled again, and a long list keeps only what has loaded. Any other track plays on its own.
* The chart is typed into a Chords field on the audio file in the Media Library, kept as the file's own meta and read through the media REST route, so visitors see a chart only for files that route already shows them.

It is built only on Riff's documented public API, as Riff Lyrics is.

== Changelog ==

= 0.7.0 =
* Each plugin declares what it needs in isolation.json, and CI fails code that reaches past it.
* Experimental sandbox runs an untrusted extension's PHP in php-wasm, behind a bridge that grants only its manifest.
* The accent comes from the cover playing, muted to read on black, and the site's accent stands in for a grey one.
* Abilities for an owner and an assistant, offered over MCP through the MCP Adapter once the site turns it on.
* Typed SDK generated from the code, and a post's blocks as a typed tree over REST.
* Fixed: main's checks pass again after the drafts merged untested, each plugin declaring what they added and About crediting only a caption a file has.

= 0.6.0 =
* The VU meter and spectrum move to an experimental plugin, in a place Riff keeps under the turntable.

= 0.5.0 =
* Riff's icons are WordPress's own, with the few it lacks drawn to match.

= 0.4.1 =
* Fixed: an extension's text domain stops at the end of its main file, so phpcs never holds Riff's own files to it.
* Fixed: a press on the bar opens Now Playing, and the album's button in the bar is gone.
* Fixed: a tap, a long-press or a double-click on a button never selects its label, while rows, lyrics and chord charts still select.

= 0.4.0 =
* Now Playing's album is the cover where it is upright and the turntable where it is wide, one view with one button.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
