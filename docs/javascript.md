# JavaScript

Generated from the docblocks in `plugins/riff/assets/riff.js` by `npm run docs:js`. Do not edit by hand. The same reference is on the site under Developers, JavaScript.

How a script talks to the player. `window.riff` is set before the `riff.ready` action fires. Everything here is public and keeps working within a major version.

## `window.riff`

### `window.riff.version`

The version of this api: 1.

Type: `number`.

Since 4.0.0.

### `window.riff.strings`

Strings a site replaces with the `riff_strings` filter, by key. The rest are translated in the modules themselves, from WordPress's script module translations.

Type: `Object<string, string>`.

Since 4.0.0.

### `window.riff.play( tracks, index = 0, options )`

Makes `tracks` the queue and plays the one at `index`.

The tracks go through the `riff.queue` and `riff.track` filters first.

| Parameter | Type | Description |
| --- | --- | --- |
| `tracks` | `Object[]` | Tracks, in the shape `Tracks::schema()` describes. |
| `index` | `number` | The one to play first. |
| `options` | `Object` | Options. |
| `options.shuffle` | `boolean` | `true` or `false` sets shuffle before playing. |

Since 4.0.0.

### `window.riff.playNext( tracks )`

Puts tracks right after the one playing, or starts them when nothing is.

Each track goes through the `riff.track` filter first; one without a file is left out.

| Parameter | Type | Description |
| --- | --- | --- |
| `tracks` | `Object\|Object[]` | Tracks, in the shape `Tracks::schema()` describes. |

Since 4.19.0.

### `window.riff.addToQueue( tracks )`

Adds tracks to the end of the queue, or starts them when nothing is playing.

| Parameter | Type | Description |
| --- | --- | --- |
| `tracks` | `Object\|Object[]` | Tracks, in the shape `Tracks::schema()` describes. |

Since 4.19.0.

### `window.riff.moveInQueue( from, to )`

Moves a track in the queue, by its place in the play order.

| Parameter | Type | Description |
| --- | --- | --- |
| `from` | `number` | Where it is. |
| `to` | `number` | Where it goes. |

Since 4.19.0.

### `window.riff.removeFromQueue( at )`

Takes a track out of the queue, by its place in the play order. The one playing stays.

| Parameter | Type | Description |
| --- | --- | --- |
| `at` | `number` | Its place. |

Since 4.19.0.

### `window.riff.clearQueue()`

Empties the queue but for the track playing.

Since 4.19.0.

### `window.riff.toggle()`

Plays or pauses.

Since 4.0.0.

### `window.riff.next()`

Skips to the next track.

Since 4.0.0.

### `window.riff.prev()`

Goes back a track, or to the start of this one.

Since 4.0.0.

### `window.riff.seek( seconds )`

Moves the current track to a time.

| Parameter | Type | Description |
| --- | --- | --- |
| `seconds` | `number` | From the start of the track. |

Since 4.0.0.

### `window.riff.open()`

Opens Now Playing.

Since 4.0.0.

### `window.riff.close()`

Closes Now Playing.

Since 4.0.0.

### `window.riff.mount()`

Reads every `figure[data-riff-track]` on the page again, after content was swapped in.

Since 4.0.0.

### `window.riff.current()`

The track playing.

Returns `Object|null`: The track, or null.

Since 4.0.0.

### `window.riff.queue()`

The queue in play order.

Returns `Object[]`: Tracks.

Since 4.0.0.

### `window.riff.history()`

The tracks played, most recent first, each once: what Home's Recently played and Jump back in are drawn from. At most 30. A signed-in listener's come from their account; a visitor's are kept in the browser.

Returns `Object[]`: Tracks, in the shape `Tracks::schema()` describes, each with `played`,

Since 4.18.0.

### `window.riff.like( id, kind )`

Likes a track, an album or an artist. A signed-in listener's likes are saved to their account; a visitor's are kept in the browser, and join their account when they sign in.

Only a track in the Media Library can be liked, since its ID is the same on every page.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number\|string` | A track's ID (its audio attachment's), or an album's or artist's term ID. |
| `kind` | `string` | `track`, `album` or `artist`. Default `track`. |

Since 4.20.0.

### `window.riff.unlike( id, kind )`

Takes a like away.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number\|string` | A track's, album's or artist's ID. |
| `kind` | `string` | `track`, `album` or `artist`. Default `track`. |

Since 4.20.0.

### `window.riff.liked( id, kind )`

Whether a track, album or artist is liked.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number\|string` | A track's, album's or artist's ID. |
| `kind` | `string` | `track`, `album` or `artist`. Default `track`. |

Returns `boolean`: True when it is liked.

Since 4.20.0.

### `window.riff.likes( kind )`

Every like, newest first.

| Parameter | Type | Description |
| --- | --- | --- |
| `kind` | `string` | Only `track`, `album` or `artist` likes. Default all. milliseconds since the epoch. |

Returns `Object[]`: Likes, each `{ kind, id, at }`, with `at` when it was liked in

Since 4.20.0.

### `window.riff.playlists()`

The signed-in listener's playlists, the most recently changed first. Empty for a visitor: a playlist is a post, so it needs an account.

Returns `Object[]`: Playlists, each `{ id, title, count }`.

Since 4.20.0.

### `window.riff.playlist( id )`

One of the signed-in listener's playlists, with its tracks.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number` | The playlist's ID. |

Returns `Promise<Object>`: The playlist, as `riff/v1/users/me/playlists/{id}` returns it.

Since 4.20.0.

### `window.riff.createPlaylist( title, tracks )`

Makes a playlist, empty or with tracks.

