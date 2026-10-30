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

### `window.riff.time()`

Where the track is.

Returns `number`: Seconds from the start of the track, or 0 with nothing playing.

Since 4.32.0.

### `window.riff.panel( id, panel )`

Adds a panel, or replaces the one with the same id. A panel is its own thing: beside the page and Now Playing on a wide screen, opened from its button in the bar, and over everything on a phone, opened from its chip in Now Playing. One shows at a time. Riff adds Up next (`queue`, order 40) the same way, and Riff Lyrics adds Lyrics (`lyrics`, 30).

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | Lowercase letters, digits and dashes; the panel is `[data-riff-panel="<id>"]`. |
| `panel` | `Object` | The panel. |
| `panel.label` | `string` | Its name: its heading, and its button's. |
| `panel.icon` | `string` | Its button's icon, SVG markup from your own code, never from content. |
| `panel.order` | `number` | Where its button sits among the bar's controls, lowest first. Default 50. |
| `panel.render` | `(panel: HTMLElement, track: Object\|null) => void` | Fills it as it opens and again as the track changes while it is open. The `riff.panel` action says the same. |

Returns `() => void`: Takes the panel away again.

Since 5.8.0.

### `window.riff.openPanel( id )`

Opens a panel: `queue` for Up next, or one a plugin added.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The panel's id. |

Since 5.8.0.

### `window.riff.closePanel()`

Closes the panel that is open.

Since 5.8.0.

### `window.riff.control( id, control )`

Adds a control to the player's bar, or replaces the one with the same id. Riff adds its own the same way: Like (order 10), the badges (20), Up next (40), Play on another device (60), the volume (70) and Now Playing (80); Riff Lyrics adds Lyrics (30).

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | Lowercase letters, digits and dashes; it names the control in `data-riff-control`. |
| `control` | `Object` | The control. |
| `control.label` | `string\|((track: Object\|null) => string)` | What it is called, for a screen reader and a pointer's tooltip; or a function of the track. |
| `control.icon` | `string` | Its icon, SVG markup from your own code, never from content. |
| `control.order` | `number` | Where it sits among the others, lowest first. Default 50. |
| `control.run` | `(track: Object\|null, button: HTMLElement) => void` | What a press does. |
| `control.action` | `string` | One of the player's own actions instead of `run`, such as `shuffle` or `repeat`. |
| `control.pressed` | `(track: Object\|null) => boolean` | Whether it is pressed, for a control that turns something on and off. |
| `control.shown` | `(track: Object\|null) => boolean` | Whether it shows. Default always. |
| `control.wide` | `boolean` | Only on a wide screen; a phone's bar keeps to the track, Play and what it needs. |
| `control.element` | `() => HTMLElement` | An element of your own in place of a button, which you keep up to date. |

Returns `() => void`: Takes the control away again.

Since 5.8.0.

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
- [`riff.panel`](hooks.md#riffpanel), action: Fires when a panel opens or closes, Up next included, and again for an open panel when the track changes. A panel's script fills it here, or in the `render` it was added with.
- [`riff.pause`](hooks.md#riffpause), action: Fires when the track pauses.
- [`riff.play`](hooks.md#riffplay), action: Fires when the track starts or resumes playing.
- [`riff.queue`](hooks.md#riffqueue), action: Fires when the queue changes while it plays: tracks added to play next or at the end, one moved or removed, or the queue cleared.
- [`riff.ready`](hooks.md#riffready), action: Fires once the player is set up, its state restored and `window.riff` available.
- [`riff.time`](hooks.md#rifftime), action: Fires as the track plays, a few times a second, and again after a seek.
- [`riff.track`](hooks.md#rifftrack), action: Fires when a track is loaded, before it plays.

## A track

Every track the player takes or hands back is the shape `Tracks::schema()` describes in PHP; the PHP reference lists every property. The REST API returns the same shape.

## A panel, and a control in the bar

Add a panel with `window.riff.panel()` once the player is ready: it gets a button in the bar on a wide screen and a chip in Now Playing on a phone, and is filled as it opens and again as the track changes. Add a control to the bar with `window.riff.control()`. Riff adds Up next and its own controls the same way, and Riff Lyrics its Lyrics panel, on nothing but the public API.

```js
document.addEventListener( 'riff:ready', () => {
	window.riff.panel( 'credits', {
		label: 'Credits',
		icon: CREDITS_ICON,
		render: ( panel, track ) => showCredits( panel, track ),
	} );
	window.riff.control( 'bookmark', {
		label: 'Bookmark',
		icon: BOOKMARK_ICON,
		order: 65,
		pressed: ( track ) => isBookmarked( track ),
		run: ( track ) => toggleBookmark( track ),
	} );
} );
```

## Loading your script

The player is an ES module with no dependencies. A script that uses `wp.hooks` depends on `wp-hooks`; one that only uses `window.riff` or the events can load however it likes, and should wait for `riff.ready` (or check `window.riff`) before calling anything.
