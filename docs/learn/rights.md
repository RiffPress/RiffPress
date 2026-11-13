# Rights and controls

Your music is yours. Riff keeps who holds the rights to it and the licence you share it under, shows them to listeners, and lets you choose whether listeners may download it and how long it stays available. Nothing changes until you set something: a site that never opens these settings plays as it always has.

## Set an album's rights

An album's rights live on the post its tracks were uploaded to, the one Riff makes for each folder of a zip you upload. Open that post in the editor, and in the sidebar's Post tab find Rights:

1. **Rights holder**: the artist, label or publisher. Empty means you, the post's author.
2. **Year**: the year the recording was first released.
3. **Licence**: All rights reserved, or one of the Creative Commons licences (CC BY, CC BY-SA, CC BY-ND, CC BY-NC, CC BY-NC-SA, CC BY-NC-ND) or CC0, which gives the music to the public domain. Choosing one is your decision, and it can't be taken back from anyone who already has a copy under it.
4. **UPC**: the album's barcode, when it has one.
5. **Listeners may download**: on unless you turn it off.
6. **Available until**: a date after which listeners see the album's tracks as no longer available. When it is released is the post's own publish date: schedule the post, as WordPress always lets you.
7. The statement that you own or control the rights. Riff keeps who made it and when.

Every track uploaded to the post has these unless it says otherwise.

## Set a track's own

In Media, then Library, click a track. Its ISRC, the recording's own code (CC-XXX-YY-NNNNN), is set there, and a Rights holder and Licence for a track that isn't like the rest of its album. Leave them empty to use the album's.

## What listeners see

The About panel in Now Playing shows "℗ 1924 Ma Rainey" and the licence, linked to its deed, with the ISRC. An album's post links its licence in the page's head, as `rel="license"`, which search engines read.

With downloads off, a File block offering the album's tracks or its zip is left out for everyone who can't edit the album. After its Available until, a track is listed as no longer available, with nothing to play, and drops out of the Listen page's albums, artists and tracks. You still see and play it.

## Under the hood

- The settings are post meta, registered with `register_post_meta()` and in the REST API, and read through `riff_rights( $post_id )`, filtered by [`riff_rights`](../hooks.md#riff_rights). A track's own meta wins over its album's. Each goes with the rest of your Riff into the archive Settings › Riff downloads.
- Every play asks [`riff_may_play`](../hooks.md#riff_may_play): the tracks on a page, over REST, in a feed's enclosures and in a public export, and every request for a [protected file](media-library.md), signed or not. Its context names where (`via`) and the pass the request carries, from the `riff-pass` query argument or the X-Riff-Pass header, which the player sends on from the page it was opened with. A host keeps music to a pass, a membership or a window there.
- A playable address is handed out through [`riff_play_url`](../hooks.md#riff_play_url); a protected file's signed address carries the request's pass. Riff's own signature lasts at least six hours, so a host whose passes end sooner signs or ends the address there.
- [`riff_played`](../hooks.md#riff_played) fires once for each play a signed-in listener's player reports to their history. A visitor's plays stay in their browser, so it doesn't fire for them.
- [`riff_may_download`](../hooks.md#riff_may_download) decides downloads; [`riff_rights_attestation_required`](../hooks.md#riff_rights_attestation_required) says whether a host requires the statement, which the host then enforces where uploads arrive. `riff_share_url( $post_id, $pass )` builds a link that opens a post with a pass, filtered by [`riff_share_url`](../hooks.md#riff_share_url).
- [`riff_item_links`](../hooks.md#riff_item_links) adds links, a host's Report link say, to a track's info in the About panel.
- On a private site, a request with a pass is let as far as its page, which opens only where the host's [`riff_private_pass`](../hooks.md#riff_private_pass) says the pass is for it. The REST API stays closed.
- A file that isn't protected is served by the web server, which asks nobody: `riff_may_play` keeps its address off the page, but anyone who already has it can still fetch it. Protect files a host gates.
