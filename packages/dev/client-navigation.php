<?php
/**
 * Plugin Name: Riff client navigation (local only, spike)
 * Description: Turns on riff_client_navigation where the riff_spike_client_navigation option is set, so the spike can be tried and compared on one site: `npx wp-env run cli wp option update riff_spike_client_navigation 1`.
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
	'riff_client_navigation',
	static fn( $on ) => $on || (bool) get_option( 'riff_spike_client_navigation' )
);
