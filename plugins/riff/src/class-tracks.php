<?php
/**
 * Turns attachments and media blocks into the track data the player reads.
 *
 * @since 4.0.0
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
	 * @since 4.0.0
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
				// What WordPress read from the file on upload: the container, the bit rate, whether it is
				// lossless, and for a lossless file its bit depth and sample rate. The player shows them
				// on every track, the way the streaming services do.
				'format'   => strtolower( (string) ( $meta['dataformat'] ?? $meta['fileformat'] ?? '' ) ),
				'bitrate'  => isset( $meta['bitrate'] ) ? (int) round( (float) $meta['bitrate'] / 1000 ) : 0,
				'lossless' => ! empty( $meta['lossless'] ),
				'bits'     => (int) ( $meta['bits_per_sample'] ?? 0 ),
				'rate'     => (int) ( $meta['sample_rate'] ?? 0 ),
				// Level data, when something measured it on upload and stored it as riff_levels.
				'levels'   => isset( $meta['riff_levels'] ) && is_string( $meta['riff_levels'] ) ? $meta['riff_levels'] : '',
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
	 * @since 4.0.0
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
				'format'   => '',
				'bitrate'  => 0,
				'lossless' => false,
				'bits'     => 0,
				'rate'     => 0,
				'levels'   => '',
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
		 * @since 4.0.0
		 *
		 * @param array $track         Track: id, src, type, title, artist, album, duration, art, video, post.
		 * @param int   $attachment_id Attachment ID, or 0 for a file outside the Media Library.
		 * @param int   $post_id       The post the track appears in, or 0.
		 */
		$track = self::normalize( (array) apply_filters( 'riff_track', $track, $attachment_id, $post_id ) );
		return self::gate( $track, $attachment_id, $post_id );
	}

	/**
	 * Locks a track the current visitor may not play: it keeps its title, artist and artwork, so
	 * lists and their counts stay the same, and loses its file and its video, so nothing plays it.
	 *
	 * The address of a locked file still works for anyone who has it, as every upload's does; this
	 * keeps it out of what Riff writes on the page and returns over REST.
	 *
	 * @since 4.17.0
	 *
	 * @param array $track         Track.
	 * @param int   $attachment_id Attachment ID, or 0 for a bare address.
	 * @param int   $post_id       Post ID, or 0.
	 * @return array
	 */
	private static function gate( array $track, int $attachment_id, int $post_id ): array {
		/**
		 * Filters whether the current visitor may play a track.
		 *
		 * A membership or store plugin returns false for a track its rules keep from this visitor.
		 * The track is then listed as locked rather than hidden, with no file to play.
		 *
		 * @since 4.17.0
		 *
		 * @param bool  $allowed       Whether the track plays. Default true.
		 * @param array $track         Track, after riff_track.
		 * @param int   $attachment_id Attachment ID, or 0 for a file outside the Media Library.
		 * @param int   $post_id       The post the track appears in, or 0.
		 */
		if ( (bool) apply_filters( 'riff_can_play', true, $track, $attachment_id, $post_id ) ) {
			return $track;
		}
		/**
		 * Filters where a locked track sends the visitor to unlock it: a sign-up, membership or
		 * checkout page.
		 *
		 * @since 4.17.0
		 *
		 * @param string $url           Address, or empty for none. Default empty.
		 * @param array  $track         Track.
		 * @param int    $attachment_id Attachment ID, or 0.
		 * @param int    $post_id       The post the track appears in, or 0.
		 */
		$unlock          = (string) apply_filters( 'riff_unlock_url', '', $track, $attachment_id, $post_id );
		$track['src']    = '';
		$track['video']  = null;
		$track['locked'] = true;
		$track['unlock'] = esc_url_raw( $unlock );
		return $track;
	}

	/**
	 * The version of the track shape. It changes only with a major release, and every consumer
	 * (REST, GraphQL, the block attribute, riff.js) reads the same shape.
	 *
	 * @since 4.0.0
	 */
	public const SCHEMA_VERSION = 1;

	/**
	 * The track shape as JSON Schema, shared by REST and GraphQL.
	 *
	 * @since 4.0.0
	 *
	 * @return array
	 */
	public static function schema(): array {
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'riff-track',
			'type'       => 'object',
			'properties' => array(
				'id'       => array(
					'type'        => 'string',
					'description' => __( 'The attachment ID, or "url:" and a hash for a file outside the Media Library.', 'riff' ),
				),
				'src'      => array(
					'type'   => 'string',
					'format' => 'uri',
				),
				'type'     => array(
					'type' => 'string',
					'enum' => array( 'audio', 'video' ),
				),
				'title'    => array( 'type' => 'string' ),
				'artist'   => array( 'type' => 'string' ),
				'album'    => array( 'type' => 'string' ),
				'duration' => array(
					'type'        => 'number',
					'description' => __( 'Seconds, 0 when unknown.', 'riff' ),
				),
				'format'   => array(
					'type'        => 'string',
					'description' => __( 'The container, lower case, as WordPress read it from the file: mp3, flac, m4a. Empty when unknown.', 'riff' ),
				),
				'bitrate'  => array(
					'type'        => 'integer',
					'description' => __( 'Kilobits per second, 0 when unknown.', 'riff' ),
				),
				'lossless' => array(
					'type'        => 'boolean',
					'description' => __( 'Whether the encoding is lossless.', 'riff' ),
				),
				'bits'     => array(
					'type'        => 'integer',
					'description' => __( 'Bits per sample, as WordPress read it from the file; 0 when the format does not say, as MP3 does not.', 'riff' ),
				),
				'rate'     => array(
					'type'        => 'integer',
					'description' => __( 'Samples per second, 0 when unknown.', 'riff' ),
				),
				'levels'   => array(
					'type'        => 'string',
					'description' => __( 'The track\'s loudness over time as digits 0 to 9, one per sample, when something has measured it; the drawn cover puts it in the groove. Empty otherwise.', 'riff' ),
				),
				'art'      => array(
					'type'        => 'array',
					'description' => __( 'Artwork, smallest first.', 'riff' ),
					'items'       => array(
						'type'       => 'object',
						'properties' => array(
							'src'   => array( 'type' => 'string' ),
							'sizes' => array( 'type' => 'string' ),
						),
					),
				),
				'video'    => array(
					'type'       => array( 'object', 'null' ),
					'properties' => array(
						'src'    => array( 'type' => 'string' ),
						'poster' => array( 'type' => 'string' ),
					),
				),
				'post'     => array(
					'type'       => array( 'object', 'null' ),
					'properties' => array(
						'id'    => array( 'type' => 'integer' ),
						'title' => array( 'type' => 'string' ),
						'url'   => array( 'type' => 'string' ),
					),
				),
				'locked'   => array(
					'type'        => 'boolean',
					'description' => __( 'Whether the current visitor may not play the track, as riff_can_play decided. A locked track has no src.', 'riff' ),
				),
				'unlock'   => array(
					'type'        => 'string',
					'description' => __( 'Where a locked track sends the visitor to unlock it, from riff_unlock_url. Empty otherwise.', 'riff' ),
				),
			),
		);
	}

	/**
	 * Holds a track to its shape after a filter has had it: every key present with the right type,
	 * extra keys kept for whoever added them. A track that lost its source is returned without one
	 * and the player skips it.
	 *
	 * @since 4.0.0
	 *
	 * @param array $track Track, as filtered.
	 * @return array
	 */
	public static function normalize( array $track ): array {
		$track['id']       = (string) ( $track['id'] ?? '' );
		$track['src']      = is_string( $track['src'] ?? null ) ? $track['src'] : '';
		$track['type']     = 'video' === ( $track['type'] ?? '' ) ? 'video' : 'audio';
		$track['title']    = (string) ( $track['title'] ?? '' );
		$track['artist']   = (string) ( $track['artist'] ?? '' );
		$track['album']    = (string) ( $track['album'] ?? '' );
		$track['duration'] = (float) max( 0, (float) ( $track['duration'] ?? 0 ) );
		$track['format']   = strtolower( (string) ( $track['format'] ?? '' ) );
		$track['bitrate']  = max( 0, (int) ( $track['bitrate'] ?? 0 ) );
		$track['lossless'] = ! empty( $track['lossless'] );
		$track['bits']     = max( 0, (int) ( $track['bits'] ?? 0 ) );
		$track['rate']     = max( 0, (int) ( $track['rate'] ?? 0 ) );
		$track['levels']   = is_string( $track['levels'] ?? null ) ? preg_replace( '/[^0-9]/', '', $track['levels'] ) : '';
		$track['art']      = array_values(
			array_filter(
				(array) ( $track['art'] ?? array() ),
				static fn( $a ) => is_array( $a ) && ! empty( $a['src'] )
			)
		);
		$track['video']    = is_array( $track['video'] ?? null ) && ! empty( $track['video']['src'] ) ? $track['video'] : null;
		$track['post']     = is_array( $track['post'] ?? null ) && ! empty( $track['post']['url'] ) ? $track['post'] : null;
		$track['locked']   = ! empty( $track['locked'] );
		$track['unlock']   = is_string( $track['unlock'] ?? null ) ? $track['unlock'] : '';
		return $track;
	}

	/**
	 * A post's own image. A cover drawn in its place is the Listen feature's, through riff_track.
	 *
	 * @since 4.0.0
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
	 * @since 4.0.0
	 * @param array $block   Parsed block, from parse_blocks().
	 * @param int   $post_id Post ID.
	 * @return array|null
	 */
	public static function from_block( array $block, int $post_id ): ?array {
		$name  = (string) ( $block['blockName'] ?? '' );
		$attrs = (array) ( $block['attrs'] ?? array() );
		if ( 'core/playlist-track' === $name ) {
			// A playlist's track is an attachment by id, with the file's tags copied onto the block
			// when it was picked. The attachment is read, so later edits to its tags and artwork show;
			// a track whose file has since gone is skipped, as core skips it.
			$id = (int) ( $attrs['id'] ?? 0 );
			return $id ? self::from_attachment( $id, $post_id ) : null;
		}
		$type = 'core/video' === $name ? 'video' : 'audio';
		return self::from_markup( (string) ( $block['innerHTML'] ?? '' ), $attrs, $type, $post_id );
	}

	/**
	 * The attachment's title, unless it is still the file's name and the file's own tags know
	 * better. The block editor and the REST API name an upload after its file; only the classic
	 * uploader reads the tags. A title somebody has edited is left alone. With no title anywhere,
	 * the file's name stands in, as the Media Library shows it, so a row is never blank.
	 *
	 * @since 4.0.0
	 * @since 4.32.0 An untitled track is named after its file.
	 * @param int   $attachment_id Attachment ID.
	 * @param array $meta          Attachment metadata, which carries the tags for audio.
	 * @return string
	 */
	private static function title( int $attachment_id, array $meta ): string {
		$title = trim( (string) get_post_field( 'post_title', $attachment_id, 'raw' ) );
		$file  = (string) get_attached_file( $attachment_id );
		if ( '' === $file ) {
			$file = (string) wp_parse_url( (string) wp_get_attachment_url( $attachment_id ), PHP_URL_PATH );
		}
		$stem = $file ? rawurldecode( pathinfo( $file, PATHINFO_FILENAME ) ) : '';
		// Compared loosely: the factory, the editor and a hand upload each punctuate the name differently.
		// Letters and digits in any script: a Cyrillic or Japanese title must not collapse to nothing.
		$named = static fn( string $s ): string => mb_strtolower( (string) preg_replace( '/[^\p{L}\p{N}]+/u', '', (string) preg_replace( '/\.[a-z0-9]{2,4}$/i', '', $s ) ) );
		// A second upload of the same name gets "-1" on the file but not on the title.
		$stems = array_map( $named, array( $stem, (string) preg_replace( '/-\d+$/', '', $stem ) ) );
		if ( ! empty( $meta['title'] ) && is_scalar( $meta['title'] ) && '' !== trim( (string) $meta['title'] ) && ( '' === $title || in_array( $named( $title ), $stems, true ) ) ) {
			$title = trim( (string) $meta['title'] );
		}
		if ( '' === $title ) {
			$title = $stem;
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
			'id'    => $post_id,
			'title' => html_entity_decode( get_the_title( $post_id ), ENT_QUOTES, 'UTF-8' ),
			'url'   => (string) get_permalink( $post_id ),
		);
	}
}
