<?php
/**
 * Default artwork: a cover drawn for any post with tracks that has no image of its own.
 *
 * @since 0.1.0
 * @package Riff
 */

namespace Riff\Listen;

use WP;
use WP_Post;

use Riff\Library;
use Riff\Player;
use Riff\Tracks;

defined( 'ABSPATH' ) || exit;

/**
 * Generated covers.
 *
 * A site's own images always win: the post's featured image, or the file's artwork set in the
 * Media Library. When there is neither, the player draws a cover in the style of the demo's: a
 * record in the corner, the track count large, the title and artist beneath. The palette is
 * picked from the post, so every album on a site looks like its own. Served by WordPress itself
 * at ?riff-art={post}, as SVG, so it is sharp at any size and costs nothing to store.
 */
final class Art {

	/**
	 * The query variable that serves a cover.
	 *
	 * @since 0.1.0
	 */
	public const QUERY = 'riff-art';

	/**
	 * Palettes: background, accent, ink.
	 */
	private const PALETTES = array(
		array( '#14213d', '#f4c28f', '#edf0f7' ),
		array( '#1d3b2a', '#f2e8c9', '#f6f3e8' ),
		array( '#3a1b3f', '#e8b954', '#f7eefb' ),
		array( '#7a2e1e', '#f3d5b5', '#fbf1ea' ),
		array( '#0f4c5c', '#ff8a7a', '#eafaf9' ),
		array( '#262626', '#ffb020', '#f5f4f1' ),
		array( '#2b2d6b', '#9ad0ec', '#eef2ff' ),
		array( '#5a1f3e', '#ffd6e0', '#fff0f5' ),
	);

	/**
	 * Hooks the query variable and the handler.
	 *
	 * @since 0.1.0
	 */
	public static function register(): void {
		add_filter( 'query_vars', array( self::class, 'query_vars' ) );
		add_action( 'parse_request', array( self::class, 'serve' ) );
		add_filter( 'riff_track', array( self::class, 'track_art' ), 10, 3 );
		add_filter( 'riff_library_item', array( self::class, 'item_art' ), 10, 2 );
		add_filter( 'riff_player_data', array( self::class, 'player_data' ) );
	}

	/**
	 * A track with no image anywhere gets its post's drawn cover.
	 *
	 * @since 0.1.0
	 * @param array $track         Track.
	 * @param int   $attachment_id Attachment ID, or 0.
	 * @param int   $post_id       Post ID, or 0.
	 * @return array
	 */
	public static function track_art( $track, $attachment_id, $post_id ) {
		if ( is_array( $track ) && empty( $track['art'] ) && $post_id ) {
			$track['art'] = self::art( (int) $post_id );
		}
		return $track;
	}

	/**
	 * A post with no image of its own is listed with its drawn cover.
	 *
	 * @since 0.1.0
	 * @param array   $item Library item.
	 * @param WP_Post $post Post.
	 * @return array
	 */
	public static function item_art( $item, $post ) {
		if ( is_array( $item ) && empty( $item['art'] ) && ! empty( $item['count'] ) && $post instanceof WP_Post ) {
			$item['art'] = self::art( $post->ID );
		}
		return $item;
	}

	/**
	 * Tells the player where the Listen script is, for pages that hold the block.
	 *
	 * @since 0.1.0
	 * @param array $data Player data.
	 * @return array
	 */
	public static function player_data( $data ) {
		$data['assets']['app'] = add_query_arg( 'ver', Player::version( 'features/listen/app.js' ), RIFF_URL . 'features/listen/app.js' );
		return $data;
	}

	/**
	 * Lets WordPress read ?riff-art.
	 *
	 * @since 0.1.0
	 * @param array $vars Public query variables.
	 * @return array
	 */
	public static function query_vars( $vars ) {
		$vars[] = self::QUERY;
		return $vars;
	}

