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

### `window.riff.open( view )`

Opens Now Playing, on a view of it when one is named.

| Parameter | Type | Description |
| --- | --- | --- |
| `view` | `string` | A screen view's id. Default the album, or the turntable where the whole screen is one or the listener last chose it. |

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

### `window.riff.speed( rate )`

How fast the music plays, with its pitch kept where the browser can keep it (`preservesPitch`): slower to learn a part, faster to skim. Given a rate, from 0.5 to 2, it sets it, and the speed holds for every track until it is set again. On the turntable it is multiplied by the deck's own speed and pitch.

| Parameter | Type | Description |
| --- | --- | --- |
| `rate` | `number` | The speed to set, 1 for the music's own. Leave it out to read it. |

Returns `number`: The speed now.

Since 5.8.0.

### `window.riff.view( id, view )`

Gives a view what it does as it opens, or adds one the server didn't register. A view is opened from its button in the bar, and on a phone from its chip in Now Playing: a screen of Now Playing, which takes the whole screen above the bar, or a panel beside the page. Register a view on the server with `riff_register_view()`, so the page has it before any script; this is for what only the browser knows. Riff's own are the album (`album`, order 26), the turntable (`turntable`, 28), About (`about`, a panel, 36), Up next (`queue`, a panel, 40) and Together (`together`, a panel, 45); Riff Lyrics registers Lyrics (`lyrics`, 30), Riff Sing Sing (`sing`, 32) and Riff Chords Chords (`chords`, 34).

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | Lowercase letters, digits and dashes; a screen is `[data-riff-view="<id>"]`, a panel `[data-riff-panel="<id>"]`. |
| `view` | `Object` | The view. |
| `view.label` | `string` | Its name: its heading, its button's and its chip's. Needed for one the server didn't register. |
| `view.icon` | `string` | Its button's icon, SVG markup from your own code, never from content. |
| `view.order` | `number` | Where its button sits among the bar's controls, lowest first. Default 50. |
| `view.place` | `string` | `screen`, the default, or `side` for a panel. |
| `view.render` | `(view: HTMLElement, track: Object\|null) => void` | Fills it as it opens and again as the track changes while it is open. The `riff.view` action says the same. |

Returns `() => void`: Takes away what this gave it, or the view this added.

Since 5.8.0.

### `window.riff.openView( id )`

Opens a view: a screen of Now Playing, or a panel beside the page.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The view's id: `album`, `turntable`, `queue`, or one a plugin registered. |

Since 5.8.0.

### `window.riff.closeView()`

Closes the panel that is open, or else Now Playing.

Since 5.8.0.

### `window.riff.control( id, control )`

Gives a control in the player's bar what it does, or adds one the server didn't register. Register a control on the server with `riff_register_control()`, so the page has it before any script; this is for what only the browser knows. Riff's own are Like (order 10), the badges (20), Play on another device (60) and the volume (70).

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | Lowercase letters, digits and dashes; it names the control in `data-riff-control`. |
| `control` | `Object` | The control. |
| `control.label` | `string\|((track: Object\|null) => string)` | What it is called, for a screen reader and a pointer's tooltip; or a function of the track. Needed for one the server didn't register. |
| `control.icon` | `string` | Its icon, SVG markup from your own code, never from content. |
| `control.order` | `number` | Where it sits among the others, lowest first. Default 50. |
| `control.run` | `(track: Object\|null, button: HTMLElement) => void` | What a press does. |
| `control.action` | `string` | One of the player's own actions instead of `run`, such as `shuffle` or `repeat`. |
| `control.pressed` | `(track: Object\|null) => boolean` | Whether it is pressed, for a control that turns something on and off. |
| `control.shown` | `(track: Object\|null) => boolean` | Whether it shows. Default always. |
| `control.wide` | `boolean` | Only on a wide screen; a phone's bar keeps to the track, Play and what it needs. |
| `control.element` | `() => HTMLElement` | An element of your own in place of a button, which you keep up to date. |

