<?php
/**
 * Plugin Name: Audio tags test (Trac #66417)
 * Description: Uploads the tagged audio files in wp-content/audio-tags/ to the Media Library, and shows under Tools › Audio tags what core kept from each file's tags.
 *
 * For testing https://github.com/WordPress/wordpress-develop/pull/15185. Each file was tagged by
 * FFmpeg with every field the table shows: title, artist, album, album artist, date, track
 * number, disc number and lyrics.
 *
 * @package Riff
 */

/**
 * Uploads the test files once, through the same path as an upload in the Media Library.
 */
add_action(
	'admin_init',
	function () {
		if ( get_option( 'audio_tags_test_uploaded' ) || ! current_user_can( 'upload_files' ) ) {
			return;
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		foreach ( glob( WP_CONTENT_DIR . '/audio-tags/*' ) as $file ) {
			// The upload moves the file, so it is given a copy.
			$copy = wp_tempnam( basename( $file ) );
			copy( $file, $copy );
			media_handle_sideload(
				array(
					'name'     => basename( $file ),
					'tmp_name' => $copy,
				),
				0
			);
		}
		update_option( 'audio_tags_test_uploaded', 1 );
	}
);

/**
 * Tools › Audio tags: each audio file, with what core kept from its tags.
 */
add_action(
	'admin_menu',
	function () {
		add_management_page(
			'Audio tags',
			'Audio tags',
			'upload_files',
			'audio-tags',
			function () {
				$keys  = array( 'title', 'artist', 'album', 'band', 'year', 'track_number', 'part_of_a_set', 'unsynchronised_lyric' );
				$files = get_posts(
					array(
						'post_type'      => 'attachment',
						'post_mime_type' => 'audio',
						'numberposts'    => -1,
						'orderby'        => 'ID',
						'order'          => 'ASC',
					)
				);

				echo '<div class="wrap"><h1>Audio tags</h1>';
				printf(
					'<p>WordPress %s. Every file below was tagged with every field in the table. A blank cell is a tag core did not keep.</p>',
					esc_html( get_bloginfo( 'version' ) )
				);
				echo '<table class="widefat striped"><thead><tr><th>File</th>';
				foreach ( $keys as $key ) {
					echo '<th><code>' . esc_html( $key ) . '</code></th>';
				}
				echo '</tr></thead><tbody>';
				foreach ( $files as $file ) {
					$meta = wp_get_attachment_metadata( $file->ID );
					printf(
						'<tr><td><a href="%s">%s</a><br><small>%s</small></td>',
						esc_url( get_edit_post_link( $file->ID ) ),
						esc_html( basename( get_attached_file( $file->ID ) ) ),
						esc_html( $file->post_mime_type )
					);
					foreach ( $keys as $key ) {
						echo '<td>' . esc_html( (string) ( $meta[ $key ] ?? '' ) ) . '</td>';
					}
					echo '</tr>';
				}
				echo '</tbody></table>';
				echo '<p>A file name opens its edit screen, where the Metadata box shows its artist and album.</p></div>';
			}
		);
	}
);
