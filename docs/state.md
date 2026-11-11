# State

Where Riff keeps what it knows, and which of it is implicit: state with no single owner, read back from somewhere it was only meant to be shown, or written by more than one hand. [player.md](player.md) explains the player's sections; `assets/player/state.js` is the one store the player's sections share (`P`), and "mutable state lives on `P`, never in a section's closure" is its rule.

Each entry gives where it is, what it means, and the risk: **high**, a listener can see the wrong thing or lose something; **medium**, correct today but only while every caller remembers a rule; **low**, contained in one place. Paths are under `plugins/`. When a change moves one of these into a single owner, update its entry here, or remove it.

## The player's facts, and their copies

### Playing

| Where | What | Risk |
| --- | --- | --- |
| `riff/assets/player/paint.js` (`paint()`) | `playing` = a track, and the needle cued (`P.held()`) or the element playing and not stopping. Drives `#riff[data-playing]`, the rows' and Up next's `data-playing`, the toggle's label and the Media Session's state. | |
| `riff/assets/riff.js` (`api.playing()`) | A track, and the element not paused. Ignores the cued needle and the platter coming to a stop. Riff Together, Riff Sing and Riff Chords read it. | **medium**: with the needle cued the button says Pause and `riff.playing()` says false ([#977](https://github.com/RiffPress/RiffPress/issues/977)). |
| `riff/assets/player/resume.js` (`save()`) | `playing` saved as `!paused && !ended`. | low |
| `riff/assets/player/now-playing.js` (`turn()`) | Reads `#riff[data-playing]`, the last paint, to decide whether the platter starts at once. | **medium**: a `turn()` between a `play` event and the next paint takes the other branch. |
| `riff/assets/player/now-playing.js` | `data-riff-turning`, set on `playing`, cleared on `pause`. | low |

### Video or song

| Where | What | Risk |
| --- | --- | --- |
| `P.mode` (`state.js`) | The listener's choice, `song` or `video`; set back to `song` by a new queue. | |
| `P.isVideo()` (`media.js`) | Derived: the track is a video, or it has a video version and the choice is `video`. The one answer to "is a picture playing". | |
| `#riff[data-mode]` (`paint.js`) | `isVideo()`, painted. | low |
| `riff/assets/player/wake-lock.js` | Tests `P.mode === 'video'`, so a video block's own track (type `video`, mode `song`) never keeps the screen on. | **high**: a phone sleeps in the middle of a video; the fix is to ask `P.isVideo()`. |
| `state.js` (the badges), `paint.js` (captions) | Each tests `P.mode` with the track's own video. | low |

### Now Playing open

| Where | What | Risk |
| --- | --- | --- |
| `.riff-np[hidden]`, `#riff.is-open`, `.riff-np.is-in` (`now-playing.js`) | Open, sliding away and closed, as three DOM flags every reader combines (`now-playing.js`, `registry.js`, `controls.js`, `keyboard.js`, `about.js`, `menu.js`, `wake-lock.js`). | **high**: no one value says which of the three it is. |
| `history.state.riff === 'open'` (`now-playing.js`) | Back closes it. `features/listen/app/views.js` spreads `history.state` into a view it pushes, so a view opened under Now Playing carries `riff: 'open'` too. | medium |
| `.riff-bar-info[aria-expanded]`, `.riff-np[aria-modal]` | ARIA, read back by `keyboard.js` to trap Tab. | low |
| `P.showing` (`now-playing.js`) | The view Now Playing shows, or showed last: it stays after it closes. | medium |
| `showing` in `riff-lyrics/assets/lyrics.js`, `riff-chords/assets/chords.js`, `riff-sing/assets/sing.js` | Each set only from `riff:view`; a script that starts after its view opened stays at false until it opens again. | low: they load with the page. |

### A panel open

| Where | What | Risk |
| --- | --- | --- |
| `P.panelOpen`, `P.side` (`registry.js`) | The panel's id. | |
| `.riff-side[hidden]`, `html.riff-panel-open`, each view's `hidden` | The same, painted. | low |
| `localStorage` `riff:panel` (`registry.js`) | The panel last chosen, reopened on the next page. | low |
| `open` (`together.js`), `showing()` there | A copy for the Together panel. | low |

### The turntable

`now-playing.js` keeps the deck's state in attributes on `#riff`, with a `MutationObserver` driving the platter from one of them: `data-riff-deck` (`out`, the record on the platter), `data-riff-cued` (`P.held()`, which `P.status()` reads to say Play or Pause), `data-riff-turning`, `data-riff-coasting`, `data-riff-arriving`, `data-riff-at`, `data-riff-format` (`7` or `12`, which sets the speed), `data-riff-turntable` (`off`), and `data-riff-down`, `data-riff-up` and `data-riff-held` on the arm; with about twenty-five closure variables and function properties (`turn.wait`, `halt.going`, `runout.until`, `deck.opening`) beside them, and `P.ramping`, a boolean, beside a closure `ramping`, a counter. Riff Meters reads `data-riff-deck` and `data-riff-turntable`. `deck-gl.js`, which draws the deck in WebGL, owns none of it: it reads those attributes and the page's computed styles each frame, takes the arm's geometry from `P.arm`, the side's bands from `P.pressed` and the groove pointed at from `P.cueAt` (all three written by `now-playing.js`) and the music's level from `P.loud` (written by `level.js`), and writes only `data-riff-gl`, which tells `riff.css` the canvas has drawn. **Medium**: the attributes are the CSS's and the state machine's at once, so a style change can change behaviour.

### Volume and mute

| Where | What | Risk |
| --- | --- | --- |
| `audio.volume`, `video.volume`, the slider, `localStorage` `riff:volume` (`seek.js`) | The level, a number from 0 to 1 as a string, written on input. | low |
| `audio.muted`, `video.muted`, the mute button's `aria-pressed` (`seek.js`) | Muted, kept for the page only. Nothing listens for `volumechange`, so a change made elsewhere (the system, a cast device, a script) leaves the slider and the button behind. | medium |

### The queue

| Where | What | Risk |
| --- | --- | --- |
| `P.queue`, `P.order`, `P.pos` (`state.js`) | What plays, in play order, and where. | |
| `drawn` (`queue.js`) | The window of Up next drawn, compared to `P.order` by identity while `insert`, `reorder` and `remove` change `P.order` in place; `li[data-pos]` is read back for focus. | medium |
| `kept` (`resume.js`) | What was last saved, compared by identity and a joined order. | low |
| `rows.js` (`sameQueue()`) | The post's rows, compared to the queue by id each paint. | low |

### Likes, history, who is listening

| Where | What | Risk |
| --- | --- | --- |
| `P.likes`, `likeSet` (`account.js`) | The likes and an index of them; every writer of `P.likes` must call `indexLikes()`. | medium |
| `localStorage` `riff-likes`, the user option `riff_likes` | A visitor's, and a signed-in listener's. Each tab keeps its own copy and writes the whole list, so a like in another tab is lost. | medium |
| `accountHistory` (`account.js`), `localStorage` `riff-history`, the user option `riff_history`, the cookie `riff_history` | What was played, three stores and a hint the server reads for Home's room. | medium |
| `room`, `roomVersion` (`together.js`) and `version`, `listeners` (`features/listen/app/together.js`) | Who is listening, polled twice, by the player and the app. | medium |
| `following` (`together.js`) | Whether this tab follows someone: nothing on `P` says so. | medium |

## Browser storage

No key carries a version. A shape that changes is caught only by the reader's own checks.

| Key | Store | Shape | Risk |
| --- | --- | --- | --- |
| `riff:state` (`P.STATE`) | session | `{pos, more, mode, repeat, shuffle, at, playing}`, each field checked on read | low |
| `riff:queue` (`P.QUEUE`) | session | `{queue: Track[], order, from, end}`, the tracks whole, signed addresses included | **medium**: a protected track's signed address expires (`Protect::TTL`), so `playback.js` asks `GET /riff/v1/tracks`, once, for the tracks from the one loading on whose addresses have less than an hour left, and the queue is written again. The track waits for the answer at most three seconds, then loads the address it has; the next track is asked for when the one playing is halfway through, and the queue when a tab left open comes back into sight. That route lists neither a video's own track nor, to a listener who can't upload, a file on a private or password-protected post, so those keep their old address, and play from it only while the listener's cookie lets them through. |
| `riff-history` | local | up to 30 `Track` objects, without `levels`, with `played` | low: kept for good, signed addresses included; a track played from it is signed again as it loads, as the queue's are. |
| `riff-likes` | local | `[{kind, id, at}]`, cleaned on read | low |
| `riff:volume` | local | `"0"`–`"1"` | low |
| `riff:captions` | local | `on`, `off` | low |
| `riff:panel` | local | a panel id or `""` | low |
| `riff-sidebar` | local | `full`, `mini`; also read inline by `templates/standalone.php` before the first paint | low |
| `riff-rack`, `riff-searches`, `riff-visits`, `riff-install-dismissed`, `riff-visit` (session) | | the Listen app's conveniences | low |
| `riff-chords:instrument`, `riff-sing-tolerance` | local | the extensions' | low |
| `riff:turntable` | local | retired (player.md), never removed | low |

The prefixes are mixed (`riff:` and `riff-`).

## State read back from the page

Besides the turntable and Now Playing above:

- `fig[data-riff-track]` and the Listen app's `data-riff-tracks`, `data-riff-ids`, `data-riff-places`, `data-riff-playlist` and `data-riff-more`: the server's JSON is what a press plays, until the view is fetched again; a playlist reordered in place plays its old order until then. Medium.
- `[data-riff-app][data-sidebar]` and the toggle's `aria-expanded`, read back to decide which way it folds. Low.
- `getComputedStyle()` custom properties as layout decisions: `--riff-np-covers`, `--riff-deck`, `--riff-deck-screen`, `--riff-deck-alone` (the deck with nothing else on the screen, which `immerse()` in `now-playing.js` keeps as a closure `alone` and hands `registry.js` as `P.deckAlone()`, so a panel put away for it is not reopened beside it), `--riff-plinth-edge`, `--riff-side-place`, `--riff-frame`. By design, CSS decides the layout; `roomy.last` caches one read. Low.
- `aria-busy` and `aria-disabled` as guards against a second press while one is in flight. Low.

## URL arguments as state

- The Listen app's: `riff`, `riff_page`, `riff_from`, `riff_view`, `riff_album`, `riff_artist`, `riff_search`, `riff_playlist`, `riff_filter`, `riff_sort` (`class-browse.php`, `class-collection.php`). They are the view's address, which is the point. The names reach `features/listen/app/addresses.js` as an ordered list it reads by position (`browseArgs[0]`, `[4]`, `[6]`): medium, a reordering on the server builds wrong addresses with no error.
- `riff_liked`: a visitor's likes, sent as an argument (up to 400) so the server can draw Liked songs; each like is a new address and a new entry in the app's cache. Medium.
- `riff_track` (`P.SHARED`): a shared link's track. Low.
- `riff-file`, `riff-expires`, `riff-sig`: a protected file's signed address (`class-protect.php`). See browser storage above.
- `riff_app` (`manifest`, `worker`), `riff-art`, `riff_create_listen_page`: one-off. Low.

## Options and meta with more than one writer

| Key | Writers | Risk |
| --- | --- | --- |
| `_wp_attachment_metadata` | `class-transcode.php` (levels), `class-archives.php` (tags), `class-fields.php` (tag fields), `riff-lyrics` (`unsynchronised_lyric`), core | **medium**: each reads the whole array, changes its key and writes it back; two at once lose one's key ([#978](https://github.com/RiffPress/RiffPress/issues/978)). `Catalog::on_metadata` re-files the track after each. |
| `_riff_video` | `class-media.php` (the Media Library), `class-fields.php` (DataViews), `class-import.php` | low: each sanitises on its own path. |
| `riff_likes`, `riff_history` (user options) | `class-likes.php`, `class-likes-rest.php` | medium: read, change, write, with no lock; two devices at once lose one ([#978](https://github.com/RiffPress/RiffPress/issues/978)). |
| `riff_protected_move_state`, `riff_protected_move_lock` | `class-protected-files.php` (the background pass), `class-protected-cli.php` | medium: the command clears the cursor before taking the lock; the stale-lock steal is a read then a write. |
| `riff_catalog_backfill`, `riff_catalog_backfill_from` | `class-catalog.php` (cron), `class-cli.php` (reset) | low |
| `riff_passkeys` and `riff_passkey_id` | `riff-sign-in/src/class-passkeys.php`, `class-sign-in.php` | medium: two copies of the same keys, kept in step by hand. |

## Static caches

| Where | What | Risk |
| --- | --- | --- |
| `Bindings::$read` (`class-bindings.php`) | Tracks read for block bindings; `flush()` runs on `clean_post_cache` and on any post meta change. | low: keyed by attachment and post only, so a process that switches user or site between renders is handed the first one's track. |
| `Protect::$songs`, `Protect::$playing` | Which songs a file is the video or stream of, which posts play a file; `forget()` runs on `clean_post_cache` and on a change to `_riff_video` or `_riff_stream`. | low: keyed by attachment only, so a switch of site is not seen, nor an author losing `edit_post`, until a post changes. |
| `Export::write()`'s `$statements` | The archive's prepared statements, by table, a local of the one call that writes it; dropped with its handle before the zip reads the database. | none: no static. |
| `UI::$eager`, `UI::$lead` | How many images load eagerly, counted down across every render in a request. | low |
| The rest (`Permissions`, `Extensions`, `Transcode`, `Cover`, `Art`, `Blocks_Source`, the extensions' REST controllers) | Keyed or per request. | low |
| JS: `cache` in `features/listen/app/fetch.js` | Every REST answer the app fetched, for the session; `forget()` clears the drawn views but not this. | medium |
| JS: `features` in `state.js` | A feature's module, and a failed import cached as nothing for good. | low |

## Hooks that depend on order

- Each extension registers on `plugins_loaded` at 5 and Riff boots at 10: an extension's `register()` must not touch what Riff's `boot()` makes.
- `riff_register`: Riff's own controls and views at 5, so a plugin at 10 can unregister them.
- `riff_track`: `Protect::sign` at `PHP_INT_MAX`, so the address it signs is final; a filter there after it breaks protected playback.
- `template_include`: `Standalone::template` at 99, Riff Sign In's at `PHP_INT_MAX`, which must win. `Standalone::strip` removes core's actions at core's own priorities (0, 1, 50); if core moves one, the removal silently stops.
- `parse_request` at 0 and `rest_authentication_errors` at 200 for a private site.
- In the player, `riff.js` assembles the sections in order with `Object.assign`; a later section returning a key an earlier one returned replaces it silently. `now-playing.js` listens for `ended` in the capture phase so it notes the end before `media.js` moves on.