Returns `() => void`: Takes away what this gave it, or the control this added.

Since 5.8.0.

### `window.riff.shortcut( id, run )`

Gives a keyboard shortcut registered on the server with `riff_register_shortcut()` what it does. It follows Riff's own single-key shortcuts: it acts only while a track is loaded, never while the listener types in a field or holds Ctrl, Alt or Command, and only where those are on, for a signed-in listener who has not turned them off on their profile, unless the `riff.shortcuts` filter turns them off. A key the server didn't register does nothing, since the profile lists every key there is.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The shortcut's id, as it was registered. |
| `run` | `(track: Object, event: KeyboardEvent) => void` | What the key does, given the track loaded and the key press. |

Returns `() => void`: Takes it away again.

Since 5.9.0.

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

- [`riff.menu`](hooks.md#riffmenu), filter: Filters the items of the track menu, the … beside every row and every track in Up next.
- [`riff.queue`](hooks.md#riffqueue), filter: Filters the tracks about to become the queue.
- [`riff.shortcuts`](hooks.md#riffshortcuts), filter: Filters whether the single-key shortcuts (Space, K, J, L and plugins' keys) act on a key press.
- [`riff.track`](hooks.md#rifftrack), filter: Filters one track as a queue is set, after `riff.queue`.
- [`riff.ended`](hooks.md#riffended), action: Fires when a track plays to its end, before the next one loads.
- [`riff.pause`](hooks.md#riffpause), action: Fires when the track pauses.
- [`riff.play`](hooks.md#riffplay), action: Fires when the track starts or resumes playing.
- [`riff.queue`](hooks.md#riffqueue), action: Fires when the queue changes while it plays: tracks added to play next or at the end, one moved or removed, or the queue cleared.
- [`riff.ready`](hooks.md#riffready), action: Fires once the player is set up, its state restored and `window.riff` available.
- [`riff.time`](hooks.md#rifftime), action: Fires as the track plays, a few times a second, and again after a seek.
- [`riff.track`](hooks.md#rifftrack), action: Fires when a track is loaded, before it plays.
- [`riff.view`](hooks.md#riffview), action: Fires when a view opens or closes, Riff's own included, and again for an open view when the track changes. A view's script fills it here, or in the `render` it was given.

## A track

Every track the player takes or hands back is the shape `Tracks::schema()` describes in PHP; the PHP reference lists every property. The REST API returns the same shape.

## A view, and a control in the bar

Register a view or a control on the server with `riff_register_view()` and `riff_register_control()` on the `riff_register` action, so the page has it before any script runs; then give it what it does in the browser, by its id. `window.riff.view()` fills a view as it opens and again as the track changes, and `window.riff.control()` gives a control its press. A view is a screen of Now Playing, taking the whole screen above the bar, or a panel beside the page. Riff registers the album, the turntable, Up next, Together and its own controls the same way, and Riff Lyrics, Riff Sing and Riff Chords their views, on nothing but the public API.

```php
add_action( 'riff_register', function () {
	riff_register_view( 'credits', array( 'label' => __( 'Credits', 'my-plugin' ), 'icon' => CREDITS_ICON, 'order' => 32 ) );
	riff_register_control( 'bookmark', array( 'label' => __( 'Bookmark', 'my-plugin' ), 'icon' => BOOKMARK_ICON, 'order' => 65 ) );
} );
```

```js
document.addEventListener( 'riff:ready', () => {
	window.riff.view( 'credits', {
		render: ( view, track ) => showCredits( view, track ),
	} );
	window.riff.control( 'bookmark', {
		pressed: ( track ) => isBookmarked( track ),
		run: ( track ) => toggleBookmark( track ),
	} );
} );
```

## Loading your script

The player is an ES module with no dependencies. A script that uses `wp.hooks` depends on `wp-hooks`; one that only uses `window.riff` or the events can load however it likes, and should wait for `riff.ready` (or check `window.riff`) before calling anything.
