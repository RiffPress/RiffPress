# Hooks

Every filter and action Riff fires, generated from the docblocks in the plugin by `npm run docs:hooks`. Do not edit by hand. The stability promise is in the readme: a hook listed here keeps its name and parameters within a major version, and goes through a deprecated release before it is removed.

The same reference, a page per hook, is on the site under Developers, PHP and JavaScript.

## Filters

### `riff_accent`

Filters the player's accent colour, after the theme's own setting.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$accent` | `string` | A CSS colour, or an empty string for the default amber. |

### `riff_art_layouts`

Filters the layouts a drawn cover picks from: where the record sits. The plugin knows `corner`, `centre` and `horizon`; a layout it does not know draws as `corner`.

Since 4.3.0. Fires in `plugins/riff/features/listen/class-art.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$layouts` | `string[]` | Layout slugs. |

### `riff_art_palettes`

Filters the palettes a drawn cover picks from: lists of background, accent and ink.

Since 4.0.0. Fires in `plugins/riff/features/listen/class-art.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$palettes` | `array` | Palettes. |

### `riff_art_svg`

Filters a drawn cover.

Since 4.0.0. Fires in `plugins/riff/features/listen/class-art.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$svg` | `string` | SVG document. |
| `$post` | `WP_Post` | Post. |

### `riff_bar_controls`

Filters the controls at the end of the bar on a wide screen.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$controls` | `array[]` | Controls, keyed by slug: label, action, icon or svg, href. |

### `riff_chips`

Filters the chips under Now Playing's controls.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$chips` | `array[]` | Chips, keyed by slug: label, action, icon or svg, href. |

### `riff_enabled`

Filters whether Riff's player loads on the current front-end request.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$enabled` | `bool` | Whether to load the player. |

### `riff_library_item`

Filters a post as the library lists it.

Since 4.0.0. Fires in `plugins/riff/src/class-library.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$item` | `array` | Item: id, title, url, artist, art, count, duration. |
| `$post` | `WP_Post` | Post. |

### `riff_library_query`

Filters the query behind the library: which posts the app lists.

Since 4.0.0. Fires in `plugins/riff/src/class-library.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$args` | `array` | WP_Query arguments. |

### `riff_player_data`

Filters the data handed to the player script: strings, and the addresses of scripts a feature wants loaded, such as the Listen feature's app on the page that holds its block.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$data` | `array` | Data. |

### `riff_sources`

Filters the sources tracks are read from, keyed by id.

Since 4.0.0. Fires in `plugins/riff/src/class-sources.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$sources` | `Source[]` | Sources. |

### `riff_strings`

Filters the strings the player shows.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$strings` | `array` | Strings, keyed by name. |

### `riff_track`

Filters a track before the player reads it.

Since 4.0.0. Fires in `plugins/riff/src/class-tracks.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$track` | `array` | Track: id, src, type, title, artist, album, duration, art, video, post. |
| `$attachment_id` | `int` | Attachment ID, or 0 for a file outside the Media Library. |
| `$post_id` | `int` | The post the track appears in, or 0. |

## Actions

### `riff_after_player`

Fires after the player's markup.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

### `riff_before_player`

Fires before the player's markup.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

## JavaScript

The player fires these through `wp.hooks` when the page has it. Each action is also dispatched as a `riff:<name>` `CustomEvent` on `#riff` with the same detail, for pages without the WordPress scripts.

### JavaScript filters

#### `riff.queue`

Filters the tracks about to become the queue.

Return a new array to add, drop or reorder tracks before any of them plays.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `tracks` | `Object[]` | The tracks, in the shape `Tracks::schema()` describes. |
| `index` | `number` | The position in `tracks` that will play first. |

#### `riff.shortcuts`

Filters whether the single-key shortcuts (Space, K, J, L) act on a key press.

Return `false` to turn them off, which WCAG 2.1.4 asks to be possible.

Since 4.0.1. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean` | Whether the shortcuts act. Default true. |
| `event` | `KeyboardEvent` | The key press. |

#### `riff.track`

Filters one track as a queue is set, after `riff.queue`.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `track` | `Object` | The track, in the shape `Tracks::schema()` describes. |

### JavaScript actions

#### `riff.action`

Fires when a control an extension added through `riff_chips` or `riff_bar_controls` is pressed.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What was pressed. |
| `detail.action` | `string` | The control's `action`, as the PHP filter set it. |
| `detail.track` | `Object` | The track playing. |
| `detail.button` | `HTMLElement` | The button that was pressed. |
| `api` | `Object` | `window.riff`. |

#### `riff.close`

Fires when Now Playing closes.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track playing. |
| `api` | `Object` | `window.riff`. |

#### `riff.ended`

Fires when a track plays to its end, before the next one loads.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track that ended. |
| `api` | `Object` | `window.riff`. |

#### `riff.open`

Fires when Now Playing opens.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track playing. |
| `api` | `Object` | `window.riff`. |

#### `riff.pause`

Fires when the track pauses.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track. |
| `api` | `Object` | `window.riff`. |

#### `riff.play`

Fires when the track starts or resumes playing.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track. |
| `api` | `Object` | `window.riff`. |

#### `riff.ready`

Fires once the player is set up, its state restored and `window.riff` available.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | The player's state. |
| `detail.queue` | `Object[]` | The queue in play order. |
| `detail.track` | `Object\|null` | The track loaded, or null. |
| `api` | `Object` | `window.riff`. |

#### `riff.track`

Fires when a track is loaded, before it plays.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track now loaded. |
| `detail.index` | `number` | Its position in the play order. |
| `detail.queue` | `Object[]` | The queue in play order. |
| `api` | `Object` | `window.riff`. |

