# JavaScript

How a script talks to the player. Everything here is public and keeps working within a major version; see the stability promise in the plugin's readme.

## `window.riff`

The player's api, set before `riff.ready` fires. `window.riff.version` is `1`.

| Member | Does |
| --- | --- |
| `play( tracks, index = 0, { shuffle } )` | Makes `tracks` the queue and plays the one at `index`. `shuffle: true` or `false` sets shuffle first. |
| `toggle()` | Play or pause. |
| `next()`, `prev()` | Skip. |
| `seek( seconds )` | Moves the current track. |
| `open()`, `close()` | Now Playing. |
| `mount()` | Reads every `figure[data-riff-track]` on the page again, after content was swapped in. |
| `current()` | The track playing, or `null`. |
| `queue()` | The queue in play order. |
| `playing()` | Whether something is playing. |
| `on( name, fn )` | Listens to a `riff:<name>` event; returns a function that stops listening. |
| `strings` | The player's strings, after the `riff_strings` filter. |

A track is the shape `Tracks::schema()` describes in PHP: `id`, `src`, `type`, `title`, `artist`, `album`, `duration`, `art`, `video`, `post`.

## Actions

Each change of state is announced twice with the same detail: through `wp.hooks` as `riff.<name>` for scripts that depend on `wp-hooks`, and as a `riff:<name>` `CustomEvent` on `#riff` (it bubbles) for everything else.

```js
wp.hooks.addAction( 'riff.track', 'my-plugin', ( detail, riff ) => {
	console.log( detail.track.title );
} );

window.riff.on( 'play', ( detail ) => {} );
document.getElementById( 'riff' ).addEventListener( 'riff:pause', ( e ) => e.detail );
```

| Name | When | Detail |
| --- | --- | --- |
| `ready` | The player is set up, state restored, `window.riff` available. | `queue`, `track` |
| `track` | A track is loaded. | `track`, `index`, `queue` |
| `play`, `pause`, `ended` | The media element says so. | `track` |
| `open`, `close` | Now Playing. | `track` |
| `action` | A control an extension added through `riff_chips` or `riff_bar_controls` was pressed. | `action`, `track`, `button` |

## Filters

Only through `wp.hooks`.

| Name | Value | When |
| --- | --- | --- |
| `riff.queue` | The tracks about to become the queue, and the index that will play. | Before a queue is set. |
| `riff.track` | One track. | For each track as a queue is set. |

```js
wp.hooks.addFilter( 'riff.track', 'my-plugin', ( track ) => ( {
	...track,
	title: track.title.toUpperCase(),
} ) );
```

## Controls

Add a chip under Now Playing or a control at the end of the bar from PHP, then handle it here:

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
