=== Riff Lyrics ===
Contributors: joefusco
Tags: lyrics, music, audio, player
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 1.9.3
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

= 1.9.3 =
* Fixed: main's versions agree with the release manifest again.

= 1.9.2 =
* Fixed: CI is green again: the Rights meta test registers its keys, the albums route asks once whether any music has an end, and the tests expect the renamed Together and account menu.

= 1.9.1 =
* Fixed: two saves at once both keep, a sign-in link gets through a private site's gate, and a release with nothing downstream is not red.

= 1.9.0 =
* Each plugin declares what it needs in isolation.json, and CI fails code that reaches past it.
* Experimental sandbox runs an untrusted extension's PHP in php-wasm, behind a bridge that grants only its manifest.
* The accent comes from the cover playing, muted to read on black, and the site's accent stands in for a grey one.
* Abilities for an owner and an assistant, offered over MCP through the MCP Adapter once the site turns it on.
* Typed SDK generated from the code, and a post's blocks as a typed tree over REST.
* Fixed: main's checks pass again after the drafts merged untested, each plugin declaring what they added and About crediting only a caption a file has.

= 1.8.0 =
* Riff's icons are WordPress's own, with the few it lacks drawn to match.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
