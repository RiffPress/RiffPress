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
		Protected_Path::register();
		Private_Site::register();
		Catalog::register();
		Import::register();
		Catalog_Rest::register();
		Likes::register();
		Likes_Rest::register();
		Playlists::register();
		Playlists_Rest::register();
		Blocks::register();
		Bindings::register();
		Player::register();
		Navigation::register();
		Shortcuts::register();
		Turntable::register();
		About::register();
		Library::register();
		Blocks_Rest::register();
		Api::register();
		Fields::register();
		Abilities::register();
		Mcp::register();
		Cli::register();
		// The Listen feature: the block, its views, the drawn covers. Built on the hooks above.
		Listen\App::register();
		Listen\Standalone::register();
		Listen\Views::register();
		Listen\Art::register();
		Listen\First_Run::register();
		Listen\Together::register();
		Listen\Home_View::register();
	}
}
