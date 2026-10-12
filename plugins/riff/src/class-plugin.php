<?php
/**
 * Wires Riff's parts into WordPress.
 *
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * Bootstrap.
 */
final class Plugin {

	/**
	 * Registers every hook. Runs on plugins_loaded.
	 */
	public static function boot(): void {
		Media::register();
		Blocks::register();
		Player::register();
	}
}
