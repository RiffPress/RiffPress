<?php
/**
 * Plugin Name: Local avatars (local only)
 * Description: A user whose `riff_dev_avatar` meta names one of packages/fixtures/avatars/ has that picture as their avatar, as a local-avatar plugin would give them one, so the site's pictures show the demo's other listeners with faces and no Gravatar. Mapped as a must-use plugin on the development site only; it is in no zip.
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 *
 * @package Riff
 */

defined( 'ABSPATH' ) || exit;

if ( 'local' !== wp_get_environment_type() ) {
	return;
}

add_filter(
	'pre_get_avatar_data',
	static function ( array $args, $id_or_email ): array {
		$user = $id_or_email instanceof WP_User ? $id_or_email : ( is_numeric( $id_or_email ) ? get_userdata( (int) $id_or_email ) : false );
		if ( ! $user instanceof WP_User ) {
			return $args;
		}
		$name = sanitize_file_name( (string) get_user_meta( $user->ID, 'riff_dev_avatar', true ) );
		if ( '' !== $name && is_file( WP_CONTENT_DIR . '/riff/packages/fixtures/avatars/' . $name ) ) {
			$args['url']          = content_url( 'riff/packages/fixtures/avatars/' . $name );
			$args['found_avatar'] = true;
		}
		return $args;
	},
	10,
	2
);