	/**
	 * The address of a post's generated cover.
	 *
	 * @since 0.1.0
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public static function url( int $post_id ): string {
		return add_query_arg( self::QUERY, $post_id, home_url( '/' ) );
	}

	/**
	 * The generated cover as the artwork list the player reads.
	 *
	 * @since 0.1.0
	 * @param int $post_id Post ID.
	 * @return array List of { src, sizes }.
	 */
	public static function art( int $post_id ): array {
		if ( ! $post_id ) {
			return array();
		}
		return array(
			array(
				'src'   => self::url( $post_id ),
				'sizes' => '1024x1024',
				'type'  => 'image/svg+xml',
			),
		);
	}

	/**
	 * Serves the cover and stops, before the main query runs.
	 *
	 * @since 0.1.0
	 * @param WP $wp The request.
	 */
	public static function serve( $wp ): void {
		if ( ! $wp instanceof WP || empty( $wp->query_vars[ self::QUERY ] ) ) {
			return;
		}
		$post = get_post( absint( $wp->query_vars[ self::QUERY ] ) );
		if ( ! $post instanceof WP_Post || ! is_post_publicly_viewable( $post ) || post_password_required( $post ) ) {
			status_header( 404 );
			exit;
		}
		$svg  = self::svg( $post );
		$etag = '"' . md5( $svg ) . '"';
		if ( isset( $_SERVER['HTTP_IF_NONE_MATCH'] ) && trim( sanitize_text_field( wp_unslash( $_SERVER['HTTP_IF_NONE_MATCH'] ) ) ) === $etag ) {
			status_header( 304 );
			exit;
		}
		status_header( 200 );
		header( 'Content-Type: image/svg+xml; charset=utf-8' );
		header( 'Cache-Control: public, max-age=86400' );
		header( 'ETag: ' . $etag );
		echo $svg; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- an SVG document, every text node escaped where it is built.
		exit;
	}

	/**
	 * Draws the cover: a scene, then the title and count over a scrim at the foot.
	 *
	 * @since 0.1.0
	 * @param WP_Post $post Post.
	 * @return string SVG document.
	 */
	public static function svg( WP_Post $post ): string {
		$item = Library::item( $post );
		$seed = crc32( $post->ID . $post->post_name );
		/**
		 * Filters the palettes a drawn cover picks from: lists of background, accent and ink.
		 *
		 * @since 0.1.0
		 * @param array $palettes Palettes.
		 */
		$palettes              = (array) apply_filters( 'riff_art_palettes', self::PALETTES );
		[ $bg, $accent, $ink ] = $palettes[ $seed % max( 1, count( $palettes ) ) ];

		$title = self::clip( $item['title'], 36 );
		$big   = $item['count'] ? (string) $item['count'] : mb_strtoupper( mb_substr( $item['title'], 0, 1 ) );
		// The artist has its own line above; the byline keeps only the count and the length.
		$line = App::meta( $item );
		if ( ! empty( $item['artist'] ) && str_starts_with( $line, $item['artist'] . ' · ' ) ) {
			$line = substr( $line, strlen( $item['artist'] . ' · ' ) );
		}
		$size = (int) max( 44, min( 96, 1500 / max( 1, mb_strlen( $title ) ) ) );
		$font = "Poppins, 'Helvetica Neue', Helvetica, Arial, sans-serif";
		$id   = 'riff-art-' . (int) $post->ID;

		$svg = '<?xml version="1.0" encoding="UTF-8"?>' .
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="' . esc_attr( $item['title'] ) . '">' .
			'<defs><linearGradient id="' . esc_attr( $id ) . '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' . esc_attr( $bg ) . '" stop-opacity="0"/><stop offset="1" stop-color="' . esc_attr( $bg ) . '" stop-opacity="0.92"/></linearGradient></defs>' .
			'<rect width="1024" height="1024" fill="' . esc_attr( $bg ) . '"/>' .
			self::scene( $seed, $bg, $accent, $ink ) .
			'<rect y="560" width="1024" height="464" fill="url(#' . esc_attr( $id ) . ')"/>' .
			'<text x="80" y="236" font-family="' . esc_attr( $font ) . '" font-size="168" font-weight="700" fill="' . esc_attr( $ink ) . '">' . esc_html( $big ) . '</text>' .
			'<rect x="84" y="258" width="104" height="12" fill="' . esc_attr( $accent ) . '"/>' .
			'<text x="80" y="848" font-family="' . esc_attr( $font ) . '" font-size="' . $size . '" font-weight="700" fill="' . esc_attr( $ink ) . '">' . esc_html( $title ) . '</text>' .
			( $item['artist'] ? '<text x="80" y="908" font-family="' . esc_attr( $font ) . '" font-size="32" font-weight="600" fill="' . esc_attr( $ink ) . '">' . esc_html( self::clip( $item['artist'], 48 ) ) . '</text>' : '' ) .
			'<text x="80" y="956" font-family="' . esc_attr( $font ) . '" font-size="26" font-weight="500" fill="' . esc_attr( $ink ) . '" opacity="0.85">' . esc_html( $line ) . '</text>' .
			'</svg>';
		/**
		 * Filters a drawn cover.
		 *
		 * @since 0.1.0
		 * @param string  $svg  SVG document.
		 * @param WP_Post $post Post.
		 */
		return (string) apply_filters( 'riff_art_svg', $svg, $post );
	}

