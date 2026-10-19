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

### `riff_app_theme_tokens`

Filters the custom properties the Riff block takes from the theme.

Return an empty array to keep the block's own WordPress.org palette and fonts on every theme, or set any `--riff-app-*` property to a CSS value. With `--riff-app-bg` or `--riff-app-ink` set, the stylesheet mixes the secondary text, borders, surfaces and the accent's shades from them.

Since 4.14.0. Fires in `plugins/riff/features/listen/class-app.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$tokens` | `array` | Custom property values from the theme's global styles, keyed by name. |

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

### `riff_can_play`

Filters whether the current visitor may play a track.

A membership or store plugin returns false for a track its rules keep from this visitor. The track is then listed as locked rather than hidden, with no file to play.

Since 4.17.0. Fires in `plugins/riff/src/class-tracks.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$allowed` | `bool` | Whether the track plays. Default true. |
| `$track` | `array` | Track, after riff_track. |
| `$attachment_id` | `int` | Attachment ID, or 0 for a file outside the Media Library. |
| `$post_id` | `int` | The post the track appears in, or 0. |

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

### `riff_now_playing_tabs`

Filters the tabs beside Now Playing. Add a tab by slug with a label; its panel is `[data-riff-panel="<slug>"]`, empty until your script fills it. Up next, `queue`, always comes first and cannot be removed.

Since 4.16.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$tabs` | `array[]` | Tabs keyed by slug, each with a label. |

### `riff_player_data`

Filters the data handed to the player script: strings, and the addresses of scripts a feature wants loaded, such as the Listen feature's app on the page that holds its block.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$data` | `array` | Data. |

### `riff_protected_send`

Filters how a protected file is handed over: 'php' sends it from PHP; 'x-sendfile' asks Apache's mod_xsendfile or LiteSpeed to send it; 'x-accel-redirect' asks Nginx, which then needs an internal location for the protected folder (see the readme).

Since 4.18.0. Fires in `plugins/riff/src/class-protect.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$how` | `string` | 'php', 'x-sendfile' or 'x-accel-redirect'. Default 'php'. |
| `$file` | `string` | Absolute path. |
| `$id` | `int` | Attachment ID. |

### `riff_sources`

Filters the sources tracks are read from, keyed by id.

Since 4.0.0. Fires in `plugins/riff/src/class-sources.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$sources` | `Source[]` | Sources. |

### `riff_standalone_manifest`

Filters the web app manifest of standalone mode.

Since 4.17.0. Fires in `plugins/riff/features/listen/class-standalone.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$manifest` | `array` | The manifest's members, as https://www.w3.org/TR/appmanifest/ names them. |

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

### `riff_unlock_url`

Filters where a locked track sends the visitor to unlock it: a sign-up, membership or checkout page.

Since 4.17.0. Fires in `plugins/riff/src/class-tracks.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$url` | `string` | Address, or empty for none. Default empty. |
| `$track` | `array` | Track. |
| `$attachment_id` | `int` | Attachment ID, or 0. |
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

#### `riff.like`

Fires when a like is added or taken away, and once the likes a visitor kept in this browser have joined their account after they signed in.

Since 4.20.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.change` | `string` | `like`, `unlike` or `sync`. |
| `detail.kind` | `string\|null` | `track`, `album` or `artist`; null for `sync`. |
| `detail.id` | `number\|null` | Its ID; null for `sync`. |
| `detail.likes` | `Object[]` | Every like, newest first, each `{ kind, id, at }`. |
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

#### `riff.playlist`

Fires when one of the signed-in listener's playlists is made, changed or deleted.

Since 4.20.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.change` | `string` | `create`, `add`, `rename`, `reorder`, `remove` or `delete`. |
| `detail.playlist` | `Object` | The playlist, `{ id, title, count }`. |
| `detail.playlists` | `Object[]` | Every playlist, the most recently changed first. |
| `api` | `Object` | `window.riff`. |

#### `riff.queue`

Fires when the queue changes while it plays: tracks added to play next or at the end, one moved or removed, or the queue cleared.

Since 4.19.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.change` | `string` | `next`, `add`, `move`, `remove` or `clear`. |
| `detail.queue` | `Object[]` | The queue in play order. |
| `detail.index` | `number` | The playing track's place in it. |
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

#### `riff.tab`

Fires when a tab beside Now Playing is shown, including Up next. A plugin that added a tab fills its panel here, and again on `riff.track` while its tab is showing.

Since 4.16.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.id` | `string` | The tab's slug. |
| `detail.panel` | `HTMLElement` | The tab's panel, `[data-riff-panel="<slug>"]`. |
| `detail.track` | `Object\|null` | The track playing. |
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

