=== Riff Music Player ===
Contributors: joefusco
Tags: music, audio, video, player, media
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 4.22.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Own every note. Publish music from your Media Library, and your listeners get a streaming player that keeps playing while they read.

== Description ==

Riff turns the music in your WordPress Media Library into a streaming player on a site you own. You publish the way you already do, with the Audio, Video and Playlist blocks WordPress ships. Your listeners get a player that works like the music apps they already use.

There's no other account to sign up for, nobody takes a cut, and your files stay on your server at the quality you uploaded. Riff publishes and plays your music. It doesn't sell music or take payments.

= For your listeners =

* A player docked at the bottom of the screen that keeps playing while they scroll, open another post, or lock their phone.
* Now Playing, with the artwork, the controls and the rest of the album lined up next.
* Controls on the phone's lock screen and on headphones, plus AirPlay and Chromecast when a speaker or TV is in reach.
* A song with a video, such as a live take, switches between the two without losing its place.
* Swipe the bar to skip, and use Space, J, L, Shift+N and Shift+P on a keyboard.
* Follow a link to another page and the music carries on; reload and it's paused where it was.
* Each track shows its quality as WordPress read it from the file, such as MP3 · 320 kbps or FLAC · 24-bit 96 kHz.

= One page where everything plays =

Add the Riff block to a page, and it becomes your Listen page: every album as a cover, plus browsing by album, artist and track, and one search box. The music keeps playing while listeners move around it.

* A heart on every track, album and artist fills Your Library.
* Signed-in listeners make their own playlists, and their likes and recently played follow their account.
* Add `app/` to the page's address, for example `/listen/app/`, for the player on its own without your theme, which a browser can install as an app.

= You publish from WordPress =

Upload your tracks to the Media Library and put them in a post. WordPress reads the titles, artists, albums and artwork from the files, and Riff files every track under its album and artist from those same tags. If an album has no cover, Riff draws one: a record with one groove per track.

There's nothing to configure and no settings screen. Riff adds one script, one stylesheet, two fields on media (Artwork and Video version), and the Riff block.

