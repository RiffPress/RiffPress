=== Riff Music Player ===
Contributors: joefusco
Tags: music, audio, video, player, media
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 6.1.0
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
* Tap the bar for Now Playing, swipe it to skip, and use Space, J, L, Shift+N and Shift+P on a keyboard; the keyboard button turns the single-key ones off.
* Follow a link to another page and the music carries on; reload and it's paused where it was.
* Each track shows its quality as WordPress read it from the file, such as MP3 · 320 kbps or FLAC · 24-bit 96 kHz.

= One page where everything plays =

Add the Riff block to a page, and it becomes your Listen page: every album as a cover, plus browsing by album, artist and track, and one search box. The music keeps playing while listeners move around it.

* A heart on every track, album and artist fills Your Library.
* Signed-in listeners make their own playlists, and their likes and recently played follow their account.
* Add `app/` to the page's address, for example `/listen/app/`, for the player on its own without your theme, which a browser can install as an app.

= You publish from WordPress =

Upload your tracks to the Media Library and they're on your Listen page, filed under their album and artist from the tags in the files, with their titles and artwork. Put an album in a post when you want to write about it. If an album has no cover, Riff draws one: a record with one groove per track.

There's nothing to configure. Riff adds its fields on media (Artwork, Video version, Streaming version and Protected), the Riff block, and Settings › Riff, where the features it ships with, such as Lyrics, are turned on or off.

