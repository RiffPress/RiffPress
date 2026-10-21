# What WordPress has, and what Riff adds

The Media Library is where Riff's music lives. Riff uses what WordPress already has, and adds something only where WordPress has no equivalent. Each addition below says why it exists, and links the core ticket when there is one. An addition that lands in core is deprecated in Riff and then removed, following the stability rule in the plugin readme.

When you add storage, a field, a relation or a query to Riff, add a row here in the same pull request.

## Used as WordPress has it

| What | Where it lives in WordPress |
| --- | --- |
| A track | An audio attachment. |
| Title, artist, album, year, genre, track number, length | Read from the file's tags by getID3 on upload (`wp_read_audio_metadata()`), kept in `_wp_attachment_metadata`. |
| Bit rate, sample rate, bit depth, codec, lossless | The same upload metadata. |
| Lyrics | The file's lyrics tag (ID3 USLT), which WordPress reads on upload into the same metadata as `unsynchronised_lyric`, and the media REST route returns in `media_details`. Riff Lyrics shows it, and its Media Library field edits that same key. |
| Artwork | The attachment's featured image. WordPress saves artwork embedded in the file as an image and sets it on upload; Riff's Artwork field in the Media Library sets the same featured image. |
| Where a track appears | The audio, video and playlist blocks in posts. |
| A shared playlist | A post with the Playlist block (WordPress 7.1). |
| A listener's own playlist | A private post of Riff's `riff_playlist` type, written by the listener, holding one Playlist block (WordPress 7.1) whose playlist-track blocks are its tracks in order. |
| Who can play what | The status and visibility of the post a track appears in. |
| People and app sign-in | WordPress users and application passwords. |
| Per-site upload limits on a network | Multisite's `blog_upload_space`. |

## Added by Riff, and why

