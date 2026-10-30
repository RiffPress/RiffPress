# Hooks

Every filter and action Riff fires, generated from the docblocks in the plugin by `npm run docs:hooks`. Do not edit by hand. The stability promise is in .github/SUPPORT.md: a hook listed here keeps its name and parameters within a major version, and goes through a deprecated release before it is removed.

The same reference, a page per hook, is on the site under Developers, PHP and JavaScript.

## Filters

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

### `riff_enabled`

Filters whether Riff's player loads on the current front-end request.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$enabled` | `bool` | Whether to load the player. |

### `riff_now_playing_tabs`

Filters the tabs beside Now Playing. Add a tab by slug with a label; its panel is `[data-riff-panel="<slug>"]`, empty until your script fills it. Up next, `queue`, always comes first and cannot be removed.

Since 4.16.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$tabs` | `array[]` | Tabs keyed by slug, each with a label. |

### `riff_protect_storage`

Filters whether the storage a file is kept in elsewhere was made private, when it is protected, or public again, when it isn't. A plugin that keeps uploads in object storage or on a CDN answers for its own files: true once the copy there is private (or public again), or a WP_Error to say why it couldn't be, which the Media Library shows. Without an answer, a file only on this server is moved into the protected folder, and one kept elsewhere is not protected, as moving it would leave it public there. Riff can't send a file it doesn't have, so a plugin that protects its files signs their addresses through riff_protected_url too.

Since 5.7.0. Fires in `plugins/riff/src/class-protected-files.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$done` | `true\|WP_Error\|null` | Null, the default: nothing keeps it elsewhere. |
| `$id` | `int` | Attachment ID. |
| `$protect` | `bool` | True to make it private, false to make it public again. |

### `riff_protected_send`

Filters how a protected file is handed over: 'php' sends it from PHP; 'x-sendfile' asks Apache's mod_xsendfile or LiteSpeed to send it; 'x-accel-redirect' asks Nginx, which then needs an internal location for the protected folder (see the readme).

Since 4.18.0. Fires in `plugins/riff/src/class-protect.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$how` | `string` | 'php', 'x-sendfile' or 'x-accel-redirect'. Default 'php'. |
| `$file` | `string` | Absolute path. |
| `$id` | `int` | Attachment ID. |

### `riff_protected_url`

Filters the address a protected file is sent from instead of WordPress: a signed address on a CDN or in object storage, such as a CloudFront or S3 presigned URL or a Bunny or Cloudflare token, that stops working at $expires. Riff has checked that the visitor may have the file before it asks, and sends them on with a 302 nothing caches. Empty, the default, sends the file as riff_protected_send says.

Since 5.7.0. Fires in `plugins/riff/src/class-protect.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$url` | `string` | Signed address, or empty. |
| `$id` | `int` | Attachment ID. |
| `$expires` | `int` | When the address should stop working, as a Unix time: an hour on. |

### `riff_sources`

Filters the sources tracks are read from, keyed by id.

Since 4.0.0. Fires in `plugins/riff/src/class-sources.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$sources` | `Source[]` | Sources. |

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

### `riff_before_player`

Fires before the player's markup.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

## JavaScript

The player fires these through `wp.hooks` when the page has it. Each action is also dispatched as a `riff:<name>` `CustomEvent` on `#riff` with the same detail, for pages without the WordPress scripts.

### JavaScript filters

#### `riff.queue`

Filters the tracks about to become the queue.

Return a new array to add, drop or reorder tracks before any of them plays.

Since 4.0.0. Fires in `plugins/riff/assets/player/queue.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `tracks` | `Object[]` | The tracks, in the shape `Tracks::schema()` describes. |
| `index` | `number` | The position in `tracks` that will play first. |

#### `riff.shortcuts`

Filters whether the single-key shortcuts (Space, K, J, L) act on a key press.

Return `false` to turn them off, which WCAG 2.1.4 asks to be possible.

Since 4.0.1. Fires in `plugins/riff/assets/player/keyboard.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean` | Whether the shortcuts act. Default true. |
| `event` | `KeyboardEvent` | The key press. |

#### `riff.track`

Filters one track as a queue is set, after `riff.queue`.

Since 4.0.0. Fires in `plugins/riff/assets/player/queue.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `track` | `Object` | The track, in the shape `Tracks::schema()` describes. |

### JavaScript actions

#### `riff.ended`

Fires when a track plays to its end, before the next one loads.

Since 4.0.0. Fires in `plugins/riff/assets/player/media.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track that ended. |
| `api` | `Object` | `window.riff`. |

#### `riff.pause`

Fires when the track pauses.

Since 4.0.0. Fires in `plugins/riff/assets/player/media.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track. |
| `api` | `Object` | `window.riff`. |

#### `riff.play`

Fires when the track starts or resumes playing.

Since 4.0.0. Fires in `plugins/riff/assets/player/media.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track. |
| `api` | `Object` | `window.riff`. |

#### `riff.queue`

Fires when the queue changes while it plays: tracks added to play next or at the end, one moved or removed, or the queue cleared.

Since 4.19.0. Fires in `plugins/riff/assets/player/queue.js`.

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

Since 4.16.0. Fires in `plugins/riff/assets/player/now-playing.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.id` | `string` | The tab's slug. |
| `detail.panel` | `HTMLElement` | The tab's panel, `[data-riff-panel="<slug>"]`. |
| `detail.track` | `Object\|null` | The track playing. |
| `api` | `Object` | `window.riff`. |

#### `riff.time`

Fires as the track plays, a few times a second, and again after a seek.

Since 4.32.0. Fires in `plugins/riff/assets/player/media.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | Where the track is. |
| `detail.track` | `Object` | The track. |
| `detail.time` | `number` | Seconds from its start. |
| `detail.duration` | `number` | Its length in seconds, or 0 until known. |
| `api` | `Object` | `window.riff`. |

#### `riff.track`

Fires when a track is loaded, before it plays.

Since 4.0.0. Fires in `plugins/riff/assets/player/playback.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track now loaded. |
| `detail.index` | `number` | Its position in the play order. |
| `detail.queue` | `Object[]` | The queue in play order. |
| `api` | `Object` | `window.riff`. |

