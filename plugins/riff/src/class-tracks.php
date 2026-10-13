<?php
/**
 * Turns attachments and media blocks into the track data the player reads.
 *
 * @package Riff
 */

namespace Riff;

use WP_HTML_Tag_Processor;

defined( 'ABSPATH' ) || exit;

/**
 * Track data.
 *
 * A track is an array with these keys, the same shape the player keeps in its queue:
 * id (string), src, type ('audio' or 'video'), title, artist, album, duration (seconds, 0 when
 * unknown), art (list of { src, sizes }), video ({ src, poster } or null), and post ({ title, url }).
 */
final class Tracks {

	/**
	 * Image sizes offered as artwork, smallest first. The lock screen picks the size it wants.
	 */
	private const ART_SIZES = array( 'thumbnail', 'medium', 'large' );

	/**
	 * Builds a track from an audio or video attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @param int $post_id       The post the track appears in, for artwork fallback and "Playing from".
	 * @return array|null Null when the attachment is not audio or video.
	 */
	public static function from_attachment( int $attachment_id, int $post_id = 0 ): ?array {
		$mime = (string) get_post_mime_type( $attachment_id );
		$type = strtok( $mime, '/' );
		if ( 'audio' !== $type && 'video' !== $type ) {
			return null;
		}
		$src = wp_get_attachment_url( $attachment_id );
		if ( ! $src ) {
			return null;
		}
		$meta = wp_get_attachment_metadata( $attachment_id );
		$meta = is_array( $meta ) ? $meta : array();

		$art = self::art( (int) get_post_thumbnail_id( $attachment_id ) );
		if ( ! $art ) {
			$art = self::post_art( $post_id );
		}

		$video = null;
		if ( 'audio' === $type ) {
			$video_id = (int) get_post_meta( $attachment_id, Media::VIDEO_META, true );
			$video    = $video_id ? self::video( $video_id, $art ) : null;
		}

		return self::filter(
			array(
				'id'       => (string) $attachment_id,
				'src'      => $src,
				'type'     => $type,
				'title'    => self::title( $attachment_id, $meta ),
				'artist'   => isset( $meta['artist'] ) ? (string) $meta['artist'] : '',
				'album'    => isset( $meta['album'] ) ? (string) $meta['album'] : '',
				'duration' => isset( $meta['length'] ) ? (float) $meta['length'] : 0,
				'art'      => $art,
				'video'    => $video,
				'post'     => self::post( $post_id ),
			),
			$attachment_id,
			$post_id
		);
	}

	/**
	 * Builds a track from a file that is not in the Media Library, such as an audio block that
	 * points at another site. All Riff knows is the address, the caption, and the post.
	 *
	 * @param string $src     Media URL.
	 * @param string $type    'audio' or 'video'.
	 * @param string $caption The block's caption, used as the title when there is one.
	 * @param int    $post_id The post the track appears in.
	 * @return array|null
	 */
	public static function from_url( string $src, string $type, string $caption = '', int $post_id = 0 ): ?array {
		$src = esc_url_raw( $src );
		if ( ! $src || ( 'audio' !== $type && 'video' !== $type ) ) {
			return null;
		}
		$title = trim( $caption );
		if ( '' === $title ) {
			$title = rawurldecode( pathinfo( (string) wp_parse_url( $src, PHP_URL_PATH ), PATHINFO_FILENAME ) );
		}
		return self::filter(
			array(
				'id'       => 'url:' . md5( $src ),
				'src'      => $src,
				'type'     => $type,
				'title'    => $title,
				'artist'   => '',
				'album'    => '',
				'duration' => 0,
				'art'      => self::post_art( $post_id ),
				'video'    => null,
				'post'     => self::post( $post_id ),
			),
			0,
			$post_id
		);
	}

	/**
	 * Hands a finished track to the site.
	 *
	 * @param array $track         Track.
	 * @param int   $attachment_id Attachment ID, or 0 for a bare address.
	 * @param int   $post_id       Post ID, or 0.
	 * @return array
	 */
	private static function filter( array $track, int $attachment_id, int $post_id ): array {
		/**
		 * Filters a track before the player reads it.
		 *
		 * @param array $track         Track: id, src, type, title, artist, album, duration, art, video, post.
		 * @param int   $attachment_id Attachment ID, or 0 for a file outside the Media Library.
		 * @param int   $post_id       The post the track appears in, or 0.
		 */
		return (array) apply_filters( 'riff_track', $track, $attachment_id, $post_id );
	}

	/**
	 * A post's own image. A cover drawn in its place is the Listen feature's, through riff_track.
	 *
	 * @param int $post_id Post ID, or 0.
	 * @return array List of { src, sizes }.
	 */
	private static function post_art( int $post_id ): array {
		if ( ! $post_id ) {
			return array();
		}
		return self::art( (int) get_post_thumbnail_id( $post_id ) );
	}

