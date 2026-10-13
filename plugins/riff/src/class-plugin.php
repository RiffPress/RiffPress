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
		Library::register();
		Api::register();
		// The Listen feature: the block, its views, the drawn covers. Built on the hooks above.
		Listen\App::register();
		Listen\Art::register();
	}
}
