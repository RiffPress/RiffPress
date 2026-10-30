<?php
/**
 * Removes what Riff stored about the library: the video-version link on audio files, what the
 * import and the catalogue noted on them, the tint taken from each post's cover, and the album
 * and artist terms. The files, their tags
 * and their featured images are WordPress's own and stay. So does what listeners made, their
 * playlists, likes and recently played, which would be cumbersome to make again after a reinstall;
 * Tools > Erase Personal Data deletes one listener's.
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
		$riff_posts = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_content LIKE %s", '%' . $wpdb->esc_like( $riff_from ) . '%' ) );
		foreach ( $riff_posts as $riff_post ) {
			$riff_content = (string) get_post_field( 'post_content', (int) $riff_post, 'raw' );
			// The whole address only, so ?riff-file=12 is not found inside ?riff-file=123.
			$riff_updated = (string) preg_replace( '/' . preg_quote( $riff_from, '/' ) . '(?![0-9])/', addcslashes( $riff_url, '\\$' ), $riff_content );
			if ( $riff_updated !== $riff_content ) {
				$wpdb->update( $wpdb->posts, array( 'post_content' => $riff_updated ), array( 'ID' => (int) $riff_post ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- uninstall, once.
				clean_post_cache( (int) $riff_post );
			}
		}
	}
}
delete_option( 'riff_protected_dir' );

foreach ( array( '_riff_protected', '_riff_video', '_riff_import_hash', '_riff_import_folder', '_riff_catalog', '_riff_tint' ) as $riff_key ) {
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
// The drawn covers kept in uploads, drawn again by nothing once Riff is gone.
foreach ( (array) glob( $riff_base . 'riff-art/*', GLOB_ONLYDIR ) as $riff_dir ) {
	array_map( 'wp_delete_file', (array) glob( $riff_dir . '/*' ) );
	@rmdir( $riff_dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- uninstall, once.
}
@rmdir( $riff_base . 'riff-art' ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- uninstall, once.
delete_option( 'riff_art_stamp' );
delete_option( 'riff_art_changed' );
delete_option( 'riff_catalog_backfill' );
delete_option( 'riff_catalog_backfill_from' );
delete_option( 'riff_rewrite' );
wp_clear_scheduled_hook( 'riff_catalog_backfill' );

// Who dismissed the first-run notice: a user option, so its key carries the site's table prefix.
delete_metadata( 'user', 0, $wpdb->get_blog_prefix() . 'riff_first_run_dismissed', '', true );
