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
	 * @since 4.12.1 `RiffTrack` is built from the track schema, so it has every property REST has.
	 */
	public static function graphql(): void {
		if ( ! function_exists( 'register_graphql_object_type' ) || ! function_exists( 'register_graphql_field' ) ) {
			return;
		}
		foreach ( self::graphql_types() as $name => $config ) {
			register_graphql_object_type( $name, $config );
		}
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

	/**
	 * The GraphQL object types, built from `Tracks::schema()` so `RiffTrack` has every property the
	 * REST field has and cannot fall behind it. A nested object becomes a type of its own named
	 * after its property, as `art` is `RiffArt`.
	 *
	 * @since 4.12.1
	 *
	 * @return array[] Type configs for register_graphql_object_type(), by name; nested types first.
	 */
	public static function graphql_types(): array {
		$types              = array();
		$fields             = self::graphql_fields( Tracks::schema()['properties'], $types );
		$types['RiffTrack'] = array(
			'description' => __( 'A file as a track the Riff player reads.', 'riff' ),
			'fields'      => $fields,
		);
		return $types;
	}

	/**
	 * GraphQL fields for a JSON schema's properties, adding a type to $types for each nested object.
	 *
	 * @param array $properties JSON schema properties.
	 * @param array $types      Types so far, added to.
	 * @return array[] Fields, by name.
	 */
	private static function graphql_fields( array $properties, array &$types ): array {
		$descriptions = array(
			'art'   => __( 'One size of a track\'s artwork.', 'riff' ),
			'video' => __( 'The video version of an audio track.', 'riff' ),
			'post'  => __( 'The post a track appears in.', 'riff' ),
		);
		$scalars      = array(
			'string'  => 'String',
			'number'  => 'Float',
			'integer' => 'Int',
			'boolean' => 'Boolean',
		);
		$fields       = array();
		foreach ( $properties as $name => $property ) {
			$kinds  = (array) ( $property['type'] ?? 'string' );
			$object = $property['properties'] ?? $property['items']['properties'] ?? null;
			if ( $object ) {
				$type           = 'Riff' . ucfirst( $name );
				$types[ $type ] = array(
					'description' => $descriptions[ $name ] ?? '',
					'fields'      => self::graphql_fields( $object, $types ),
				);
			} else {
				// A list of scalars takes its items' type; a nullable scalar its first.
				$type = $scalars[ $property['items']['type'] ?? $kinds[0] ] ?? 'String';
			}
			$field = array( 'type' => in_array( 'array', $kinds, true ) ? array( 'list_of' => $type ) : $type );
			if ( ! empty( $property['description'] ) ) {
				$field['description'] = $property['description'];
			}
			$fields[ $name ] = $field;
		}
		return $fields;
	}
}
