<?php
/**
 * Default artwork: a cover drawn for any post with tracks that has no image of its own.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff\Listen;

use WP;
use WP_Post;
use WP_REST_Request;
use WP_Term;

use Riff\Catalog;
use Riff\Library;
use Riff\Player;

defined( 'ABSPATH' ) || exit;

/**
 * Drawn covers.
 *
 * A site's own images always win: the post's featured image, or the file's artwork set in the
 * Media Library. When there is neither, the player draws a cover. Every cover is the same object,
 * a record, and what changes is what the record carries: one groove per track, each as wide as
 * the track is long, textured by the track's own level data when it has any; the title in
 * EB Garamond and the artist in Inter, as wordpress.org sets them; a ground, an accent and a
 * layout chosen from the post's slug, so the same post draws the same cover on any site, through
 * any reseed. The palette is wordpress.org's own. Served by WordPress at ?riff-art={post}, as SVG
 * with the two fonts embedded, so it is sharp at any size and costs nothing to store.
 */
final class Art {

	/**
	 * The query variable that serves a cover.
	 *
	 * @since 4.0.0
	 */
	public const QUERY = 'riff-art';

	/**
	 * The contact sheet, every ground, accent and layout at once, for whoever can edit posts.
	 *
	 * @since 4.3.0
	 */
	public const SHEET = 'sheet';

	/**
	 * Hooks the query variable and the handler.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_filter( 'query_vars', array( self::class, 'query_vars' ) );
		add_action( 'parse_request', array( self::class, 'serve' ) );
		add_filter( 'riff_track', array( self::class, 'track_art' ), 10, 3 );
	}

	/**
	 * A track with no image anywhere gets its post's drawn cover.
	 *
	 * @since 4.0.0
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
	 * @since 4.0.0
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
	 * Whether a track's artwork is one Riff drew, or nothing at all, rather than an image of the
	 * site's own.
	 *
	 * @since 4.32.0
	 *
	 * @param array $art Artwork list, as a track carries it.
	 * @return bool
	 */
	public static function drawn( array $art ): bool {
		$src = $art ? (string) ( end( $art )['src'] ?? '' ) : '';
		if ( '' === $src ) {
			return true;
		}
		parse_str( (string) wp_parse_url( $src, PHP_URL_QUERY ), $query );
		return ! empty( $query[ self::QUERY ] );
	}

	/**
	 * An album's artwork: its first track's own image when it has one, else a cover drawn for the
	 * album itself, with its own name, artist and track count. An album with no image and no
	 * post used to stay a grey square, and one on a post took the post's drawn cover, with the
	 * post's title and count on it.
	 *
	 * @since 4.32.0
	 *
	 * @param int   $term_id The album's term ID.
	 * @param array $art     The first track's artwork as the player shows it.
	 * @return array List of { src, sizes }.
	 */
	public static function album_art( int $term_id, array $art ): array {
		return self::drawn( $art ) ? self::album( $term_id ) : $art;
	}

	/**
	 * The drawn cover of an album, as the artwork list the player reads.
	 *
	 * @since 4.32.0
	 *
	 * @param int $term_id The album's term ID.
	 * @return array List of { src, sizes }.
	 */
	public static function album( int $term_id ): array {
		if ( ! $term_id ) {
			return array();
		}
		return array(
			array(
				'src'   => add_query_arg( self::QUERY, 'album-' . $term_id, home_url( '/' ) ),
				'sizes' => '1024x1024',
				'type'  => 'image/svg+xml',
			),
		);
	}

	/**
	 * Draws the cover for an album: its name, its artist and the tracks the requester may see,
	 * read through the tracks route so a private album stays private. The palette and layout come
	 * from the term's slug, as a post's come from its own.
	 *
	 * @since 4.32.0
	 *
	 * @param int $term_id The album's term ID.
	 * @return string|null SVG document, or null for no album the requester may see.
	 */
	public static function album_svg( int $term_id ): ?string {
		$term = get_term( $term_id, Catalog::ALBUM );
		if ( ! $term instanceof WP_Term ) {
			return null;
		}
		$request = new WP_REST_Request( 'GET', '/' . Library::REST . '/tracks' );
		$request->set_query_params(
			array(
				'album'    => $term_id,
				'per_page' => 100,
			)
		);
		$data   = rest_do_request( $request )->get_data();
		$tracks = is_array( $data['items'] ?? null ) ? $data['items'] : array();
		if ( ! $tracks ) {
			return null;
		}
		$duration = 0.0;
		foreach ( $tracks as $track ) {
			$duration += (float) ( $track['duration'] ?? 0 );
		}
		$item     = array(
			'title'    => html_entity_decode( (string) $term->name, ENT_QUOTES, 'UTF-8' ),
			'artist'   => (string) get_term_meta( $term_id, Catalog::ALBUM_ARTIST, true ),
			'count'    => (int) ( $data['total'] ?? count( $tracks ) ),
			'duration' => $duration,
		);
		$seed     = crc32( (string) $term->slug );
		$palettes = Cover::palettes();
		$layouts  = Cover::layouts();
		return Cover::draw(
			$item,
			$tracks,
			$palettes[ $seed % count( $palettes ) ],
			$layouts[ intdiv( $seed, count( $palettes ) ) % count( $layouts ) ]
		);
	}

