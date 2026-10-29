<?php
/**
 * Plugin Name: Riff Sign In
 * Description: Listeners sign in to Riff with a passkey, or a code sent to their email, from a sheet inside the player; no passwords, and the music keeps playing.
 * Version: 0.3.0
 * Requires at least: 7.1
 * Requires PHP: 8.1
 * Requires Plugins: riff
 * Requires Riff: 4.31
 * Plugin URI: https://riffpress.com/
 * Author: RiffPress Core Team
 * Author URI: https://riffpress.com/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: riff-sign-in
 *
 * @package Riff\SignIn
 */

// Its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-sign-in

defined( 'ABSPATH' ) || exit;

define( 'RIFF_SIGN_IN_VERSION', '0.3.0' );
define( 'RIFF_SIGN_IN_URL', plugin_dir_url( __FILE__ ) );

require __DIR__ . '/src/class-cbor.php';
require __DIR__ . '/src/class-passkeys.php';
require __DIR__ . '/src/class-codes.php';
require __DIR__ . '/src/class-routes.php';
require __DIR__ . '/src/class-listeners.php';
require __DIR__ . '/src/class-sign-in.php';

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
			Riff\SignIn\Sign_In::register();
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
							__( 'Riff Sign In needs Riff %1$s or newer, and this site has Riff %2$s. Update Riff to use Riff Sign In.', 'riff-sign-in' ),
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
