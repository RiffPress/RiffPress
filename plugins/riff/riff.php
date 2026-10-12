<?php
/**
 * Plugin Name: Riff
 * Description: Plays the audio and video in your posts in a player that stays docked at the bottom of the screen, with a full Now Playing view.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Plugin URI: https://riffpress.github.io/riffpress/
 * Author: Joe Fusco
 * Author URI: https://josephfus.co/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: riff
 * Domain Path: /languages
 *
 * @package Riff
 */

defined( 'ABSPATH' ) || exit;

define( 'RIFF_VERSION', '0.1.0' );
define( 'RIFF_FILE', __FILE__ );
define( 'RIFF_DIR', plugin_dir_path( __FILE__ ) );
define( 'RIFF_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	static function ( string $class_name ): void {
		if ( ! str_starts_with( $class_name, 'Riff\\' ) ) {
			return;
		}
		$file = RIFF_DIR . 'src/class-' . strtolower( str_replace( '_', '-', substr( $class_name, 5 ) ) ) . '.php';
		if ( is_readable( $file ) ) {
			require $file;
		}
	}
);

add_action( 'plugins_loaded', array( Riff\Plugin::class, 'boot' ) );