[RiffPress.com](https://riffpress.com/) has a live demo with nine albums that runs in your browser, with nothing to install. [Add your music](https://riffpress.com/add-music/) walks through putting your first album online, starting from nothing.

= For developers =

Riff has documented hooks, a JavaScript API, REST routes, WPGraphQL fields and CSS custom properties, and lets other plugins add their own source of tracks. The [developer reference](https://riffpress.com/developers/) covers all of it, generated from the plugin's own code, and says what stays stable between versions.

== External services ==

Riff sends no data to RiffPress or to anyone else, it loads no scripts, fonts or styles from another server, and it has no tracking or analytics. Its fonts and icons are bundled in the plugin.

The Listen page shows a signed-in listener's picture with WordPress's own avatars. When avatars are on (Settings, Discussion, Show Avatars), WordPress loads that picture from Gravatar, a service run by Automattic, sending a hash of the listener's email address. So that a listener without a Gravatar sees their initial rather than a grey silhouette, your site also asks Gravatar, at most once a day per listener, whether that hash has a picture. Gravatar's terms: https://gravatar.com/terms. Its privacy policy: https://automattic.com/privacy/. Turn avatars off and Riff shows the listener's initial instead, and nothing is sent to Gravatar.

AirPlay and Chromecast use the casting your listener's browser already has built in, so Riff loads no Google Cast or Apple code. The browser talks to the speaker or TV on the listener's own network.

Your posts can still point at audio or video hosted somewhere else, and Riff will play it from there, the same way WordPress's own Audio and Video blocks do.

== Installation ==

1. In your dashboard, go to Plugins > Add New Plugin, search for Riff, and press Install Now, then Activate.
2. Add an Audio block for each track to a post, or one Playlist block holding them all, and publish it.
3. To make a Listen page, add a page, type `/riff` on an empty line to add the Riff block, and publish it.
4. To pair a song with its video, click the audio file in the Media Library and choose a video under Video version.

== Frequently Asked Questions ==

= Which file formats can I use? =

Any audio or video file WordPress accepts and your listener's browser can play. For music, MP3, M4A, FLAC, WAV and OGG all work. For video, use MP4 or WebM. Riff plays the file you uploaded at its own quality; it doesn't convert anything.

= Can I keep an album private? =

Yes. Make the post private, a draft, or password protected, and its tracks stay out of the Listen page's browsing and search for visitors.

To keep the files themselves private, tick Protected on an audio or video file in the Media Library. Riff moves it into a folder of its own and only sends it to visitors who can read its post. Tools > Site Health tells you if your web server needs a rule to keep that folder closed, and shows the rule. Deleting Riff moves protected files back first.

Membership and store plugins can decide who may play each track. A locked track stays listed with a lock that leads to your sign-up page. The [developer reference](https://riffpress.com/developers/php/) shows how.

= Does it work with my theme? =

Yes, with any theme. The player at the bottom of the screen keeps Riff's own look on every site, the way a streaming app does. The Riff block takes its colours and fonts from your theme, and you can change them under Styles > Blocks > Riff in the Site Editor, or on one block in its settings. The Listen page template, which shows the block with no header or footer, needs a block theme.

Riff doesn't change your posts. The blocks keep their own markup and their own players underneath, so a page still plays if Riff's script doesn't load.

= Where are my files stored? =

In your Media Library, in your site's uploads folder on your own server, exactly as WordPress stores them. Riff doesn't copy them anywhere else. Protected files move to a folder of their own inside uploads.

Riff keeps very little of its own: the link between a song and its video, the album and artist it files each track under, and each listener's likes, recently played and playlists. Deleting Riff from the Plugins screen removes its links, albums, artists, likes and recently played, and leaves your files, their tags and their images alone.

= Can I add video? =

Yes, in two ways. A Video block in a post plays in the same player as the songs around it. Or, for a song that has a video, such as a live take or a music video, click the audio file in the Media Library and choose the video under Video version. Listeners then get a switch in Now Playing that flips between the song and the video without losing their place.

= Where does the queue come from? =

From the post. Every audio and video block in the post is the queue, in order, starting from the track you tapped. On the Listen page, an album, an artist or a playlist is the queue.

= Can I add a whole folder of albums at once? =

Yes, if you can use WP-CLI. `wp riff import` with the path to a folder uploads the files to the Media Library and makes one album post for each folder that holds audio. Run it again and it skips what it already imported.

= Does Riff set cookies or keep personal data? =

A signed-in listener's likes and recently played are saved to their account, and Tools > Export Personal Data and Erase Personal Data include them. A visitor's stay in their own browser's storage and are never sent to the site.

While a visitor's browser keeps a listening history, the player sets one cookie, `riff_history`, whose value is 1 or 2, so the Listen page can make room for that history before the page appears. It holds nothing about what was played, is first-party and strictly functional, and is removed when the history is gone. Riff suggests this text for your privacy policy under Settings > Privacy.

== Screenshots ==

1. The player bar, docked at the bottom of the screen while a post scrolls on.
2. Now Playing, with the artwork, the controls and the album lined up next.
3. The Listen page, with recently added albums, artists and new posts.
4. An album page, tinted from its cover, ready to play or shuffle.
5. Your Library, with the songs, albums and artists a listener liked and their playlists.
6. An audio file in the Media Library, with Riff's Artwork, Video version and Protected fields.

== Changelog ==

= 4.22.0 =
* The Listen app shows who is listening, with their picture and a menu, or Sign in.
* The player's strings are translated in its script modules, from WordPress's script module translations.
* Fixed: the order in use in Your Library is underlined, not bolder, so choosing one moves nothing.
* Fixed: the player's notices are dark on light with room around them, not white on white.
* Fixed: the seek bar moves on the compositor, so it glides without shaking whatever the page is doing.
* Fixed: the seek line stays under the pointer while it is dragged, instead of shaking back to the time playing.
* Fixed: under a block theme, standalone mode has one title and keeps the iPhone safe areas.

= 4.21.2 =
* Fixed: a name that is one long word wraps instead of widening the Listen page.
* Fixed: a one-word name wraps inside its card in every row, not only on album pages.
* Fixed: an album of more than 100 tracks lists and plays every track.
* Fixed: an album of more than 100 tracks plays in track order across its pages.
* Fixed: an empty Posts view tells visitors only that there is nothing to play yet.
* Fixed: before the first upload, visitors to the Listen page are not told how to add music.

= 4.21.1 =
* Fixed: the Listen app loads without moving.

= 4.21.0 =
* First run creates the Listen page and points to the first album.
* Fixed: every album card's line is its artist, from one shared card.
* Fixed: on a wide screen the seek line sits under the controls, where it is easy to reach.
* Fixed: security review fixes before the plugin directory.

= 4.20.0 =
* Likes and Your Library.
* Playlists listeners make.
* Wp-api-coverage, a report of the WordPress APIs a plugin uses and the ones it doesn't yet.
* Fixed: one heart icon, tidy rows of cards, and a Library that never looks empty.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