[RiffPress.com](https://riffpress.com/) has a live demo with nine albums that runs in your browser, with nothing to install. [Add your music](https://riffpress.com/add-music/) walks through putting your first album online, starting from nothing.

= For developers =

Riff has documented hooks, a JavaScript API, REST routes, WPGraphQL fields and CSS custom properties, and lets other plugins add their own source of tracks. The [developer reference](https://developer.riffpress.com/) covers all of it, generated from the plugin's own code, and says what stays stable between versions.

== External services ==

Riff sends nothing to RiffPress, has no tracking or analytics, and loads no scripts, fonts or styles from another server. The one outside service it uses is Gravatar, below. Its fonts, Inter, Roboto and EB Garamond under the SIL Open Font License, and its icons, from Google's Material Icons under the Apache License 2.0, are bundled in the plugin.

The Listen page shows a signed-in listener's picture with WordPress's own avatars. When avatars are on (Settings, Discussion, Show Avatars), WordPress loads that picture from Gravatar, a service run by Automattic, sending a hash of the listener's email address. So that a listener without a Gravatar sees their initial rather than a grey silhouette, your site also asks Gravatar, at most once a day per listener, whether that hash has a picture. Gravatar's terms: https://gravatar.com/terms. Its privacy policy: https://automattic.com/privacy/. Turn avatars off and Riff shows the listener's initial instead, and nothing is sent to Gravatar.

AirPlay and Chromecast use the casting your listener's browser already has built in, so Riff loads no Google Cast or Apple code. The browser talks to the speaker or TV on the listener's own network.

Your posts can still point at audio or video hosted somewhere else, and Riff will play it from there, the same way WordPress's own Audio and Video blocks do.

== Installation ==

1. In your dashboard, go to Plugins > Add New Plugin, search for Riff, and press Install Now, then Activate.
2. Press Create Listen page in the notice on the Dashboard. Or add a page, type `/riff` on an empty line to add the Riff block, and publish it.
3. Upload your tracks under Media > Add New Media File. They appear on the Listen page, sorted into albums and artists.
4. To give an album a post of its own, add a Playlist block with its tracks and publish it.
5. To pair a song with its video, click the audio file in the Media Library and choose a video under Video version.

== Frequently Asked Questions ==

= Which file formats can I use? =

Any audio or video file WordPress accepts and your listener's browser can play. For music, MP3, M4A, FLAC, WAV and OGG all work. For video, use MP4 or WebM. Riff plays the file you uploaded at its own quality; it doesn't convert anything.

= Can I keep an album private? =

Yes. Make the post private, a draft, or password protected, and its tracks stay out of the Listen page's browsing and search for visitors.

To keep the files themselves private, tick Protected on an audio or video file in the Media Library. Riff moves it into a folder of its own and only sends it to visitors who can read its post. Apache and LiteSpeed keep that folder closed with the rule Riff leaves in it. Nginx, which many managed hosts run, ignores that rule: the Protected box and Tools > Site Health say when your server sends the folder to anyone, and you, or your host, add this to the site's Nginx configuration:

`location ~ /riff-protected-[a-z0-9]{20}/ { internal; }`

Deleting Riff moves protected files back first.

Membership and store plugins can decide who may play each track. A locked track stays listed with a lock that leads to your sign-up page. The [developer reference](https://developer.riffpress.com/php/) shows how.

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

Yes. Upload a zip of an album, or of several, to the Media Library, and Riff unpacks it in the background and makes a draft album post for each folder in it that holds audio, for you to publish, and attaches the zip to it. A zip it cannot import, such as one on a server whose PHP has no zip extension, stays unattached. With WP-CLI, `wp riff import` with the path to a folder or a zip does the same, and publishes the posts. Run either again and it skips what it already imported.

= My files are lossless. Do listeners download all of that? =

Not if you give a song a smaller copy. Choose an MP3 of it as its Streaming version in the Media Library, and the player streams that while the song stays the file you uploaded. Where the server has ffmpeg, `wp riff transcode` makes one for every lossless song.

= Does Riff set cookies or keep personal data? =

A signed-in listener's likes, recently played and playlists are saved to their account, and Tools > Export Personal Data and Erase Personal Data include them. Deleting Riff keeps them, so installing it again brings them back; Erase Personal Data is how to remove one listener's. A visitor's stay in their own browser's storage; to show them, the Listen page sends the site the IDs of what was liked or played, which Riff uses to draw the page and does not store.

While a visitor's browser keeps a listening history, the player sets one cookie, `riff_history`, whose value is 1 or 2, so the Listen page can make room for that history before the page appears. It holds nothing about what was played, is first-party and strictly functional, and is removed when the history is gone. Riff suggests this text for your privacy policy under Settings > Privacy.

== Screenshots ==

1. The player bar, docked at the bottom of the screen while a post scrolls on.
2. Now Playing, with the artwork, the controls and the album lined up next.
3. The Listen page, with recently added albums, artists and new posts.
4. An album page, tinted from its cover, ready to play or shuffle.
5. Your Library, with the songs, albums and artists a listener liked and their playlists.
6. An audio file in the Media Library, with Riff's Artwork, Video version and Protected fields.

== Changelog ==

= 6.1.0 =
* Now Playing's album is the cover where it is upright and the turntable where it is wide, one view with one button.

= 6.0.1 =
* Fixed: a view's button shows only for a track it has something for, and an open view gives way to one without.
* Fixed: the turntable's needle drops onto the record when its view opens as the music starts.

= 6.0.0 =
* Riff drops its desktop app, and the Listen app installed from the browser is its one app.
* Fixed: standalone mode is laid out as sidebar, rail or tabs from one choice in its stylesheet, and the desktop frame shows where it is sidebar rather than wherever there is a mouse.
* Fixed: a song pressed in a list that opens as its video opens Now Playing on the picture and plays.
* Fixed: Go to post opens a new window in the desktop app and the installed Listen app.

= 5.9.0 =
* A zip of an album imports as its folder does, from wp riff import or uploaded to the Media Library.
* Keys for the loop, the speed and transpose, A, S and F, D and U, while the Chords view shows a chart.
* A plugin adds its own items to the track menu with the riff.menu filter.
* A plugin adds its own keyboard shortcuts with riff_register_shortcut() and window.riff.shortcut(), which follow Riff's single-key rules.
* An about panel beside the page shows the track playing, its artist and album linked to their pages and the credits its file's tags carry, and a plugin adds a section to it with riff_about_sections.
* The turntable presses discs from the tags, cuts grooves from the loudness, clicks in the run-out, and has a VU meter and a spectrum.
* The developer reference moves to developer.riffpress.com, and its old addresses on riffpress.com redirect there.
* Fixed: an uploaded zip's albums are its uploader's own, it changes no video they can't edit, and a zip ZipArchive can't read whole is refused rather than inflated by PclZip.
* Fixed: a narrow window with a mouse, as a car's screen is, keeps the touch layout without the desktop frame laid over it.
* Fixed: a header without a cover, as the Tracks view's, starts at the top and lines up with Play and the list, and a stacked cover is half the page wide.
* Fixed: an album, artist or playlist header too narrow for its title beside the cover stacks them, and its cover is sized to the page as its title is.
* Fixed: an album's title is sized to its header, so it stays whole when Up next or About narrows the page.
* Fixed: on a computer, a panel that leaves the page too little room beside the library folds the library to its rail, so an album's rows keep their titles.
* Fixed: a mark typed with AltGr, as [ on a German keyboard, reaches a plugin's shortcut.
* Fixed: a track menu first opened before anything played still answers in Up next on a phone.

= 5.8.0 =
* A track says which disc of a set it is on, from the file's tags.
* On a computer the strip across the top has back and forward at its left end, Home and search centred as one group and who is listening at its right, reached by the keyboard in that order.
* Riff ships the plugins its manifest names inside itself, each turned on or off from Settings › Riff.
* A track's … menu offers to listen along with whoever else is playing it.
* Follow another listener, in time with them, and share what you play only if you choose.
* Now Playing is a view at a time and the bar's controls and views are registered on the server; Lyrics, Sing and Chords are views, Up next and Together are panels, and the tabs are gone.
* The turntable's arm is set up by Baerwald alignment, and its platter, record and arm move by their physics.
* Together in Now Playing lists who is in the session, with Leave, and an album's page shows who is playing from it.
* Riff Chords, a chord chart that follows the song, with practice controls to slow it down, loop a part, transpose and set a capo.
* Riff Sing: sing along with the melody in Now Playing, scored by pitch from a microphone or a MIDI instrument.
* Fixed: a row, an Up next item, the bar's track and the Up next handle are named by the words they show.
* Fixed: the PHP suite runs to its end, and Site Health on a network no longer mistakes WordPress's own mail tidying for a mail service.
* Fixed: a scene finds the track it names, and a follower who starts behind the host catches up.
* Faster: a library of tens of thousands of tracks loads, lists, plays and imports at the pace of a small one.
* Faster: a first visit to a Listen page loads the app in one wave, and the quality capsule is lit.
* Faster: the turntable's moving parts no longer give Up next layers of its own, and the filament rests while nothing it lights is in sight.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
