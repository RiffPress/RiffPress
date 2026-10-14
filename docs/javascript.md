# JavaScript

Generated from the docblocks in `plugins/riff/assets/riff.js` by `npm run docs:js`. Do not edit by hand. The same reference is on the site under Developers, JavaScript.

How a script talks to the player. `window.riff` is set before the `riff.ready` action fires. Everything here is public and keeps working within a major version.

## `window.riff`

### `window.riff.version`

The version of this api. It changes only in a major release, when something here does.

Type: `number`.

Since 4.0.0.

### `window.riff.strings`

The player's strings, after the `riff_strings` filter.

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

Returns `Object\|null`: The track, or null.

Since 4.0.0.

### `window.riff.queue()`

The queue in play order.

Returns `Object[]`: Tracks.

Since 4.0.0.

### `window.riff.playing()`

Whether something is playing.

Returns `boolean`: True while a track plays.

Since 4.0.0.

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
- [`riff.open`](hooks.md#riffopen), action: Fires when Now Playing opens.
- [`riff.pause`](hooks.md#riffpause), action: Fires when the media element pauses.
- [`riff.play`](hooks.md#riffplay), action: Fires when the media element starts playing.
- [`riff.ready`](hooks.md#riffready), action: Fires once the player is set up, its state restored and `window.riff` available.
- [`riff.track`](hooks.md#rifftrack), action: Fires when a track is loaded, before it plays.

## A track

Every track the player takes or hands back is the shape `Tracks::schema()` describes in PHP: `id`, `src`, `type`, `title`, `artist`, `album`, `duration`, `art`, `video`, `post`. The REST API and WPGraphQL return the same shape.

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
