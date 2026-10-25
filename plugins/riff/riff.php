<?php
/**
 * Plugin Name: Riff Music Player
 * Description: Plays the audio and video in your posts in a player that stays docked at the bottom of the screen, with a full Now Playing view.
 * Version: 4.32.1
 * Requires at least: 7.0
 * Requires PHP: 8.1
 * Plugin URI: https://riffpress.com/
 * Author: RiffPress Core Team
 * Author URI: https://riffpress.com/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: riff
 *
 * @package Riff
 */

defined( 'ABSPATH' ) || exit;

define( 'RIFF_VERSION', '4.32.1' );
define( 'RIFF_FILE', __FILE__ );
define( 'RIFF_DIR', plugin_dir_path( __FILE__ ) );
define( 'RIFF_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	static function ( string $class_name ): void {
		if ( ! str_starts_with( $class_name, 'Riff\\' ) ) {
			return;
		}
		// Riff\Foo is the foundation, in src/. Riff\Listen\Foo is the Listen feature, in features/listen/,
		// which builds on the foundation; the foundation calls into it where the library and player data need it.
		$parts = explode( '\\', substr( $class_name, 5 ) );
		$dir   = 'src/';
		if ( count( $parts ) > 1 && 'Listen' === $parts[0] ) {
			$dir = 'features/listen/';
			array_shift( $parts );
		}
		$name = strtolower( str_replace( '_', '-', implode( '-', $parts ) ) );
		foreach ( array( 'class-', 'interface-' ) as $kind ) {
			$file = RIFF_DIR . $dir . $kind . $name . '.php';
			if ( is_readable( $file ) ) {
				require $file;
				return;
			}
		}
	}
);

add_action( 'plugins_loaded', array( Riff\Plugin::class, 'boot' ) );
