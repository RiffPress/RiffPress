<?php
/**
 * Plugin Name: Riff Sing (Experimental)
 * Description: Experimental. A Sing view in Riff's Now Playing: sing along with the song's melody, from a microphone or a MIDI instrument, and hear how close you came. Your voice never leaves the browser.
 * Version: 0.6.0
 * Requires at least: 7.1
 * Requires PHP: 8.1
 * Requires Plugins: riff
 * Requires Riff: 5.8
 * Plugin URI: https://developer.riffpress.com/
 * Author: RiffPress Core Team
 * Author URI: https://riffpress.com/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: riff-sing
 *
 * @package Riff\Sing
 */

// Its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-sing

defined( 'ABSPATH' ) || exit;

define( 'RIFF_SING_VERSION', '0.6.0' );
define( 'RIFF_SING_URL', plugin_dir_url( __FILE__ ) );

require __DIR__ . '/src/class-sing.php';

/*
 * WordPress's Requires Plugins makes Riff a hard dependency but cannot name a version, so the
 * oldest Riff this plugin works with is written once, as Requires Riff above, and checked here: on
 * an older Riff it stays out of the way and tells whoever can update plugins why, rather than
 * half-working. It is the newest @since among the Riff hooks and APIs the plugin uses, which
 * .github/scripts/extension-surface.test.js holds it to. A local or development site runs ahead of
 * the last release, Riff's version moving only when it is released, so there it is not held back.
 */
add_action(
	'plugins_loaded',
	static function (): void {
		$needs = (string) get_file_data( __FILE__, array( 'riff' => 'Requires Riff' ) )['riff'];
		$ahead = in_array( wp_get_environment_type(), array( 'local', 'development' ), true );
		if ( defined( 'RIFF_VERSION' ) && ( $ahead || version_compare( RIFF_VERSION, $needs, '>=' ) ) ) {
			Riff\Sing\Sing::register();
			return;
		}
		add_action(
			'admin_notices',
			static function () use ( $needs ): void {
				if ( ! current_user_can( 'update_plugins' ) ) {
					return;
				}
				printf(
					'<div class="notice notice-warning"><p>%s</p></div>',
					esc_html(
						sprintf(
							/* translators: 1: the version Riff needs to be, 2: the version it is. */
							__( 'Riff Sing needs Riff %1$s or newer, and this site has Riff %2$s. Update Riff to use Riff Sing.', 'riff-sing' ),
							$needs,
							defined( 'RIFF_VERSION' ) ? RIFF_VERSION : '?'
						)
					)
				);
			}
		);
	},
	5
);

// PHPCS keeps a phpcs:set for the files after this one, so the domain goes back to Riff's here.
// phpcs:set WordPress.WP.I18n text_domain[] riff
