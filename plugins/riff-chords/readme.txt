=== Riff Chords ===
Contributors: joefusco
Tags: chords, guitar, music, practice, player
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 0.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A Chords view in Riff's Now Playing: a chord chart that follows the song, and practice controls for playing along.

== Description ==

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

= 0.3.0 =
* A track with Riff Lyrics' timed lyrics shows its words under the lane at Riff Lyrics' times.
* Fixed: through a break the lyrics mark, the next line waits under the lane, and lyrics whose file tag starts with a blank line are still read as timed.

= 0.2.0 =
* A count-in at the chart's tempo over a loop's last bar, off until it is turned on.
* Keys for the loop, the speed and transpose, A, S and F, D and U, while the Chords view shows a chart.
* Practice this in a track's menu, for a track with a chart, plays it and opens the Chords view on it.
* Ukulele fingerings and a piano's keys beside the guitar's, chosen in the Chords view and kept in the listener's browser.
* Fixed: a piano names each note as its chord spells it and draws its keys white and black on any theme, and the key line is the key the song sounds in.
* Fixed: Practice this keeps the queue's order, shuffle and later pages, and is offered only for a chart the visitor can read.
* Fixed: Practice this plays a track already in the queue from its place, and isn't offered for a track with nothing to play.

= 0.1.0 =
* Now Playing is a view at a time and the bar's controls and views are registered on the server; Lyrics, Sing and Chords are views, Up next and Together are panels, and the tabs are gone.
* Riff Chords, a chord chart that follows the song, with practice controls to slow it down, loop a part, transpose and set a capo.
* Fixed: the chart's meta is registered on init, so WordPress no longer warns that Riff Chords loads its translations too early.

= 0.1.0 =
* Riff Chords: a chord chart that follows the song, with its fingerings, and practice controls to slow it down, loop a part, transpose and set a capo.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
