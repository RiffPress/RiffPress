=== Riff Chimera (Experimental) ===
Contributors: joefusco
Tags: singing, voice, synthesizer, music, player
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff, riff-sing
Stable tag: 0.4.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A Chimera panel beside the player: CHIMERA, a physical model of a human voice, sings the track's melody along with the recording while you browse.

== Description ==

**This plugin is experimental.** It is for fun, it may change or go away between versions, and the voice is a simulation, not a singer: expect it to sound like a talented robot.

Riff Chimera adds a Chimera view for any track Riff Sing has a melody for. Open it from its button in the player's bar, or its chip in Now Playing on a phone, and it opens as a panel beside the page, where Up next and About open, with each singer's head drawn in cutaway as large as the panel allows. Keep browsing albums or open Now Playing while CHIMERA sings; it stops when you press Stop, close the panel, or play a track without a melody.

* The voice is [CHIMERA](https://github.com/jamesondh/chimera-vocal-synth), by Jameson Hodge: lungs, vocal folds, a throat, a tongue, a jaw and lips simulated as it sings, with no recordings of anyone in it. Its cutaway head is drawn in the view, moving as it sings.
* The melody is the one Riff Sing keeps for the track, typed in its Melody field or from its Melody file, so Riff Sing must be active. Riff Chimera stores nothing of its own.
* While CHIMERA sings, a song with an instrumental version (Riff Sing's Instrumental field) plays it in place of the recording, from the same second and at the same speed, so the recording's own singers are out of the way. The recording comes back when CHIMERA stops, the view closes or the track changes. A song without one plays as it always has.
* Opening the view starts CHIMERA: it sings with the recording, following it as it plays, pauses, jumps and changes speed, and if the music is paused it waits for it to play. It stops when you press Stop, close the view, change track or leave the page, and Sing along starts it again. Browsing the app, or opening and closing Now Playing, leaves it singing. A view opened without a press, as a script may open it, waits for Sing along, since browsers let a page make sound only after one.
* A duet's two singers (UltraStar's P1 and P2, with P3's lines sung by both) are two CHIMERAs with different voices, low part and high part, their heads facing each other, each with a Solo to hear them alone.
* The Voice slider sets how loud CHIMERA is. The player's own volume sets the recording's, so turning it down leaves CHIMERA alone.
* CHIMERA reads English and Korean. A melody whose chart names another language, or whose words are in another script, is sung on "ah", and the view says so.

Nothing is recorded or sent anywhere, and no microphone is used. CHIMERA's engine (about 1 MB of WebAssembly), its audio processor and its pronouncing dictionary (about 850 KB) are part of this plugin, and are loaded only when the Chimera view is first opened.

It is built only on Riff's documented public API, as Riff Lyrics is.

== Credits ==

CHIMERA is (c) 2026 Jameson Hodge, under the MIT licence, in assets/chimera/LICENSE.txt. The pronouncing dictionary is the CMU Pronouncing Dictionary, under the licence in assets/chimera/CMUDICT-LICENSE.txt. The copy here is built from CHIMERA's source at the commit in assets/chimera/SOURCE.txt, by .github/scripts/build-chimera.sh in Riff's repository.

== Changelog ==

= 0.4.0 =
* Riff Chimera sings from the panel beside the page, its heads drawn as large as the panel, and an open docked view no longer covers the sidebar.

= 0.3.1 =
* Faster: a view the app fetches is sent alone, tabs are fetched only when wanted, and catalog counts are kept without an object cache.

= 0.3.0 =
* A plugin's view can live in the Listen app's sidebar, and Riff Chimera sings from there.

= 0.2.0 =
* A song can name its instrumental version, and Riff Chimera plays it in the recording's place while it sings.
* Fixed: main's checks pass again, and the Chimera view's notes scroll fully into view above the bar.

= 0.1.1 =
* Fixed: main's checks pass again with Riff Chimera, its dictionary vendored as plain text.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
