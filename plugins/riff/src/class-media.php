<?php
/**
 * What Riff adds to the Media Library: artwork for an audio or video file, and a video version for
 * an audio file.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff;

use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Attachment fields.
 */
final class Media {

	/**
	 * Post meta on an audio attachment holding the ID of its video version.
	 *
	 * @since 4.0.0
	 */
	public const VIDEO_META = '_riff_video';

	/**
	 * Registers the meta and the Media Library field.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'register_meta' ) );
		add_filter( 'attachment_fields_to_edit', array( self::class, 'fields' ), 10, 2 );
		add_filter( 'attachment_fields_to_save', array( self::class, 'save' ), 10, 2 );
	}

	/**
	 * The video link is readable and writable over REST by anyone who can edit the attachment.
	 *
	 * @since 4.0.0
	 */
	public static function register_meta(): void {
		register_post_meta(
			'attachment',
			self::VIDEO_META,
			array(
				'type'              => 'integer',
				'single'            => true,
				'default'           => 0,
				'show_in_rest'      => true,
				'sanitize_callback' => array( self::class, 'sanitize_video' ),
				'auth_callback'     => static fn( $allowed, $key, $post_id ) => current_user_can( 'edit_post', $post_id ),
			)
		);
	}

	/**
	 * Keeps only IDs of image attachments.
	 *
	 * @since 4.0.0
	 * @param mixed $value Submitted value.
	 * @return int
	 */
	public static function sanitize_image( $value ): int {
		$id = absint( $value );
		return $id && wp_attachment_is_image( $id ) ? $id : 0;
	}

	/**
	 * Keeps only IDs of video attachments.
	 *
	 * @since 4.0.0
	 * @param mixed $value Submitted value.
	 * @return int
	 */
	public static function sanitize_video( $value ): int {
		$id = absint( $value );
		return $id && str_starts_with( (string) get_post_mime_type( $id ), 'video/' ) ? $id : 0;
	}

	/**
	 * Adds "Artwork" to audio and video files in the Media Library, and "Video version" to audio.
	 *
	 * Artwork is the file's featured image, the same thing WordPress sets from a tag inside the file
	 * on upload, so a cover set here shows in the player, the queue and on the lock screen.
	 *
	 * @since 4.0.0
	 * @param array   $fields Attachment fields.
	 * @param WP_Post $post   Attachment.
	 * @return array
	 */
	public static function fields( $fields, $post ) {
		if ( ! $post instanceof WP_Post ) {
			return $fields;
		}
		$mime = (string) $post->post_mime_type;
		if ( ! str_starts_with( $mime, 'audio/' ) && ! str_starts_with( $mime, 'video/' ) ) {
			return $fields;
		}
		$art_id             = (int) get_post_thumbnail_id( $post->ID );
		$fields['riff_art'] = array(
			'label' => __( 'Artwork', 'riff' ),
			'input' => 'text',
			'value' => $art_id ? (string) wp_get_attachment_url( $art_id ) : '',
			'helps' => __( 'The address of an image in the Media Library. Without one, the post\'s featured image is used, and failing that a cover is drawn.', 'riff' ),
		);
		if ( ! str_starts_with( $mime, 'audio/' ) ) {
			return $fields;
		}
		$video_id             = (int) get_post_meta( $post->ID, self::VIDEO_META, true );
		$fields['riff_video'] = array(
			'label' => __( 'Video version', 'riff' ),
			'input' => 'text',
			'value' => $video_id ? (string) wp_get_attachment_url( $video_id ) : '',
			'helps' => __( 'The address of a video in the Media Library. Listeners can switch between the song and the video while it plays.', 'riff' ),
		);
		return $fields;
	}

	/**
	 * Saves the field, accepting a Media Library URL or an attachment ID.
	 *
	 * @since 4.0.0
	 * @param array $post       Attachment data being saved.
	 * @param array $attachment Submitted fields.
	 * @return array
	 */
	public static function save( $post, $attachment ) {
		if ( ! isset( $post['ID'] ) ) {
			return $post;
		}
		if ( isset( $attachment['riff_art'] ) ) {
			$value = trim( (string) $attachment['riff_art'] );
			$id    = ctype_digit( $value ) ? (int) $value : attachment_url_to_postid( esc_url_raw( $value ) );
			$id    = self::sanitize_image( $id );
			if ( $id ) {
				set_post_thumbnail( (int) $post['ID'], $id );
			} else {
				delete_post_thumbnail( (int) $post['ID'] );
			}
		}
		if ( ! isset( $attachment['riff_video'] ) ) {
			return $post;
		}
		$value = trim( (string) $attachment['riff_video'] );
		$id    = ctype_digit( $value ) ? (int) $value : attachment_url_to_postid( esc_url_raw( $value ) );
		$id    = self::sanitize_video( $id );
		if ( $id ) {
			update_post_meta( (int) $post['ID'], self::VIDEO_META, $id );
		} else {
			delete_post_meta( (int) $post['ID'], self::VIDEO_META );
		}
		return $post;
	}
}