	/**
	 * One of seven scenes, in the palette: a moon over hills, a sunrise over the sea, a skyline,
	 * dunes, a record, mountains, or the classic: a disc in the corner and nothing else. Everything
	 * is drawn from the seed, so a post keeps its cover.
	 *
	 * @param int    $seed   Seed.
	 * @param string $bg     Background colour.
	 * @param string $accent Accent colour.
	 * @param string $ink    Ink colour.
	 * @return string SVG fragment.
	 */
	private static function scene( int $seed, string $bg, string $accent, string $ink ): string {
		$bg     = esc_attr( $bg );
		$accent = esc_attr( $accent );
		$ink    = esc_attr( $ink );
		$rand   = static function () use ( &$seed ): float {
			$seed = ( $seed * 1103515245 + 12345 ) % 2147483648;
			return $seed / 2147483648;
		};
		switch ( intdiv( $seed, 8 ) % 7 ) {
			case 0: // A moon over hills, under stars.
				$stars = '';
				for ( $i = 0; $i < 40; $i++ ) {
					$stars .= sprintf( '<circle cx="%d" cy="%d" r="%s" fill="%s" opacity="%s"/>', (int) ( $rand() * 1024 ), (int) ( $rand() * 520 ), 1.5 + $rand() * 2.5, $ink, 0.4 + $rand() * 0.6 );
				}
				return $stars .
					'<circle cx="760" cy="250" r="140" fill="' . $accent . '"/>' .
					'<circle cx="808" cy="214" r="118" fill="' . $bg . '" opacity="0.28"/>' .
					'<path d="M0 700 C 200 600 330 640 512 690 S 820 640 1024 620 V1024 H0Z" fill="' . $ink . '" opacity="0.1"/>' .
					'<path d="M0 790 C 260 700 420 760 640 780 S 900 740 1024 760 V1024 H0Z" fill="' . $accent . '" opacity="0.28"/>' .
					'<path d="M0 880 C 300 820 600 860 1024 820 V1024 H0Z" fill="' . $ink . '" opacity="0.16"/>';
			case 1: // A sunrise over the sea.
				$rings = '';
				for ( $r = 560; $r >= 200; $r -= 90 ) {
					$rings .= sprintf( '<circle cx="512" cy="640" r="%d" fill="none" stroke="%s" stroke-width="2" opacity="0.18"/>', $r, $accent );
				}
				$bands = '';
				for ( $y = 660; $y < 1024; $y += 44 ) {
					$bands .= sprintf( '<rect x="0" y="%d" width="1024" height="18" fill="%s" opacity="%s"/>', $y, $accent, 0.1 + ( $y - 660 ) / 2400 );
				}
				return $rings .
					'<circle cx="512" cy="640" r="230" fill="' . $accent . '"/>' .
					'<rect x="0" y="640" width="1024" height="384" fill="' . $bg . '"/>' .
					$bands;
			case 2: // A skyline at night.
				$blocks = '';
				for ( $x = 0; $x < 1024; ) {
					$w       = 40 + (int) ( $rand() * 90 );
					$h       = 120 + (int) ( $rand() * 420 );
					$blocks .= sprintf( '<rect x="%d" y="%d" width="%d" height="%d" fill="%s" opacity="0.22"/>', $x, 1024 - $h, $w, $h, $ink );
					for ( $wy = 1024 - $h + 24; $wy < 1000; $wy += 36 ) {
						for ( $wx = $x + 12; $wx < $x + $w - 12; $wx += 24 ) {
							if ( $rand() > 0.55 ) {
								$blocks .= sprintf( '<rect x="%d" y="%d" width="10" height="14" fill="%s" opacity="0.85"/>', $wx, $wy, $accent );
							}
						}
					}
					$x += $w + 8 + (int) ( $rand() * 20 );
				}
				return '<circle cx="820" cy="200" r="110" fill="' . $accent . '"/>' . $blocks;
			case 3: // Dunes under a sun.
				return '<circle cx="300" cy="300" r="150" fill="' . $accent . '"/>' .
					'<path d="M0 640 C 220 520 400 560 560 660 S 860 600 1024 560 V1024 H0Z" fill="' . $accent . '" opacity="0.45"/>' .
					'<path d="M0 760 C 180 700 380 820 600 760 S 880 700 1024 740 V1024 H0Z" fill="' . $accent . '" opacity="0.65"/>' .
					'<path d="M0 880 C 300 840 520 920 760 870 S 960 860 1024 880 V1024 H0Z" fill="' . $ink . '" opacity="0.14"/>';
			case 4: // A record on the turntable.
				$grooves = '';
				for ( $r = 150; $r <= 400; $r += 14 ) {
					$grooves .= sprintf( '<circle cx="640" cy="500" r="%d" fill="none" stroke="%s" stroke-width="1.5" opacity="0.18"/>', $r, $ink );
				}
				return '<circle cx="640" cy="500" r="420" fill="' . $ink . '" opacity="0.1"/>' . $grooves .
					'<circle cx="640" cy="500" r="130" fill="' . $accent . '"/>' .
					'<circle cx="640" cy="500" r="12" fill="' . $bg . '"/>' .
					'<path d="M980 60 L 760 300" stroke="' . $ink . '" stroke-width="10" stroke-linecap="round" opacity="0.5"/>' .
					'<circle cx="980" cy="60" r="30" fill="' . $ink . '" opacity="0.5"/>';
			case 5: // Mountains in mist.
				return '<circle cx="700" cy="260" r="120" fill="' . $accent . '" opacity="0.9"/>' .
					'<path d="M0 760 L 180 520 L 330 700 L 470 440 L 640 720 L 760 560 L 1024 760 V1024 H0Z" fill="' . $ink . '" opacity="0.12"/>' .
					'<path d="M0 860 L 150 680 L 300 820 L 520 600 L 700 840 L 860 700 L 1024 880 V1024 H0Z" fill="' . $accent . '" opacity="0.4"/>' .
					'<rect x="0" y="700" width="1024" height="40" fill="' . $ink . '" opacity="0.08"/>' .
					'<rect x="0" y="790" width="1024" height="26" fill="' . $ink . '" opacity="0.06"/>';
			default: // The classic: a disc in the corner.
				return '<circle cx="880" cy="150" r="300" fill="' . $accent . '"/>' .
					'<circle cx="880" cy="150" r="46" fill="' . $bg . '"/>' .
					'<circle cx="880" cy="150" r="14" fill="' . $ink . '"/>';
		}
	}

	/**
	 * Shortens a line to fit the cover.
	 *
	 * @param string $text Text.
	 * @param int    $max  Characters.
	 * @return string
	 */
	private static function clip( string $text, int $max ): string {
		return mb_strlen( $text ) > $max ? rtrim( mb_substr( $text, 0, $max - 1 ) ) . '…' : $text;
	}
}
