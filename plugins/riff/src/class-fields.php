<?php
/**
 * Riff's fields on a media item, where WordPress 7.2 shows an entity's fields: the Media Library's
 * views and the item's form.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff;

use WP_Post;
use WP_REST_Request;

defined( 'ABSPATH' ) || exit;

/**
 * Entity fields on an attachment.
 *
 * WordPress 7.2's Entity Fields API lets a plugin register fields for an entity once, on the
 * server, and every view and form built on DataViews shows them: the Media Library, the media
 * inserter, the item's own form. Each field reads and writes a property of the REST record, so
 * every one here is also a REST field on `wp/v2/media`, with the same name. The Media Library's
 * older edit screen keeps the fields Media adds to it; these are the same values in the new one.
 */
final class Fields {

	/**
	 * Who registers the fields, as the API asks.
	 */
	public const ORIGIN = 'riff';

	/**
	 * Hooks the REST fields and the entity fields.
	 *
	 * @since 4.33.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'rest_fields' ) );
		add_action( 'wp_entity_fields_api_init', array( self::class, 'entity_fields' ) );
	}

	/**
	 * The fields, keyed by the REST property each reads and writes: the tag fields the file's
	 * metadata holds, the video and the streaming version a song points at, and whether the file
	 * is protected.
	 *
	 * @since 4.33.0
	 *
	 * @return array[] Each with `label`, `type` (a DataViews field type), `description`, `get` and
	 *                 `set` callables taking the attachment, and `applies` taking its mime type.
	 */
	public static function fields(): array {
		$audio = static fn( string $mime ): bool => str_starts_with( $mime, 'audio/' );
		$media = static fn( string $mime ): bool => str_starts_with( $mime, 'audio/' ) || str_starts_with( $mime, 'video/' );
		$tag   = static fn( string $key ) => array(
			'get' => static fn( WP_Post $post ): string => (string) ( self::meta( $post->ID )[ $key ] ?? '' ),
			'set' => static function ( WP_Post $post, $value ) use ( $key ): void {
				$meta         = self::meta( $post->ID );
				$meta[ $key ] = sanitize_text_field( (string) $value );
				if ( '' === $meta[ $key ] ) {
					unset( $meta[ $key ] );
				}
				wp_update_attachment_metadata( $post->ID, $meta );
			},
		);
		return array(
			'riff_artist'    => array(
				'label'       => __( 'Artist', 'riff' ),
				'type'        => 'text',
				'description' => __( 'The artist, from the file\'s tags.', 'riff' ),
				'applies'     => $audio,
			) + $tag( 'artist' ),
			'riff_album'     => array(
				'label'       => __( 'Album', 'riff' ),
				'type'        => 'text',
				'description' => __( 'The album, from the file\'s tags.', 'riff' ),
				'applies'     => $audio,
			) + $tag( 'album' ),
			'riff_video'     => array(
				'label'       => __( 'Video version', 'riff' ),
				'type'        => 'media',
				'description' => __( 'A video in the Media Library for this song; listeners can switch between the two while it plays.', 'riff' ),
				'applies'     => $audio,
				'get'         => static fn( WP_Post $post ): int => (int) get_post_meta( $post->ID, Media::VIDEO_META, true ),
				'set'         => static function ( WP_Post $post, $value ): void {
					if ( ! $value ) {
						delete_post_meta( $post->ID, Media::VIDEO_META );
						return;
					}
					$id = Media::sanitize_video( $value );
					if ( ! $id ) {
						throw new \RuntimeException( esc_html__( 'That is not a video in the Media Library.', 'riff' ) );
					}
					update_post_meta( $post->ID, Media::VIDEO_META, $id );
				},
			),
			'riff_stream'    => array(
				'label'       => __( 'Streaming version', 'riff' ),
				'type'        => 'media',
				'description' => __( 'A smaller copy of this song in the Media Library, such as an MP3 of a lossless file; listeners stream it in this file\'s place.', 'riff' ),
				'applies'     => $audio,
				'get'         => static fn( WP_Post $post ): int => (int) get_post_meta( $post->ID, Media::STREAM_META, true ),
				'set'         => static function ( WP_Post $post, $value ): void {
					$id = $value ? Media::sanitize_stream( $value ) : 0;
					if ( $value && ( ! $id || $id === $post->ID ) ) {
						throw new \RuntimeException( esc_html__( 'That is not another audio file in the Media Library.', 'riff' ) );
					}
					Media::link_stream( $post->ID, $id );
				},
			),
			'riff_protected' => array(
				'label'       => __( 'Protected', 'riff' ),
				'type'        => 'boolean',
				'description' => __( 'Only listeners who may play it can load the file.', 'riff' ),
				'applies'     => $media,
				'get'         => static fn( WP_Post $post ): bool => Protect::is( $post->ID ),
				'set'         => static function ( WP_Post $post, $value ): void {
					$done = rest_sanitize_boolean( $value ) ? Protected_Files::protect( $post->ID ) : Protected_Files::unprotect( $post->ID );
					if ( is_wp_error( $done ) ) {
						throw new \RuntimeException( esc_html( $done->get_error_message() ) );
					}
				},
			),
		);
	}