	/**
	 * Reads the track out of a block's markup: its attachment when it has one, the file address
	 * otherwise.
	 *
	 * @param string $html    The block's markup, rendered or as saved.
	 * @param array  $attrs   Block attributes.
	 * @param string $type    'audio' or 'video'.
	 * @param int    $post_id Post ID.
	 * @return array|null
	 */
	public static function from_markup( string $html, array $attrs, string $type, int $post_id ): ?array {
		if ( ! empty( $attrs['id'] ) ) {
			$track = self::from_attachment( (int) $attrs['id'], $post_id );
			if ( $track ) {
				return $track;
			}
		}

		$tags = new WP_HTML_Tag_Processor( $html );
		if ( ! $tags->next_tag( $type ) ) {
			return null;
		}
		$src = $tags->get_attribute( 'src' );
		if ( ! is_string( $src ) || '' === $src ) {
			return null;
		}
		$caption = preg_match( '#<figcaption[^>]*>(.*?)</figcaption>#s', $html, $m ) ? wp_strip_all_tags( $m[1] ) : '';
		return self::from_url( $src, $type, html_entity_decode( $caption, ENT_QUOTES, 'UTF-8' ), $post_id );
	}

	/**
	 * Reads the track out of a parsed block.
	 *
	 * @param array $block   Parsed block, from parse_blocks().
	 * @param int   $post_id Post ID.
	 * @return array|null
	 */
	public static function from_block( array $block, int $post_id ): ?array {
		$type = 'core/video' === ( $block['blockName'] ?? '' ) ? 'video' : 'audio';
		return self::from_markup( (string) ( $block['innerHTML'] ?? '' ), (array) ( $block['attrs'] ?? array() ), $type, $post_id );
	}

	/**
	 * The attachment's title, unless it is still the file's name and the file's own tags know
	 * better. The block editor and the REST API name an upload after its file; only the classic
	 * uploader reads the tags. A title somebody has edited is left alone.
	 *
	 * @param int   $attachment_id Attachment ID.
	 * @param array $meta          Attachment metadata, which carries the tags for audio.
	 * @return string
	 */
	private static function title( int $attachment_id, array $meta ): string {
		$title = (string) get_post_field( 'post_title', $attachment_id, 'raw' );
		$file  = (string) get_attached_file( $attachment_id );
		$stem  = $file ? pathinfo( $file, PATHINFO_FILENAME ) : '';
		// Compared loosely: the factory, the editor and a hand upload each punctuate the name differently.
		$named = static fn( string $s ): string => strtolower( (string) preg_replace( '/[^a-z0-9]+/i', '', (string) preg_replace( '/\.[a-z0-9]{2,4}$/i', '', $s ) ) );
		// A second upload of the same name gets "-1" on the file but not on the title.
		$stems = array_map( $named, array( $stem, (string) preg_replace( '/-\d+$/', '', $stem ) ) );
		if ( ! empty( $meta['title'] ) && ( '' === $title || in_array( $named( $title ), $stems, true ) ) ) {
			$title = (string) $meta['title'];
		}
		return html_entity_decode( $title, ENT_QUOTES, 'UTF-8' );
	}

	/**
	 * The video version of an audio track.
	 *
	 * @param int   $video_id Video attachment ID.
	 * @param array $art      The audio track's artwork, used as the poster when the video has none.
	 * @return array|null
	 */
	private static function video( int $video_id, array $art ): ?array {
		if ( ! str_starts_with( (string) get_post_mime_type( $video_id ), 'video/' ) ) {
			return null;
		}
		$src = wp_get_attachment_url( $video_id );
		if ( ! $src ) {
			return null;
		}
		$poster = self::art( (int) get_post_thumbnail_id( $video_id ) );
		$poster = $poster ? $poster : $art;
		return array(
			'src'    => $src,
			'poster' => $poster ? end( $poster )['src'] : '',
		);
	}

	/**
	 * Artwork in every registered size the image has.
	 *
	 * @param int $image_id Image attachment ID, or 0.
	 * @return array List of { src, sizes }.
	 */
	public static function art( int $image_id ): array {
		if ( ! $image_id ) {
			return array();
		}
		$art  = array();
		$seen = array();
		foreach ( self::ART_SIZES as $size ) {
			$image = wp_get_attachment_image_src( $image_id, $size );
			if ( ! $image || isset( $seen[ $image[0] ] ) ) {
				continue;
			}
			$seen[ $image[0] ] = true;
			$art[]             = array(
				'src'   => $image[0],
				'sizes' => $image[1] . 'x' . $image[2],
			);
		}
		return $art;
	}

	/**
	 * Where a track was found, for "Playing from".
	 *
	 * @param int $post_id Post ID, or 0.
	 * @return array|null
	 */
	private static function post( int $post_id ): ?array {
		if ( ! $post_id ) {
			return null;
		}
		return array(
			'title' => html_entity_decode( get_the_title( $post_id ), ENT_QUOTES, 'UTF-8' ),
			'url'   => (string) get_permalink( $post_id ),
		);
	}
}
