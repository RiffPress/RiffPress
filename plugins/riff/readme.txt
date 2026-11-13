=== Riff Music Player ===
Contributors: joefusco
Tags: music, audio, video, player, media
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 6.17.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Own every note. Publish music from your Media Library, and your listeners get a streaming player that keeps playing while they read.

== Description ==

Riff turns the music in your WordPress Media Library into a streaming player on a site you own. You publish the way you already do, with the Audio, Video and Playlist blocks WordPress ships. Your listeners get a player that works like the music apps they already use.

There's no other account to sign up for, nobody takes a cut, and your files stay on your server at the quality you uploaded. Riff publishes and plays your music. It doesn't sell music or take payments.

= For your listeners =

* A player docked at the bottom of the screen that keeps playing while they scroll or lock their phone.
* Now Playing, with the artwork, the controls and the rest of the album lined up next.
* Controls on the phone's lock screen and on headphones, plus AirPlay and Chromecast when a speaker or TV is in reach.
* A song with a video, such as a live take, switches between the two without losing its place.
* Tap the bar for Now Playing, swipe it to skip, and use Space, J, L, Shift+N and Shift+P on a keyboard; the keyboard button turns the single-key ones off.
* Follow a link to another page and the track picks up where it was, though some browsers, Safari among them, wait for a press of play; reload and it's paused where it was.
* Each track shows its quality as WordPress read it from the file, such as MP3 · 320 kbps or FLAC · 24-bit 96 kHz.

= One page where everything plays =

Add the Riff block to a page, and it becomes your Listen page: every album as a cover, plus browsing by album, artist and track, and one search box. The music keeps playing while listeners move around it.

* A heart on every track, album and artist fills Your Library.
* Signed-in listeners make their own playlists, and their likes and recently played follow their account.
* Add `app/` to the page's address, for example `/listen/app/`, for the player on its own without your theme, which a browser can install as an app. Tick Open the player at the site's address under Settings › Riff, and your home page is that player.

= You publish from WordPress =

Upload your tracks to the Media Library and they're on your Listen page, filed under their album and artist from the tags in the files, with their titles and artwork. Put an album in a post when you want to write about it. If an album has no cover, Riff draws one: its record, with a band of grooves for each track on its first side.

There's nothing to configure. Riff adds its fields on media (Artwork, Video version, Streaming version and Protected), the Riff block, and Settings › Riff, where the features it ships with, such as Lyrics, are turned on or off, and the player can open at the site's address.