	/**
	 * Registers each field on `wp/v2/media`, readable by anyone who can see the item and written
	 * by whoever may edit it.
	 *
	 * @since 4.33.0
	 */
	public static function rest_fields(): void {
		foreach ( self::fields() as $name => $field ) {
			register_rest_field(
				'attachment',
				$name,
				array(
					'get_callback'    => static function ( array $item ) use ( $field ) {
						$post = get_post( (int) $item['id'] );
						if ( ! $post instanceof WP_Post || ! $field['applies']( (string) $post->post_mime_type ) ) {
							return null;
						}
						return $field['get']( $post );
					},
					'update_callback' => static function ( $value, WP_Post $post ) use ( $field ) {
						if ( ! $field['applies']( (string) $post->post_mime_type ) ) {
							return new \WP_Error( 'rest_invalid_param', __( 'That field is not for this kind of file.', 'riff' ), array( 'status' => 400 ) );
						}
						if ( ! current_user_can( 'edit_post', $post->ID ) ) {
							return new \WP_Error( 'rest_cannot_edit', __( 'Sorry, you are not allowed to edit this file.', 'riff' ), array( 'status' => rest_authorization_required_code() ) );
						}
						try {
							$field['set']( $post, $value );
						} catch ( \RuntimeException $e ) {
							return new \WP_Error( 'riff_field', $e->getMessage(), array( 'status' => 400 ) );
						}
						return true;
					},
					'schema'          => array(
						'description' => $field['description'],
						'type'        => array( 'media' === $field['type'] ? 'integer' : ( 'boolean' === $field['type'] ? 'boolean' : 'string' ), 'null' ),
						'context'     => array( 'view', 'edit' ),
					),
				)
			);
		}
	}

	/**
	 * Registers the fields for the attachment entity, so the Media Library's views and forms show
	 * them beside core's own. The Entity Fields API is 7.2's; on an older site nothing happens.
	 *
	 * @since 4.33.0
	 */
	public static function entity_fields(): void {
		if ( ! function_exists( 'wp_register_entity_fields' ) ) {
			return;
		}
		$fields = array();
		foreach ( self::fields() as $name => $field ) {
			$fields[] = array(
				'id'            => $name,
				'type'          => $field['type'],
				'label'         => $field['label'],
				'description'   => $field['description'],
				'enableSorting' => false,
				'filterBy'      => false,
			);
		}
		wp_register_entity_fields( self::ORIGIN, 'postType', 'attachment', $fields );
	}

	/**
	 * An attachment's metadata as an array.
	 *
	 * @param int $id Attachment ID.
	 * @return array
	 */
	private static function meta( int $id ): array {
		$meta = wp_get_attachment_metadata( $id );
		return is_array( $meta ) ? $meta : array();
	}
}