| Gap | What Riff adds | Why | Upstream | Status |
| --- | --- | --- | --- | --- |
| No link between a song and its video | `_riff_video` post meta on the audio attachment, set from the Media Library's Video version field | Core has no relation between two attachments. | None filed | In Riff |
| No waveform for an upload | Levels from the demo seed only; uploads have none yet | Drawing a waveform otherwise means fetching the whole file in the browser, as the Playlist block does. | [Gutenberg #84712](https://github.com/WordPress/gutenberg/issues/84712): measure peaks once at upload | Proposed upstream |
| Albums and artists can't be browsed or queried; they sit in serialized `_wp_attachment_metadata` | `riff_album` and `riff_artist` taxonomies on attachments, filed from the file's album, artist and band tags whenever its metadata is saved; an album's artist is `riff_album_artist` term meta; `_riff_catalog` marks a file filed, and a background job files a library from before (`wp riff catalog` does it at once) | Taxonomies on attachments are native: the Media Library shows them as columns and filters, and REST and `WP_Query` can query them. Search and browsing need something queryable ([#343](https://github.com/RiffPress/RiffPress/issues/343), [#366](https://github.com/RiffPress/RiffPress/issues/366)). | Not yet | In Riff |
| No colour for an image | `_riff_tint` attachment meta on a cover image: its most colourful shade, read from the thumbnail's pixels the first time an album page shows it ([#396](https://github.com/RiffPress/RiffPress/issues/396)) | Standalone mode tints an album's header from its cover, as the streaming apps do. Reading the pixels on every page view would be slow, and the colour belongs to the image. | Not yet | In Riff |
| No artwork for an album | Planned: term meta on `riff_album` pointing to an image attachment | The cover stays an image in the Media Library. | Not yet | Planned |
| No picture for an artist | `riff_artist_image` term meta on a `riff_artist` term, pointing at an image in the Media Library, set from an Image field on the artist's edit screen ([#397](https://github.com/RiffPress/RiffPress/issues/397)) | The artist page leads with a picture, as the apps' do. The picture stays an image in the Media Library; without one, the artist's newest album cover is used. | Not yet | In Riff |
| Playlists that belong to a listener, not to the site | The `riff_playlist` post type: private, out of archives, feeds and search, listed under Media in the admin, opening in the block editor, with its tracks in core's Playlist block; made and changed through `riff/v1/users/me/playlists` ([#401](https://github.com/RiffPress/RiffPress/issues/401)) | A playlist is a post holding a Playlist block, so it needs no table, keeps its order and duplicates as the block does, and edits in the editor. Its own type keeps listeners' private lists out of the blog and its Posts grid, and lets a listener own one without the right to publish posts. | Not yet | In Riff |
| No likes or listening history for a user | The `riff_likes` and `riff_history` user options (user meta under the site's table prefix, so each site on a network keeps its own), read and written through `riff/v1/users/me/likes` and `riff/v1/users/me/history`; a visitor's stay in their browser as `riff-likes` and `riff-history`, and join their account when they sign in ([#400](https://github.com/RiffPress/RiffPress/issues/400)) | Likes belong to a user and are a short list of IDs, which user meta holds without a table of its own. Visitors have no user, so their browser keeps theirs until they have one. | Not yet | In Riff |
| No way to install a site's player as an app | A web app manifest at a Listen page's `app/` address, and that address rendering the player outside the theme ([#379](https://github.com/RiffPress/RiffPress/issues/379)) | Browsers install a page that names a manifest; WordPress has no manifest of its own. The desktop app loads the same address. | Not yet | In Riff |
| Every upload is a public file, whatever post it belongs to | An opt-in **Protected** box that moves an audio or video file into a folder the web server refuses, and serves it at `?riff-file=ID` to whoever may play it, with byte ranges; `_riff_protected` attachment meta keeps the file's original place, and `riff_protected_dir` names the folder ([#406](https://github.com/RiffPress/RiffPress/issues/406)) | Hiding a private post's tracks means little while the file plays for anyone with its address. Core serves uploads straight from disk and has no permission check on a file. | [Core #33230](https://core.trac.wordpress.org/ticket/33230): restricted access to the Media Library; [#17255](https://core.trac.wordpress.org/ticket/17255): statuses for media | In Riff |
| No bulk import from a folder | `wp riff import`, a thin layer over `media_handle_sideload()` ([#367](https://github.com/RiffPress/RiffPress/issues/367)) | Every file goes through core's own upload path, so its tags and artwork are read the way an upload's are. | Not yet | In Riff |
| No way to tell a file was already uploaded | `_riff_import_hash` attachment meta (the file's SHA-1), and `_riff_import_folder` post meta on an album post | Running an import again must not duplicate the library, and new tracks must join their album. Core has no content hash on attachments. | Not yet | In Riff |
| A real AAC `.m4a` is refused: core lists `m4a` as `audio/mpeg`, then the file's sniffed type, `audio/mp4`, doesn't match; `.opus` isn't listed at all | During `wp riff import` only, `m4a` is allowed as `audio/mp4` and `opus` as `audio/ogg` | Both are common in music libraries, and the person running the command chose the folder. Uploads through the Media Library are unchanged. | Not yet | In Riff |

## Private core APIs Riff still uses

Core can change these without notice. Each has no public equivalent yet; the API coverage report (`npm run api-coverage`) lists them under "Private APIs in use".

| What | Where | Why | Upstream |
| --- | --- | --- | --- |
| `_wp_render_title_tag`, `_block_template_render_title_tag` and `_block_template_viewport_meta_tag`, unhooked from `wp_head` | `Standalone::template()` | Standalone mode's document prints its own title and viewport, and a second viewport later in the head would drop `viewport-fit=cover`. Core has no public way to stop printing either tag; its filters change the title's text, not whether the tag is printed. | None filed; [Core #61900](https://core.trac.wordpress.org/ticket/61900) asked for the title and was pointed at `pre_get_document_title` |
| `__experimentalBorder`, `__experimentalSkipSerialization`, `__experimentalFontFamily`, `__experimentalLetterSpacing` and `__experimentalDefaultControls` in the Listen block's `block.json` | `features/listen/block/block.json` | The block's border and font controls, and its colours and font family applied to the views inside it rather than to the wrapper. WordPress 7.1 has no stable key for any of them; switch when it does. | [Core #61728](https://core.trac.wordpress.org/ticket/61728), closed after Gutenberg reverted the stable keys; [Gutenberg #63001](https://github.com/WordPress/gutenberg/issues/63001) and [#64312](https://github.com/WordPress/gutenberg/issues/64312) are open |

## Development tooling

| Gap | What Riff adds | Upstream | Status |
| --- | --- | --- | --- |
| `@wordpress/env` 11.17 breaks with simple-git 4, which Riff pins for its security fixes | `.github/scripts/patch-wp-env.js`, run on install | [Gutenberg #84137](https://github.com/WordPress/gutenberg/pull/84137) | Merged upstream; remove the patch once a released `@wordpress/env` includes it |
