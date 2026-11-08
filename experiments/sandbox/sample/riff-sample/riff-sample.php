<?php
/**
 * Plugin Name: Riff Sample (sandboxed)
 * Description: The sandbox spike's sample extension. When a track is uploaded it reads the track, asks a declared host what the title means, and writes a meta key under its own prefix.
 * Version: 0.0.0
 * Requires Riff: 6.5
 *
 * @package Riff\Sample
 */

add_action(
	'riff_sandbox_uploaded',
	static function ( int $id ): void {
		$track = riff_sandbox_track( $id );
		if ( ! $track ) {
			return;
		}
		$response = wp_remote_get( 'https://api.example.org/tags?title=' . rawurlencode( (string) $track['title'] ) );
		$tags     = is_wp_error( $response ) ? array() : (array) json_decode( wp_remote_retrieve_body( $response ), true );
		update_post_meta( $id, '_riff_sample_tags', implode( ',', $tags ) );
		echo 'tagged ', (int) $id, ': ', implode( ',', $tags );
	}
);
