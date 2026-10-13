<?php
/**
 * A source for the tests: a "mixtape" post type whose tracks are attachment IDs in post meta.
 *
 * @package Riff
 */

use Riff\Source;
use Riff\Tracks;

/**
 * A source for a "mixtape" post type whose tracks are attachment IDs in post meta.
 */
class Riff_Test_Mixtape_Source implements Source {

	public function id(): string {
		return 'mixtape';
	}

	public function supports( WP_Post $post ): bool {
		return 'mixtape' === $post->post_type;
	}

	public function tracks( WP_Post $post ): array {
		$tracks = array();
		foreach ( (array) get_post_meta( $post->ID, 'mixtape_tracks', true ) as $id ) {
			$track = Tracks::from_attachment( (int) $id, $post->ID );
			if ( $track ) {
				$tracks[] = $track;
			}
		}
		return $tracks;
	}

	public function html( WP_Post $post ): string {
		$html = '';
		foreach ( $this->tracks( $post ) as $track ) {
			$html .= '<figure class="riff-track" data-riff-track="' . esc_attr( wp_json_encode( $track ) ) . '"></figure>';
		}
		return $html;
	}

	public function where(): string {
		global $wpdb;
		return $wpdb->prepare( "{$wpdb->posts}.post_type = %s", 'mixtape' ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}
}
