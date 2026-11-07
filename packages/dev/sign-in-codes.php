<?php
/**
 * Plugin Name: Riff Sign In codes in the log (local only)
 * Description: Riff Sign In's codes are also written to the PHP error log, for working without Mailpit (see local-mail.php). Read them with `npx wp-env logs development`. Mapped as a must-use plugin on the development site only; it is in no zip.
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
		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- The fallback when Mailpit isn't running.
		error_log( sprintf( 'Riff Sign In: %1$s is the code for %2$s, or sign in with %3$s', $code, $email, $link ) );
	},
	10,
	3
);
