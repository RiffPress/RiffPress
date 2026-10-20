# JavaScript

Generated from the docblocks in `plugins/riff/assets/riff.js` by `npm run docs:js`. Do not edit by hand. The same reference is on the site under Developers, JavaScript.

How a script talks to the player. `window.riff` is set before the `riff.ready` action fires. Everything here is public and keeps working within a major version.

## `window.riff`

### `window.riff.version`

The version of this api: 1.

Type: `number`.

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

### `window.riff.current()`

The track playing.

Returns `Object|null`: The track, or null.

Since 4.0.0.

### `window.riff.queue()`

The queue in play order.

Returns `Object[]`: Tracks.

Since 4.0.0.

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
- [`riff.ended`](hooks.md#riffended), action: Fires when a track plays to its end, before the next one loads.
- [`riff.pause`](hooks.md#riffpause), action: Fires when the track pauses.
- [`riff.play`](hooks.md#riffplay), action: Fires when the track starts or resumes playing.
- [`riff.queue`](hooks.md#riffqueue), action: Fires when the queue changes while it plays: tracks added to play next or at the end, one moved or removed, or the queue cleared.
- [`riff.ready`](hooks.md#riffready), action: Fires once the player is set up, its state restored and `window.riff` available.
- [`riff.tab`](hooks.md#rifftab), action: Fires when a tab beside Now Playing is shown, including Up next. A plugin that added a tab fills its panel here, and again on `riff.track` while its tab is showing.
- [`riff.track`](hooks.md#rifftrack), action: Fires when a track is loaded, before it plays.

## A track

Every track the player takes or hands back is the shape `Tracks::schema()` describes in PHP; the PHP reference lists every property. The REST API returns the same shape.

## A tab in Now Playing

Add a tab beside Up next from PHP with the `riff_now_playing_tabs` filter, then fill its panel when the `riff.tab` action says it is showing, and again on `riff.track` while it is. Riff Lyrics is built this way, on nothing but the public API.

```php
add_filter( 'riff_now_playing_tabs', function ( array $tabs ): array {
	$tabs['lyrics'] = array( 'label' => __( 'Lyrics', 'my-plugin' ) );
	return $tabs;
} );
```

```js
document.addEventListener( 'riff:tab', ( { detail } ) => {
	if ( detail.id === 'lyrics' ) {
		showLyrics( detail.panel, detail.track );
	}
} );
```

## Loading your script

The player is an ES module with no dependencies. A script that uses `wp.hooks` depends on `wp-hooks`; one that only uses `window.riff` or the events can load however it likes, and should wait for `riff.ready` (or check `window.riff`) before calling anything.
