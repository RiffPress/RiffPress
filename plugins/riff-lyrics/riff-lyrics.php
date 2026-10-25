<?php
/**
 * Plugin Name: Riff Lyrics
 * Description: A Lyrics tab beside Up next in Riff's Now Playing, from the lyrics in your audio files or typed into the Media Library.
 * Version: 1.1.0
 * Requires at least: 7.2
 * Requires PHP: 8.1
 * Requires Plugins: riff
 * Requires Riff: 4.32
 * Plugin URI: https://riffpress.com/
 * Author: RiffPress Core Team
 * Author URI: https://riffpress.com/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: riff-lyrics
 *
 * @package Riff\Lyrics
 */

// Its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-lyrics

defined( 'ABSPATH' ) || exit;

define( 'RIFF_LYRICS_VERSION', '1.1.0' );
define( 'RIFF_LYRICS_URL', plugin_dir_url( __FILE__ ) );

require __DIR__ . '/src/class-lyrics.php';

/*
 * WordPress's Requires Plugins makes Riff a hard dependency but cannot name a version, so the
 * oldest Riff this plugin works with is written once, as Requires Riff above, and checked here: on
 * an older Riff it stays out of the way and tells whoever can update plugins why, rather than
 * half-working. It is the newest @since among the Riff hooks and APIs the plugin uses, which
 * .github/scripts/extension-surface.test.js holds it to.
 */
add_action(
	'plugins_loaded',
	static function (): void {
		$needs = (string) get_file_data( __FILE__, array( 'riff' => 'Requires Riff' ) )['riff'];
		if ( defined( 'RIFF_VERSION' ) && version_compare( RIFF_VERSION, $needs, '>=' ) ) {
			Riff\Lyrics\Lyrics::register();
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
							__( 'Riff Lyrics needs Riff %1$s or newer, and this site has Riff %2$s. Update Riff to use Riff Lyrics.', 'riff-lyrics' ),
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