	/**
	 * Tells the player where the Listen script is, for pages that hold the block.
	 *
	 * @since 4.0.0
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
	 * @since 4.0.0
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
	 * @since 4.0.0
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public static function url( int $post_id ): string {
		return add_query_arg( self::QUERY, $post_id, home_url( '/' ) );
	}

	/**
	 * The generated cover as the artwork list the player reads.
	 *
	 * @since 4.0.0
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
	 * Serves the cover and stops, before the main query runs. `?riff-art=sheet` serves the contact
	 * sheet to anyone who can edit posts.
	 *
	 * @since 4.0.0
	 * @param WP $wp The request.
	 */
	public static function serve( $wp ): void {
		if ( ! $wp instanceof WP || empty( $wp->query_vars[ self::QUERY ] ) ) {
			return;
		}
		if ( self::SHEET === $wp->query_vars[ self::QUERY ] ) {
			if ( ! current_user_can( 'edit_posts' ) ) {
				status_header( 403 );
				exit;
			}
			status_header( 200 );
			header( 'Content-Type: text/html; charset=utf-8' );
			header( 'Cache-Control: no-store' );
			echo self::sheet(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- an HTML document built here, every value escaped where it is placed.
			exit;
		}
		$svg = null;
		if ( preg_match( '/^album-(\d+)$/', (string) $wp->query_vars[ self::QUERY ], $m ) ) {
			$svg = self::album_svg( (int) $m[1] );
		} else {
			$post = get_post( absint( $wp->query_vars[ self::QUERY ] ) );
			if ( $post instanceof WP_Post && is_post_publicly_viewable( $post ) && ! post_password_required( $post ) ) {
				$svg = self::svg( $post );
			}
		}
		if ( null === $svg ) {
			status_header( 404 );
			exit;
		}
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
	 * Draws the cover for a post: the choices come from its slug, so a post keeps its cover on
	 * any site and through any reseed.
	 *
	 * @since 4.0.0
	 * @param WP_Post $post Post.
	 * @return string SVG document.
	 */
	public static function svg( WP_Post $post ): string {
		$item     = Library::item( $post );
		$tracks   = Library::tracks( $post );
		$seed     = crc32( (string) $post->post_name );
		$palettes = Cover::palettes();
		$layouts  = Cover::layouts();
		$svg      = Cover::draw(
			$item,
			$tracks,
			$palettes[ $seed % count( $palettes ) ],
			$layouts[ intdiv( $seed, count( $palettes ) ) % count( $layouts ) ]
		);
		return $svg;
	}

	/**
	 * The contact sheet: every palette and layout for one sample album, for design review.
	 *
	 * @since 4.3.0
	 *
	 * @return string HTML document.
	 */
	public static function sheet(): string {
		$posts  = Library::query( array( 'posts_per_page' => 1 ) )->posts;
		$post   = $posts ? $posts[0] : null;
		$item   = $post ? Library::item( $post ) : array(
			'title'    => 'Night Sessions',
			'artist'   => 'The Example Quartet',
			'count'    => 9,
			'duration' => 2460,
			'meta'     => '9 tracks · 41 min',
		);
		$tracks = $post ? Library::tracks( $post ) : array_map(
			static fn( $i ) => array( 'duration' => 180 + 37 * $i ),
			range( 1, 9 )
		);
		$cells  = '';
		foreach ( Cover::layouts() as $layout ) {
			foreach ( Cover::palettes() as $palette ) {
				$svg    = Cover::draw( $item, $tracks, $palette, $layout );
				$cells .= '<figure><img src="data:image/svg+xml;base64,' . base64_encode( $svg ) . '" alt="" width="256" height="256"><figcaption>' . esc_html( $layout . ' · ' . implode( ' ', array_slice( array_values( $palette ), 0, 2 ) ) ) . '</figcaption></figure>'; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- an inline image.
			}
		}
		return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' . esc_html__( 'Riff covers', 'riff' ) . '</title>' .
			'<style>body{margin:0;padding:24px;background:#f6f6f6;color:#1e1e1e;font:14px/1.5 Inter,system-ui,sans-serif}' .
			'h1{font:400 32px/1.1 "EB Garamond",Georgia,serif;margin:0 0 16px}' .
			'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(256px,1fr));gap:24px}' .
			'figure{margin:0}img{display:block;width:100%;height:auto;border-radius:2px}figcaption{margin-top:6px;color:#656a71;font-size:12px}</style></head>' .
			'<body><h1>' . esc_html__( 'Every cover Riff can draw', 'riff' ) . '</h1><div class="grid">' . $cells . '</div></body></html>';
	}

	/**
	 * Attachment meta caching an image's tint, worked out once from its pixels.
	 *
	 * @since 4.18.0
	 */
	public const TINT = '_riff_tint';

	/**
	 * The colour an album page tints its header with, from the cover the player shows: a drawn
	 * cover's own colour, or the most colourful shade of an uploaded image, read once and kept
	 * on the image. Empty when there is no cover, or the image cannot be read.
	 *
	 * @since 4.18.0
	 *
	 * @param array $art Artwork, as a track carries it, smallest first.
	 * @return string Hex colour, or empty.
	 */
	public static function tint( array $art ): string {
		$src = $art ? (string) ( end( $art )['src'] ?? '' ) : '';
		if ( '' === $src ) {
			return '';
		}
		parse_str( (string) wp_parse_url( $src, PHP_URL_QUERY ), $query );
		$drawn = (string) ( $query[ self::QUERY ] ?? '' );
		if ( '' !== $drawn ) {
			// The slug the cover was drawn from: a post's, or an album term's.
			if ( preg_match( '/^album-(\d+)$/', $drawn, $m ) ) {
				$term = get_term( (int) $m[1], Catalog::ALBUM );
				$slug = $term instanceof WP_Term ? (string) $term->slug : null;
			} else {
				$post = is_numeric( $drawn ) ? get_post( (int) $drawn ) : null;
				$slug = $post instanceof WP_Post ? (string) $post->post_name : null;
			}
			if ( null === $slug ) {
				return '';
			}
			// A drawn cover's ground, unless it is the neutral charcoal or grey; then its accent.
			$palettes = Cover::palettes();
			$palette  = $palettes[ crc32( $slug ) % count( $palettes ) ];
			return isset( Cover::DISCS[ $palette[0] ] ) && '#ffb020' !== $palette[0] ? (string) $palette[1] : (string) $palette[0];
		}
		$id = attachment_url_to_postid( $src );
		if ( ! $id ) {
			return '';
		}
		$kept = (string) get_post_meta( $id, self::TINT, true );
		if ( '' !== $kept ) {
			return 'none' === $kept ? '' : $kept;
		}
		$tint = self::pixels( $id );
		update_post_meta( $id, self::TINT, '' !== $tint ? $tint : 'none' );
		return $tint;
	}

	/**
	 * The most colourful shade of an image: its pixels averaged, each weighted by how saturated
	 * it is, so a grey border does not wash a red cover out.
	 *
	 * @param int $id Image attachment ID.
	 * @return string Hex colour, or empty.
	 */
	private static function pixels( int $id ): string {
		if ( ! function_exists( 'imagecreatefromstring' ) ) {
			return '';
		}
		// The thumbnail where there is one: small, and already on disk.
		$file  = (string) get_attached_file( $id );
		$thumb = image_get_intermediate_size( $id, 'thumbnail' );
		if ( is_array( $thumb ) && ! empty( $thumb['path'] ) ) {
			$small = trailingslashit( wp_upload_dir( null, false )['basedir'] ) . $thumb['path'];
			$file  = is_readable( $small ) ? $small : $file;
		}
		$data  = is_readable( $file ) ? (string) file_get_contents( $file ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a local image.
		$image = '' !== $data ? @imagecreatefromstring( $data ) : false; // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- an unreadable image has no tint.
		if ( ! $image ) {
			return '';
		}
		$size = 16;
		$grid = imagecreatetruecolor( $size, $size );
		imagecopyresampled( $grid, $image, 0, 0, 0, 0, $size, $size, imagesx( $image ), imagesy( $image ) );
		$sum = array( 0.0, 0.0, 0.0 );
		$all = 0.0;
		for ( $x = 0; $x < $size; $x++ ) {
			for ( $y = 0; $y < $size; $y++ ) {
				$c      = imagecolorat( $grid, $x, $y );
				$rgb    = array( ( $c >> 16 ) & 255, ( $c >> 8 ) & 255, $c & 255 );
				$weight = ( max( $rgb ) - min( $rgb ) ) / 255 + 0.02;
				$weight = $weight * $weight;
				for ( $i = 0; $i < 3; $i++ ) {
					$sum[ $i ] += $rgb[ $i ] * $weight;
				}
				$all += $weight;
			}
		}
		return vsprintf( '#%02x%02x%02x', array_map( static fn( $v ) => (int) round( $v / $all ), $sum ) );
	}
}
