<?php
/**
 * Plugin Name: Riff Sign In codes in the log (local only)
 * Description: The local wp-env site has no mail service, so Riff Sign In's codes are written to the PHP error log instead of mailed. Read them with `npx wp-env logs development`. Mapped as a must-use plugin on the development site only; it is in no zip.
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 *
 * @package Riff
 */

defined( 'ABSPATH' ) || exit;

if ( 'local' !== wp_get_environment_type() ) {
	return;
}

add_action(
	'riff_sign_in_code',
	static function ( string $email, string $code, string $link ): void {
		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- The log is where this site's mail goes.
		error_log( sprintf( 'Riff Sign In: %1$s is the code for %2$s, or sign in with %3$s', $code, $email, $link ) );
	},
	10,
	3
);
add_filter( 'riff_sign_in_send', '__return_false' );
