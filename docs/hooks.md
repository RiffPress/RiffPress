# Hooks

Every filter and action Riff fires, generated from the docblocks in the plugin by `npm run docs:hooks`. Do not edit by hand. The stability promise is in the readme: a hook listed here keeps its name and parameters within a major version, and goes through a deprecated release before it is removed.

## Filters

### `riff_accent`

Filters the player's accent colour, after the theme's own setting.

Since 0.2.0. Fires in `plugins/riff/src/class-player.php` at line 296.

| Parameter | Type | Description |
| --- | --- | --- |
| `$accent` | `string` | A CSS colour, or an empty string for the default amber. |

### `riff_art_palettes`

Filters the palettes a drawn cover picks from: lists of background, accent and ink.

Since 0.1.0. Fires in `plugins/riff/features/listen/class-art.php` at line 196.

| Parameter | Type | Description |
| --- | --- | --- |
| `$palettes` | `array` | Palettes. |

### `riff_art_svg`

Filters a drawn cover.

Since 0.1.0. Fires in `plugins/riff/features/listen/class-art.php` at line 225.

| Parameter | Type | Description |
| --- | --- | --- |
| `$svg` | `string` | SVG document. |
| `$post` | `WP_Post` | Post. |

### `riff_bar_controls`

Filters the controls at the end of the bar on a wide screen.

Since 0.2.0. Fires in `plugins/riff/src/class-player.php` at line 198.

| Parameter | Type | Description |
| --- | --- | --- |
| `$controls` | `array[]` | Controls, keyed by slug: label, action, icon or svg, href. |

### `riff_chips`

Filters the chips under Now Playing's controls.

Since 0.2.0. Fires in `plugins/riff/src/class-player.php` at line 179.

| Parameter | Type | Description |
| --- | --- | --- |
| `$chips` | `array[]` | Chips, keyed by slug: label, action, icon or svg, href. |

### `riff_enabled`

Filters whether Riff's player loads on the current front-end request.

Since 0.1.0. Fires in `plugins/riff/src/class-player.php` at line 45.

| Parameter | Type | Description |
| --- | --- | --- |
| `$enabled` | `bool` | Whether to load the player. |

### `riff_library_item`

Filters a post as the library lists it.

Since 0.1.0. Fires in `plugins/riff/src/class-library.php` at line 302.

| Parameter | Type | Description |
| --- | --- | --- |
| `$item` | `array` | Item: id, title, url, artist, art, count, duration. |
| `$post` | `WP_Post` | Post. |

### `riff_library_query`

Filters the query behind the library: which posts the app lists.

Since 0.1.0. Fires in `plugins/riff/src/class-library.php` at line 260.

| Parameter | Type | Description |
| --- | --- | --- |
| `$args` | `array` | WP_Query arguments. |

### `riff_player_data`

Filters the data handed to the player script: strings, and the addresses of scripts a feature wants loaded, such as the Listen feature's app on the page that holds its block.

Since 0.1.0. Fires in `plugins/riff/src/class-player.php` at line 133.

| Parameter | Type | Description |
| --- | --- | --- |
| `$data` | `array` | Data. |

### `riff_sources`

Filters the sources tracks are read from, keyed by id.

Since 0.2.0. Fires in `plugins/riff/src/class-sources.php` at line 67.

| Parameter | Type | Description |
| --- | --- | --- |
| `$sources` | `Source[]` | Sources. |

### `riff_strings`

Filters the strings the player shows.

Since 0.1.0. Fires in `plugins/riff/src/class-player.php` at line 121.

| Parameter | Type | Description |
| --- | --- | --- |
| `$strings` | `array` | Strings, keyed by name. |

### `riff_track`

Filters a track before the player reads it.

Since 0.1.0. Fires in `plugins/riff/src/class-tracks.php` at line 135.

| Parameter | Type | Description |
| --- | --- | --- |
| `$track` | `array` | Track: id, src, type, title, artist, album, duration, art, video, post. |
| `$attachment_id` | `int` | Attachment ID, or 0 for a file outside the Media Library. |
| `$post_id` | `int` | The post the track appears in, or 0. |

## Actions

### `riff_after_player`

Fires after the player's markup.

Since 0.1.0. Fires in `plugins/riff/src/class-player.php` at line 150.

### `riff_before_player`

Fires before the player's markup.

Since 0.1.0. Fires in `plugins/riff/src/class-player.php` at line 143.

