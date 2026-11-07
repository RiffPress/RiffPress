<?php
/**
 * Plugin Name: Riff Chords
 * Description: A Chords view in Riff's Now Playing: a chord chart that follows the song, with its fingerings, and practice controls to slow it down, loop a part, transpose and set a capo.
 * Version: 0.5.0
 * Requires at least: 7.1
 * Requires PHP: 8.1
 * Requires Plugins: riff
 * Requires Riff: 5.9
 * Plugin URI: https://riffpress.com/
 * Author: RiffPress Core Team
 * Author URI: https://riffpress.com/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: riff-chords
 *
 * @package Riff\Chords
 */

// Its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-chords

defined( 'ABSPATH' ) || exit;

define( 'RIFF_CHORDS_VERSION', '0.5.0' );
define( 'RIFF_CHORDS_URL', plugin_dir_url( __FILE__ ) );

require __DIR__ . '/src/class-chords.php';

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
			Riff\Chords\Chords::register();
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
							__( 'Riff Chords needs Riff %1$s or newer, and this site has Riff %2$s. Update Riff to use Riff Chords.', 'riff-chords' ),
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
