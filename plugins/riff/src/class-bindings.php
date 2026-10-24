<?php
/**
 * A Block Bindings source, so core blocks can show a track's details.
 *
 * @since 4.32.0
 * @package Riff
 */

namespace Riff;

use WP_Block;

defined( 'ABSPATH' ) || exit;

/**
 * The `riff/track` source.
 *
 * A Heading or Paragraph bound to it shows a track's title, artist, album, year, duration or
 * quality, and an Image bound to it shows the cover, with no Riff block on the page: a site
 * builder lays an album page out of core blocks, and the details still come from the files in
 * the Media Library. The binding names its track by attachment ID, or takes the post's first
 * track when it names none. Every value but the year is read from the same track the REST API
 * and the player see, after the `riff_track` filter; the year is the file's year tag, which the
 * track does not carry.
 *
 * ```
 * <!-- wp:heading {"metadata":{"bindings":{"content":{"source":"riff/track","args":{"key":"title","id":123}}}}} -->
 * <h2 class="wp-block-heading"></h2>
 * <!-- /wp:heading -->
 * ```
 *
 * In the editor a bound value is read only, as core's post meta source is.
 */
final class Bindings {

	/**
	 * The source's name.
	 *
	 * @since 4.32.0
	 */
	public const SOURCE = 'riff/track';

	/**
	 * Hooks the source.
	 *
	 * @since 4.32.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'source' ) );
	}

	/**
	 * The keys a binding can ask for, each with what it shows.
	 *
	 * @since 4.32.0
	 *
	 * @return string[] Descriptions keyed by key.
	 */
	public static function keys(): array {
		return array(
			'title'    => __( 'The track’s title.', 'riff' ),
			'artist'   => __( 'The artist.', 'riff' ),
			'album'    => __( 'The album.', 'riff' ),
			'year'     => __( 'The year from the file’s tags, or nothing.', 'riff' ),
			'duration' => __( 'The length as the player shows it, such as 4:32, or nothing when unknown.', 'riff' ),
			'quality'  => __( 'The format and rate as the player’s badge shows them, such as MP3 · 128 kbps or FLAC · 24-bit 96 kHz.', 'riff' ),
			'cover'    => __( 'The address of the largest artwork: the file’s own, else its post’s, else the cover Riff draws. For an Image block’s url.', 'riff' ),
		);
	}

	/**
	 * Registers `riff/track` with WordPress, where the Block Bindings API exists.
	 *
	 * @since 4.32.0
	 */
	public static function source(): void {
		if ( ! function_exists( 'register_block_bindings_source' ) ) {
			return;
		}
		register_block_bindings_source(
			self::SOURCE,
			array(
				'label'              => __( 'Riff track', 'riff' ),
				'get_value_callback' => array( self::class, 'value' ),
				'uses_context'       => array( 'postId' ),
			)
		);
	}

	/**
	 * The value for a bound attribute: the key's detail of the track the binding names, or of
	 * the post's first track.
	 *
	 * @since 4.32.0
	 *
	 * @param array    $args      The binding's arguments: `key`, and `id` for an attachment.
	 * @param WP_Block $block     The block being rendered.
	 * @param string   $attribute The attribute being filled.
	 * @return string|null The value, or null for a key or a track there is none of.
	 */
	public static function value( array $args, $block, string $attribute ): ?string {
		unset( $attribute );
		$key = (string) ( $args['key'] ?? 'title' );
		if ( ! array_key_exists( $key, self::keys() ) ) {
			return null;
		}
		$post_id = (int) ( $block instanceof WP_Block ? ( $block->context['postId'] ?? 0 ) : 0 );
		if ( ! $post_id ) {
			$post_id = (int) get_the_ID();
		}
		$track = self::track( (int) ( $args['id'] ?? 0 ), $post_id );
		if ( ! $track ) {
			return null;
		}
		$value = self::field( $track, $key );
		return '' === $value ? null : $value;
	}

	/**
	 * The track a binding names: the attachment, read as the post's track so a locked one stays
	 * locked, or the post's first track when no attachment is named.
	 *
	 * @since 4.32.0
	 *
	 * @param int $attachment_id Attachment ID, or 0.
	 * @param int $post_id       The post, or 0.
	 * @return array|null The track, or null.
	 */
	public static function track( int $attachment_id, int $post_id ): ?array {
		if ( $attachment_id ) {
			return Tracks::from_attachment( $attachment_id, $post_id );
		}
		$post = $post_id ? get_post( $post_id ) : null;
		if ( ! $post ) {
			return null;
		}
		$tracks = Library::tracks( $post );
		return $tracks ? $tracks[0] : null;
	}

	/**
	 * One detail of a track as text.
	 *
	 * @since 4.32.0
	 *
	 * @param array  $track The track.
	 * @param string $key   One of keys().
	 * @return string The detail, or an empty string.
	 */
	public static function field( array $track, string $key ): string {
		switch ( $key ) {
			case 'title':
			case 'artist':
			case 'album':
				return (string) ( $track[ $key ] ?? '' );
			case 'year':
				$id   = (int) ( $track['id'] ?? 0 );
				$meta = $id ? wp_get_attachment_metadata( $id ) : null;
				return is_array( $meta ) && ! empty( $meta['year'] ) ? (string) (int) $meta['year'] : '';
			case 'duration':
				return self::duration( (float) ( $track['duration'] ?? 0 ) );
			case 'quality':
				return self::quality( $track );
			case 'cover':
				$art = (array) ( $track['art'] ?? array() );
				return $art ? (string) ( end( $art )['src'] ?? '' ) : '';
		}
		return '';
	}

	/**
	 * A length as the player shows it: m:ss, or h:mm:ss past an hour.
	 *
	 * @since 4.32.0
	 *
	 * @param float $seconds Seconds.
	 * @return string The length, or an empty string for none.
	 */
	public static function duration( float $seconds ): string {
		$total = (int) round( $seconds );
		if ( $total <= 0 ) {
			return '';
		}
		$h = intdiv( $total, 3600 );
		$m = intdiv( $total % 3600, 60 );
		$s = $total % 60;
		return $h ? sprintf( '%d:%02d:%02d', $h, $m, $s ) : sprintf( '%d:%02d', $m, $s );
	}

	/**
	 * The format and rate as the player's badge shows them, from the same words.
	 *
	 * @since 4.32.0
	 *
	 * @param array $track The track.
	 * @return string Such as `MP3 · 128 kbps`, or an empty string when the file told nothing.
	 */
	public static function quality( array $track ): string {
		$format = strtoupper( (string) ( $track['format'] ?? '' ) );
		$rate   = '';
		if ( ! empty( $track['lossless'] ) ) {
			if ( ! empty( $track['bits'] ) && ! empty( $track['rate'] ) ) {
				/* translators: 1: bits per sample, 2: sample rate in kHz. */
				$rate = sprintf( __( '%1$s-bit %2$s kHz', 'riff' ), (int) $track['bits'], rtrim( rtrim( number_format( (float) $track['rate'] / 1000, 1, '.', '' ), '0' ), '.' ) );
			} else {
				$rate = __( 'Lossless', 'riff' );
			}
		} elseif ( ! empty( $track['bitrate'] ) ) {
			/* translators: %s: kilobits per second. */
			$rate = sprintf( __( '%s kbps', 'riff' ), (int) $track['bitrate'] );
		}
		if ( '' === $format ) {
			return $rate;
		}
		return '' === $rate ? $format : $format . ' · ' . $rate;
	}
}
