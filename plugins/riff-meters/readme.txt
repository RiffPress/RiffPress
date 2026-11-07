=== Riff Meters (Experimental) ===
Contributors: joefusco
Tags: music, audio, player, vu meter, spectrum
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Experimental. A VU meter and a spectrum under Riff's turntable, read from the music as it plays.

== Description ==

**This plugin is experimental.** It may change or go away between versions.

Riff Meters adds a VU meter and a spectrum under Riff's turntable. The meter follows IEC 60268-17's movement, with its needle drawn as a lit filament. The spectrum is 31 one-third-octave bands, so a lossy file shows where its encoder stopped.

They show only where the music can be measured, so not on an iPhone, nor for a file from another site that doesn't share over CORS, and not for a listener who asks for less motion.

It is built only on Riff's documented public API, and is a small example of filling the place under the turntable.

== Changelog ==



Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
