<?php
/**
 * Wires Riff's parts into WordPress.
 *
 * @since 4.0.0
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
	 * @since 4.0.0
	 */
	public static function boot(): void {
		Sources::register( new Blocks_Source() );
		Media::register();
		Protect::register();
		Catalog::register();
		Catalog_Rest::register();
		Likes::register();
		Likes_Rest::register();
		Playlists::register();
		Playlists_Rest::register();
		Blocks::register();
		Bindings::register();
		Player::register();
		Library::register();
		Api::register();
		Fields::register();
		Abilities::register();
		Cli::register();
		// The Listen feature: the block, its views, the drawn covers. Built on the hooks above.
		Listen\App::register();
		Listen\Standalone::register();
		Listen\Art::register();
		Listen\First_Run::register();
	}
}
