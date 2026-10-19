<?php
/**
 * Removes what Riff stored: the video-version link on audio files, what the import and the
 * catalogue noted on them, and the album and artist terms. The files, their tags and their
 * featured images are WordPress's own and stay.
 *
 * @package Riff
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

// Protected files go back where they were, and the posts that named them are relinked, so nothing
// points at an address that stops working with the plugin gone.
$riff_base = trailingslashit( wp_upload_dir( null, false )['basedir'] );
foreach ( get_posts(
	array(
		'post_type'      => 'attachment',
		'post_status'    => 'any',
		'posts_per_page' => -1,
		'fields'         => 'ids',
		'meta_key'       => '_riff_protected', // phpcs:ignore WordPress.DB.SlowDBQuery -- uninstall, once.
	)
) as $riff_id ) {
	$riff_file = (string) get_attached_file( $riff_id, true );
	$riff_to   = $riff_base . ltrim( (string) get_post_meta( $riff_id, '_riff_protected', true ), '/' );
	if ( file_exists( $riff_to ) ) {
		$riff_to = dirname( $riff_to ) . '/' . wp_unique_filename( dirname( $riff_to ), basename( $riff_to ) );
	}
	wp_mkdir_p( dirname( $riff_to ) );
	if ( is_file( $riff_file ) && @rename( $riff_file, $riff_to ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename
		update_attached_file( $riff_id, $riff_to );
		$riff_from = add_query_arg( 'riff-file', $riff_id, home_url( '/' ) );
		$riff_url  = (string) wp_get_attachment_url( $riff_id );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- uninstall, once.
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->posts} SET post_content = REPLACE( post_content, %s, %s ) WHERE post_content LIKE %s", $riff_from, $riff_url, '%' . $wpdb->esc_like( $riff_from ) . '%' ) );
	}
}
delete_option( 'riff_protected_dir' );

foreach ( array( '_riff_protected', '_riff_video', '_riff_import_hash', '_riff_import_folder', '_riff_catalog' ) as $riff_key ) {
	delete_post_meta_by_key( $riff_key );
}

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

// Each listener's likes and recently played, and who dismissed the first-run notice: user options, so one key per site's table prefix.
foreach ( array( 'riff_likes', 'riff_history', 'riff_first_run_dismissed' ) as $riff_key ) {
	delete_metadata( 'user', 0, $wpdb->get_blog_prefix() . $riff_key, '', true );
}