| Parameter | Type | Description |
| --- | --- | --- |
| `title` | `string` | Its name. |
| `tracks` | `Array<number\|Object>` | Tracks, or their IDs, in order. |

Returns `Promise<Object>`: The playlist, as `riff/v1/users/me/playlists/{id}` returns it.

Since 4.20.0.

### `window.riff.addToPlaylist( id, tracks )`

Adds tracks to the end of a playlist.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number` | The playlist's ID. |
| `tracks` | `Array<number\|Object>\|Object` | Tracks, or their IDs. |

Returns `Promise<Object>`: The playlist.

Since 4.20.0.

### `window.riff.renamePlaylist( id, title )`

Renames a playlist.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number` | The playlist's ID. |
| `title` | `string` | Its new name. |

Returns `Promise<Object>`: The playlist.

Since 4.20.0.

### `window.riff.setPlaylistTracks( id, tracks )`

Sets a playlist's tracks, in a new order or with some left out.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number` | The playlist's ID. |
| `tracks` | `Array<number\|Object>` | Every track, or its ID, in the new order. |

Returns `Promise<Object>`: The playlist.

Since 4.20.0.

### `window.riff.removeFromPlaylist( id, index )`

Takes the track at a place out of a playlist.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number` | The playlist's ID. |
| `index` | `number` | The track's place, from 0. |

Returns `Promise<Object>`: The playlist.

Since 4.20.0.

### `window.riff.deletePlaylist( id )`

Deletes a playlist. It goes to the trash, where someone who can edit it may restore it.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `number` | The playlist's ID. |

Returns `Promise<Object>`: `{ deleted, previous }`.

Since 4.20.0.

### `window.riff.playing()`

Whether something is playing.

Returns `boolean`: True while a track plays.

Since 4.0.0.

### `window.riff.tab( id )`

Shows one of the tabs beside Now Playing: `queue` for Up next, or a slug a plugin added through the `riff_now_playing_tabs` filter.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The tab's slug. |

Since 4.16.0.

### `window.riff.on( name, fn )`

Listens to one of the player's actions, without `wp-hooks`.

| Parameter | Type | Description |
| --- | --- | --- |
| `name` | `string` | The action without its prefix: `track`, `play`, `pause` and the rest. |
| `fn` | `(detail: Object, api: Object) => void` | Called with the detail and the api. |

Returns `() => void`: Stops listening.

Since 4.0.0.

## Actions and filters

Each change of state is announced twice with the same detail: through `wp.hooks` as `riff.<name>`, for scripts that depend on `wp-hooks`, and as a `riff:<name>` `CustomEvent` on `#riff` that bubbles, for everything else. The filters run only through `wp.hooks`.

- [`riff.queue`](hooks.md#riffqueue), filter: Filters the tracks about to become the queue.
- [`riff.shortcuts`](hooks.md#riffshortcuts), filter: Filters whether the single-key shortcuts (Space, K, J, L) act on a key press.
- [`riff.track`](hooks.md#rifftrack), filter: Filters one track as a queue is set, after `riff.queue`.
- [`riff.action`](hooks.md#riffaction), action: Fires when a control an extension added through `riff_chips` or `riff_bar_controls` is pressed.
- [`riff.close`](hooks.md#riffclose), action: Fires when Now Playing closes.
- [`riff.ended`](hooks.md#riffended), action: Fires when a track plays to its end, before the next one loads.
- [`riff.like`](hooks.md#rifflike), action: Fires when a like is added or taken away, and once the likes a visitor kept in this browser have joined their account after they signed in.
- [`riff.open`](hooks.md#riffopen), action: Fires when Now Playing opens.
- [`riff.pause`](hooks.md#riffpause), action: Fires when the track pauses.
- [`riff.play`](hooks.md#riffplay), action: Fires when the track starts or resumes playing.
- [`riff.playlist`](hooks.md#riffplaylist), action: Fires when one of the signed-in listener's playlists is made, changed or deleted.
- [`riff.queue`](hooks.md#riffqueue), action: Fires when the queue changes while it plays: tracks added to play next or at the end, one moved or removed, or the queue cleared.
- [`riff.ready`](hooks.md#riffready), action: Fires once the player is set up, its state restored and `window.riff` available.
- [`riff.tab`](hooks.md#rifftab), action: Fires when a tab beside Now Playing is shown, including Up next. A plugin that added a tab fills its panel here, and again on `riff.track` while its tab is showing.
- [`riff.track`](hooks.md#rifftrack), action: Fires when a track is loaded, before it plays.

## A track

Every track the player takes or hands back is the shape `Tracks::schema()` describes in PHP; the PHP reference lists every property. The REST API returns the same shape.

## Controls

Add a chip under Now Playing or a control at the end of the bar from PHP, with the `riff_chips` or `riff_bar_controls` filter, then handle the press with the `riff.action` action.

```php
add_filter( 'riff_chips', function ( array $chips ): array {
	$chips['lyrics'] = array(
		'label'  => __( 'Lyrics', 'my-plugin' ),
		'action' => 'my-plugin-lyrics',
		'svg'    => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="…"/></svg>',
	);
	return $chips;
} );
```

```js
wp.hooks.addAction( 'riff.action', 'my-plugin', ( { action, track } ) => {
	if ( action === 'my-plugin-lyrics' ) {
		showLyrics( track );
	}
} );
```

## Loading your script

The player is an ES module with no dependencies. A script that uses `wp.hooks` depends on `wp-hooks`; one that only uses `window.riff` or the events can load however it likes, and should wait for `riff.ready` (or check `window.riff`) before calling anything.
