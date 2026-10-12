<?php
/**
 * The player on the front end: one script module, one stylesheet, and the markup in the footer.
 *
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * Front-end player.
 *
 * The player loads on every front-end page, not only pages with media, because a track started on
 * one page keeps its place when the listener moves to another.
 */
final class Player {

	/**
	 * Hooks the assets and the markup.
	 */
	public static function register(): void {
		add_action( 'wp_enqueue_scripts', array( self::class, 'enqueue' ) );
		add_action( 'wp_footer', array( self::class, 'markup' ), 5 );
	}

	/**
	 * Whether the player belongs on this request.
	 *
	 * @return bool
	 */
	public static function enabled(): bool {
		$enabled = ! is_admin() && ! is_feed() && ! is_embed();
		/**
		 * Filters whether Riff's player loads on the current front-end request.
		 *
		 * @param bool $enabled Whether to load the player.
		 */
		return (bool) apply_filters( 'riff_enabled', $enabled );
	}

	/**
	 * Enqueues the stylesheet and the script module.
	 */
	public static function enqueue(): void {
		if ( ! self::enabled() ) {
			return;
		}
		wp_enqueue_style( 'riff', RIFF_URL . 'assets/riff.css', array(), self::version( 'assets/riff.css' ) );
		wp_enqueue_script_module( 'riff', RIFF_URL . 'assets/riff.js', array(), self::version( 'assets/riff.js' ) );
	}

	/**
	 * The cache key for an asset: the plugin version and the file's own time, so an edit shows up
	 * without waiting for a release or clearing the browser's cache. One stat per asset per page.
	 *
	 * @param string $file Path relative to the plugin folder.
	 * @return string
	 */
	private static function version( string $file ): string {
		$time = filemtime( RIFF_DIR . $file );
		return $time ? RIFF_VERSION . '.' . $time : RIFF_VERSION;
	}

	/**
	 * Prints the player and the strings the script needs.
	 */
	public static function markup(): void {
		if ( ! self::enabled() ) {
			return;
		}
		$strings = array(
			'play'        => __( 'Play', 'riff' ),
			'pause'       => __( 'Pause', 'riff' ),
			'repeatOff'   => __( 'Repeat off', 'riff' ),
			'repeatAll'   => __( 'Repeat all', 'riff' ),
			'repeatOne'   => __( 'Repeat one', 'riff' ),
			'shuffleOn'   => __( 'Shuffle on', 'riff' ),
			'shuffleOff'  => __( 'Shuffle off', 'riff' ),
			/* translators: %s: post title. */
			'playingFrom' => __( 'Playing from %s', 'riff' ),
			/* translators: %s: track title. */
			'playTrack'   => __( 'Play %s', 'riff' ),
			'video'       => __( 'Video', 'riff' ),
			'unavailable' => __( 'This track could not be played.', 'riff' ),
			'copied'      => __( 'Link copied', 'riff' ),
		);
		printf(
			'<script type="application/json" id="riff-data">%s</script>',
			wp_json_encode( array( 'strings' => $strings ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE )
		);
		require RIFF_DIR . 'templates/player.php';
	}

	/**
	 * Inline SVG icon, from Google's Material Icons (Apache License 2.0), the set Google's own apps are drawn in.
	 *
	 * @param string $name Icon name.
	 * @return string
	 */
	public static function icon( string $name ): string {
		$paths = array(
			'play'      => '<path d="M8 5v14l11-7z"/>',
			'pause'     => '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
			'prev'      => '<path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>',
			'next'      => '<path d="m6 18 8.5-6L6 6v12zM16 6v12h2V6h-2z"/>',
			'repeat'    => '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
			'repeatOne' => '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/>',
			'shuffle'   => '<path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>',
			'down'      => '<path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>',
			'caret'     => '<path d="m7 14 5-5 5 5z"/>',
			'cast'      => '<path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>',
			'song'      => '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
			'video'     => '<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM9.5 16.5v-9l7 4.5-7 4.5z"/>',
			'volume'    => '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
			'share'     => '<path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
		);

		return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">' . ( $paths[ $name ] ?? '' ) . '</svg>';
	}
}
