<?php
/**
 * The meters: an element in the place Riff keeps under the turntable, and what fills it.
 *
 * Everything goes through Riff's documented surface: the `riff_before_player` and `riff_below_turntable`
 * actions, `window.riff.analyser()`, and `#riff`'s `data-riff-deck`.
 *
 * @package Riff\Meters
 */

namespace Riff\Meters;

// phpcs:set WordPress.WP.I18n text_domain[] riff-meters

defined( 'ABSPATH' ) || exit;

/**
 * Riff Meters.
 */
final class Meters {

	/**
	 * Hooks in.
	 */
	public static function register(): void {
		add_action( 'riff_before_player', array( self::class, 'enqueue' ) );
		add_action( 'riff_below_turntable', array( self::class, 'place' ) );
	}

	/**
	 * The script and its styles, where the player is.
	 */
	public static function enqueue(): void {
		wp_enqueue_style( 'riff-meters', RIFF_METERS_URL . 'assets/meters.css', array( 'riff-tokens' ), RIFF_METERS_VERSION );
		wp_enqueue_script( 'riff-meters', RIFF_METERS_URL . 'assets/meters.js', array( 'wp-i18n' ), RIFF_METERS_VERSION, true );
		wp_set_script_translations( 'riff-meters', 'riff-meters' );
	}

	/**
	 * Its place under the turntable, hidden until the script has something to measure.
	 */
	public static function place(): void {
		echo '<div class="riff-meters" aria-hidden="true" hidden></div>';
	}
}

// phpcs:set WordPress.WP.I18n text_domain[] riff
