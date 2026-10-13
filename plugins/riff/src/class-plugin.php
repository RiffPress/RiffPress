<?php
/**
 * Wires Riff's parts into WordPress.
 *
 * @since 0.1.0
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
	 *
	 * @since 0.1.0
	 */
	public static function boot(): void {
		Sources::register( new Blocks_Source() );
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
