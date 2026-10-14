<?php
/**
 * The track on every audio and video file, for anything that reads the Media Library: the REST
 * API, and WPGraphQL where it is installed.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff;

use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Media Library API.
 *
 * WordPress already reads the tags out of an uploaded file (title, artist, album, length) and
 * keeps them in the attachment's metadata, but nothing exposes them as one thing a player can
 * use. Riff does: the same track shape its player reads, with the artwork resolved and the video
 * version attached, on every audio and video attachment in `wp/v2/media`, and on every
 * `MediaItem` in WPGraphQL.
 */
final class Api {

	/**
	 * Hooks the REST field and, when WPGraphQL is active, the GraphQL types.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'rest_field' ) );
		add_action( 'graphql_register_types', array( self::class, 'graphql' ) );
	}

	/**
	 * Adds `riff_track` to audio and video items in wp/v2/media.
	 *
	 * @since 4.0.0
	 */
	public static function rest_field(): void {
		register_rest_field(
			'attachment',
			'riff_track',
			array(
				'get_callback' => static function ( array $item ): ?array {
					$id = (int) $item['id'];
					return Tracks::from_attachment( $id, (int) get_post_field( 'post_parent', $id ) );
				},
				'schema'       => self::track_schema(),
			)
		);
	}

	/**
	 * The schema of the REST field: the track shape, nullable, read only.
	 *
	 * @since 4.0.0
	 *
	 * @return array JSON Schema.
	 */
	public static function track_schema(): array {
		$schema = Tracks::schema();
		unset( $schema['$schema'], $schema['title'] );
		$schema['description'] = __( 'The file as a track the player reads; null for files that are not audio or video.', 'riff' );
		$schema['type']        = array( 'object', 'null' );
		$schema['context']     = array( 'view', 'edit', 'embed' );
		$schema['readonly']    = true;
		return $schema;
	}

	/**
	 * WPGraphQL: a `RiffTrack` type, `riffTrack` on every MediaItem, and `riffTracks` on every post.
	 * Runs only when WPGraphQL has loaded, since the action is its own.
	 *
	 * @since 4.0.0
	 */
	public static function graphql(): void {
		if ( ! function_exists( 'register_graphql_object_type' ) || ! function_exists( 'register_graphql_field' ) ) {
			return;
		}
		register_graphql_object_type(
			'RiffArt',
			array(
				'description' => __( 'One size of a track\'s artwork.', 'riff' ),
				'fields'      => array(
					'src'   => array( 'type' => 'String' ),
					'sizes' => array( 'type' => 'String' ),
				),
			)
		);
		register_graphql_object_type(
			'RiffVideo',
			array(
				'description' => __( 'The video version of an audio track.', 'riff' ),
				'fields'      => array(
					'src'    => array( 'type' => 'String' ),
					'poster' => array( 'type' => 'String' ),
				),
			)
		);
		register_graphql_object_type(
			'RiffTrack',
			array(
				'description' => __( 'A file as a track the Riff player reads.', 'riff' ),
				'fields'      => array(
					'id'       => array( 'type' => 'String' ),
					'src'      => array( 'type' => 'String' ),
					'type'     => array( 'type' => 'String' ),
					'title'    => array( 'type' => 'String' ),
					'artist'   => array( 'type' => 'String' ),
					'album'    => array( 'type' => 'String' ),
					'duration' => array( 'type' => 'Float' ),
					'art'      => array( 'type' => array( 'list_of' => 'RiffArt' ) ),
					'video'    => array( 'type' => 'RiffVideo' ),
				),
			)
		);
		register_graphql_field(
			'MediaItem',
			'riffTrack',
			array(
				'type'        => 'RiffTrack',
				'description' => __( 'The file as a track, for audio and video.', 'riff' ),
				'resolve'     => static function ( $item ): ?array {
					$id = (int) ( $item->databaseId ?? 0 ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- WPGraphQL's own property.
					return $id ? Tracks::from_attachment( $id, (int) get_post_field( 'post_parent', $id ) ) : null;
				},
			)
		);
		register_graphql_field(
			'Post',
			'riffTracks',
			array(
				'type'        => array( 'list_of' => 'RiffTrack' ),
				'description' => __( 'The tracks in the post, in order.', 'riff' ),
				'resolve'     => static function ( $post ): array {
					$object = get_post( (int) ( $post->databaseId ?? 0 ) ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- WPGraphQL's own property.
					if ( ! $object instanceof WP_Post || ! is_post_publicly_viewable( $object ) || post_password_required( $object ) ) {
						return array();
					}
					return Library::tracks( $object );
				},
			)
		);
	}
}