[The live demo](https://riffpress.com/demo) has four albums and plays in your browser, with nothing to install. [Add your music](https://source.riffpress.com/add-music/) walks through putting your first album online, starting from nothing.

= For developers =

Riff has documented hooks, a JavaScript API, REST routes, WPGraphQL fields and CSS custom properties, and lets other plugins add their own source of tracks. The [developer reference](https://source.riffpress.com/) covers all of it, generated from the plugin's own code, and says what stays stable between versions. Riff's source, every script as it ships with nothing compiled or minified, is at https://github.com/RiffPress/RiffPress.

== External services ==

Riff sends nothing to RiffPress, has no tracking or analytics, and loads no scripts, fonts or styles from another server. The one outside service it uses on its own is Gravatar, below; two WP-CLI commands reach a public archive when you run them. Its fonts, Inter, Roboto and EB Garamond under the SIL Open Font License, are bundled in the plugin, and so are its icons, WordPress's own with the few it lacks drawn to match. The turntable's 3D scene adapts code from https://github.com/rauchg/vinyl under the MIT License, which is noted in the file.

The Listen page shows a signed-in listener's picture with WordPress's own avatars. When avatars are on (Settings, Discussion, Show Avatars), WordPress loads that picture from Gravatar, a service run by Automattic, sending a hash of the listener's email address. So that a listener without a Gravatar sees their initial rather than a grey silhouette, your site also asks Gravatar, at most once a day per listener, whether that hash has a picture. Gravatar's terms: https://gravatar.com/terms. Its privacy policy: https://automattic.com/privacy/. Turn avatars off and Riff shows the listener's initial instead, and nothing is sent to Gravatar.

Casting to a speaker or TV uses what your listener's browser already has built in, so Riff loads no casting code of its own. The browser talks to the speaker or TV on the listener's own network.

Only when you run it, `wp riff archive loc` reads the Library of Congress's catalogue and files at loc.gov, sending the collection or item you name. Its terms: https://www.loc.gov/legal/. Only when you run it, `wp riff archive europeana` searches Europeana's API at api.europeana.eu with the search and the API key you give it. Its terms: https://www.europeana.eu/en/rights/terms-of-use. Its privacy policy: https://www.europeana.eu/en/rights/privacy-policy.

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

To keep the files themselves private, tick Protected on an audio or video file in the Media Library. Riff moves it into a folder of its own and only sends it to visitors who can read a post that has it. Apache and LiteSpeed keep that folder closed with the rule Riff leaves in it. Nginx, which many managed hosts run, ignores that rule, so anyone who has a protected file's address in uploads could still download it. Riff checks: the Dashboard, the Media Library, Settings > Riff and Tools > Site Health say "Protected files can be downloaded directly on this server" when yours sends the folder to anyone.

There are two ways to close it. The surest is to keep protected files outside the web root, where no web server can send them. Add this to wp-config.php, with a folder of your own that the web server can write to but never serves:

`define( 'RIFF_PROTECTED_PATH', '/home/example/riff-protected' );`

Riff makes a folder for the site inside it (one for each site on a multisite network) and moves the files already protected there in the background, or at once with `wp riff protected move`. Their addresses stay the same. A path inside WordPress's folder, wp-content, uploads, or the folder that holds both WordPress and wp-content, is refused, with a notice, and the files stay where they are; `_wpeprivate` at the site's root, a folder some managed hosts never serve, is the one exception. A plugin can set the path with the `riff_protected_path` filter instead.

Or you, or your host, add this to the site's Nginx configuration:

`location ~ /riff-protected-[a-z0-9]{20}/ { internal; }`

Deleting Riff moves protected files back first.

To keep the whole site private, tick Private site under Settings > Reading. Only people with an account on the site can reach it, its audio and video are protected as above, and search engines are asked to stay away. Images, such as covers, keep their public addresses, so someone who has the address of one can still see it.

Membership and store plugins can decide who may play each track. A locked track stays listed with a lock that leads to your sign-up page. The [developer reference](https://source.riffpress.com/php/) shows how.

= Does it work with my theme? =

Yes, with any theme. The player at the bottom of the screen keeps Riff's own look on every site, the way a streaming app does. The Riff block takes its colours and fonts from your theme, and you can change them under Styles > Blocks > Riff in the Site Editor, or on one block in its settings. The Listen page template, which shows the block with no header or footer, needs a block theme.

Riff doesn't change your posts. The blocks keep their own markup and their own players underneath, so a page still plays if Riff's script doesn't load.

= Where are my files stored? =

In your Media Library, in your site's uploads folder on your own server, exactly as WordPress stores them. Riff doesn't copy them anywhere else. Protected files move to a folder of their own inside uploads, or outside the web root where `RIFF_PROTECTED_PATH` names one.

Riff keeps very little of its own: the link between a song and its video, the album and artist it files each track under, and each listener's likes, recently played and playlists. Deleting Riff from the Plugins screen removes its links, albums, artists and settings, and leaves your files, their tags and their images alone, and listeners' likes, recently played and playlists, which installing it again brings back.

= Can I add video? =

Yes, in two ways. A Video block in a post plays in the same player as the songs around it. Or, for a song that has a video, such as a live take or a music video, click the audio file in the Media Library and choose the video under Video version. Listeners then get a switch in Now Playing that flips between the song and the video without losing their place.

= Where does the queue come from? =

From the post. Every audio and video block in the post is the queue, in order, starting from the track you tapped. On the Listen page, an album, an artist or a playlist is the queue.

= Can I add a whole folder of albums at once? =

Yes. Upload a zip of an album, or of several, to the Media Library, and Riff unpacks it in the background and makes a private album post for each folder in it that holds audio, with each track it adds Protected, and then deletes the zip. A zip is private because it is how a store's download arrives, such as an album you bought for your own listening: you and the site's editors and administrators hear it, and the open web doesn't. For listeners who sign in to hear it too, turn on Private site under Settings > Reading and publish the posts; if the music is yours to share, publish them. The zip is private while it waits, and is deleted once it is unpacked, as a zip left in uploads would be at a public address with every track in it. A track already in the Media Library is skipped and stays as it was. A zip it cannot import, such as one on a server whose PHP has no zip extension, has its file deleted too and stays in the Media Library, private, and the next admin screen you open says which and why, for you to upload it again once that is fixed and remove the old one. Riff before 6.15.1 kept each imported zip, attached to its album: run `wp riff clean-zips` to delete them, or `wp riff clean-zips --dry-run` to list them first. With WP-CLI, `wp riff import` with the path to a zip imports it privately too, or publicly with `--no-private`; with the path to a folder it publishes the posts, or keeps them private with `--private`. Run either again and it skips what it already imported.

= Can I bring my own tracks over from another music site? =

Yes, as files. Put the files you uploaded there, or downloaded from your own tracks there, in a folder per album, with the artwork as cover.jpg, and import them as any album: a zip of the folders uploaded to the Media Library, or `wp riff import` with the folder. Name a WAV file the way its title should read, as WAV files rarely carry tags, and export AIFF as WAV or FLAC, which every browser plays. Riff doesn't sign in to another site and fetch your uploads itself.

= Can I make albums from a public archive's recordings? =

Yes, with WP-CLI. `wp riff archive loc` imports recordings the Library of Congress publishes for reuse, the Edison companies' sound recordings unless you name another collection or an item, and `wp riff archive europeana "a search" --key=yourkey` those on Europeana. Rights are per item, so Riff reads each item's rights statement and imports only what is marked public domain or under CC0, CC BY or CC BY-SA, or, from the Library of Congress, what its statement says it knows of no U.S. copyright in, credited as just that. It says what it skipped and why. Each track keeps its source, licence and credit in its caption and description, the About panel shows the credit, and each album's post opens with it, so the site credits the archive rather than presenting itself as it.

= My files are lossless. Do listeners download all of that? =

Not if you give a song a smaller copy. Choose an MP3 of it as its Streaming version in the Media Library, and the player streams that while the song stays the file you uploaded. Where the server has ffmpeg, `wp riff transcode` makes one for every lossless song.

= Does Riff set cookies or keep personal data? =

A signed-in listener's likes, recently played and playlists are saved to their account, and Tools > Export Personal Data and Erase Personal Data include them. Deleting Riff keeps them, so installing it again brings them back; Erase Personal Data is how to remove one listener's. A visitor's stay in their own browser's storage; to show them, the Listen page sends the site the IDs of what was liked or played, which Riff uses to draw the page and does not store.

While a visitor's browser keeps a listening history, the player sets one cookie, `riff_history`, whose value is 1 or 2, so the Listen page can make room for that history before the page appears. It holds nothing about what was played, is first-party and strictly functional, and is removed when the history is gone. Riff suggests this text for your privacy policy under Settings > Privacy.

== Screenshots ==

1. The player bar, docked at the bottom of the screen while a post scrolls on.
2. Now Playing on a wide screen, with the cover beside the turntable.
3. The Listen page, with recently added albums, artists and new posts.
4. An album page, tinted from its cover, ready to play or shuffle.
5. Your Library, with the songs, albums and artists a listener liked and their playlists.
6. An audio file in the Media Library, with Riff's Artwork, Video version and Streaming version fields.

== Changelog ==

= 6.17.4 =
* Fixed: main's versions agree with the release manifest again.

= 6.17.3 =
* Fixed: the offer to keep the app is a quiet row at the end of the library, with the site's name and where it would live.
* Fixed: CI is green again: the Rights meta test registers its keys, the albums route asks once whether any music has an end, and the tests expect the renamed Together and account menu.

= 6.17.2 =
* Fixed: a view change animates only the view, the app's fonts draw once, and the account menu, install card and Sign In sheet take the app's tokens.

= 6.17.1 =
* Fixed: two saves at once both keep, a sign-in link gets through a private site's gate, and a release with nothing downstream is not red.

= 6.17.0 =
* A host can show listeners its own name and mark in place of Riff's, with riff_brand.
* An artist sets who holds their music's rights and its licence, and every play asks riff_may_play.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
