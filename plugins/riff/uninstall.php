<?php
/**
 * Removes what Riff stored: the video-version link on audio files, what the import and the
 * catalogue noted on them, and the album and artist terms. The files, their tags and their
 * featured images are WordPress's own and stay.
 *
 * @package Riff
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

foreach ( array( '_riff_video', '_riff_import_hash', '_riff_import_folder', '_riff_catalog' ) as $riff_key ) {
	delete_post_meta_by_key( $riff_key );
}

global $wpdb;
foreach ( array( 'riff_album', 'riff_artist' ) as $riff_taxonomy ) {
	// The plugin is not loaded here, so the taxonomy is registered just long enough to delete its terms.
	register_taxonomy( $riff_taxonomy, 'attachment' );
	$riff_terms = $wpdb->get_col( $wpdb->prepare( "SELECT term_id FROM {$wpdb->term_taxonomy} WHERE taxonomy = %s", $riff_taxonomy ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- uninstall, once.
	foreach ( $riff_terms as $riff_term ) {
		wp_delete_term( (int) $riff_term, $riff_taxonomy );
	}
}
delete_option( 'riff_catalog_backfill' );
wp_clear_scheduled_hook( 'riff_catalog_backfill' );
