<?php
/**
 * Plugin Name: Mail to Mailpit (local only)
 * Description: The local wp-env site's mail goes to the Mailpit that `npm run mail` starts on this computer, and is read at http://localhost:8025. Nothing leaves the computer. With Mailpit stopped, mail fails quietly. Mapped as a must-use plugin on the development site only; it is in no zip.
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
	'phpmailer_init',
	static function ( $mailer ): void {
		$mailer->isSMTP();
		// phpcs:disable WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- PHPMailer's names.
		$mailer->Host        = 'host.docker.internal';
		$mailer->Port        = 1025;
		$mailer->SMTPAuth    = false;
		$mailer->SMTPAutoTLS = false;
		// phpcs:enable WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
	}
);

// WordPress's own default here, wordpress@localhost, is not an address PHPMailer accepts.
add_filter(
	'wp_mail_from',
	static fn(): string => 'wordpress@example.test'
);
