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
	 * Palettes: background, accent, ink. Riff's amber, and wordpress.org design system tokens for
	 * the rest. Charcoal grounds take full-strength accents; amber grounds charcoal, white and the
	 * lighter accents, with charcoal ink; the light ground the deep colours, with the charcoal
	 * record of Riff's own amber label.
	 */
	private const PALETTES = array(
		array( '#1e1e1e', '#ffb020', '#ffffff' ), // charcoal-1, Riff's amber, white.
		array( '#1e1e1e', '#e26f56', '#ffffff' ), // charcoal-1, pomegrade-1.
		array( '#1e1e1e', '#33f078', '#ffffff' ), // charcoal-1, acid-green-1.
		array( '#1e1e1e', '#fff972', '#ffffff' ), // charcoal-1, lemon-1.
		array( '#1e1e1e', '#d7a7ff', '#ffffff' ), // charcoal-1, purple-3.
		array( '#ffb020', '#1e1e1e', '#1e1e1e' ), // amber, charcoal-1.
		array( '#ffb020', '#ffffff', '#1e1e1e' ), // amber, white.
		array( '#ffb020', '#e26f56', '#1e1e1e' ), // amber, pomegrade-1.
		array( '#ffb020', '#fff972', '#1e1e1e' ), // amber, lemon-1.
		array( '#f6f6f6', '#ffb020', '#1e1e1e' ), // light-grey-2, amber, charcoal-1.
		array( '#f6f6f6', '#e26f56', '#1e1e1e' ), // light-grey-2, pomegrade-1.
		array( '#f6f6f6', '#7a00df', '#1e1e1e' ), // light-grey-2, purple-2.
	);

	/**
	 * The record's own colour on each ground: a step lighter than charcoal, a step deeper than
	 * amber, and charcoal on the light ground.
	 */
	private const DISCS = array(
		'#1e1e1e' => '#40464d', // charcoal-3.
		'#ffb020' => '#d98a00', // deep amber.
		'#f6f6f6' => '#1e1e1e', // charcoal-1.
	);

	/**
	 * Layouts: where the record sits.
	 */
	private const LAYOUTS = array( 'corner', 'centre', 'horizon' );

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
		$palettes = self::palettes();
		$layouts  = self::layouts();
		return self::draw(
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
	 * The palettes, each a list of background, accent and ink.
	 *
	 * @since 4.3.0
	 *
	 * @return array
	 */
	public static function palettes(): array {
		return self::PALETTES;
	}

	/**
	 * The layouts.
	 *
	 * @since 4.3.0
	 *
	 * @return string[]
	 */
	public static function layouts(): array {
		return self::LAYOUTS;
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
		$palettes = self::palettes();
		$layouts  = self::layouts();
		$svg      = self::draw(
			$item,
			$tracks,
			$palettes[ $seed % count( $palettes ) ],
			$layouts[ intdiv( $seed, count( $palettes ) ) % count( $layouts ) ]
		);
		return $svg;
	}

	/**
	 * Draws a cover from an item, its tracks, a palette and a layout.
	 *
	 * @since 4.3.0
	 *
	 * @param array  $item    Library item: title, artist, count, duration, meta.
	 * @param array  $tracks  The tracks, for their lengths and level data.
	 * @param array  $palette Background, accent, ink.
	 * @param string $layout  `corner`, `centre` or `horizon`.
	 * @return string SVG document.
	 */
	public static function draw( array $item, array $tracks, array $palette, string $layout ): string {
		[ $bg, $accent, $ink ] = array_map( 'strval', array_slice( array_values( $palette ), 0, 3 ) );
		$disc                  = self::DISCS[ strtolower( $bg ) ] ?? self::mix( $bg, $ink, 0.18 );
		$meta                  = self::mix( $ink, $bg, 0.3 );

		$title  = (string) ( $item['title'] ?? '' );
		$artist = (string) ( $item['artist'] ?? '' );
		$count  = (int) ( $item['count'] ?? count( $tracks ) );
		$line   = (string) ( $item['meta'] ?? App::meta(
			array_merge(
				array(
					'artist'   => '',
					'count'    => $count,
					'duration' => 0,
				),
				$item
			)
		) );
		if ( $artist && str_starts_with( $line, $artist . ' · ' ) ) {
			$line = substr( $line, strlen( $artist . ' · ' ) );
		}

		switch ( $layout ) {
			case 'centre':
				$record = self::record( 512, 400, 330, $tracks, $disc, $accent, $bg, $ink );
				$text   = self::text( $title, $artist, $line, $count, $ink, $meta, 'bottom' );
				break;
			case 'horizon':
				$record = self::record( 512, 1180, 720, $tracks, $disc, $accent, $bg, $ink );
				$text   = self::text( $title, $artist, $line, $count, $ink, $meta, 'top' );
				break;
			default:
				$record = self::record( 880, 150, 520, $tracks, $disc, $accent, $bg, $ink );
				$text   = self::text( $title, $artist, $line, $count, $ink, $meta, 'bottom' );
		}

		return '<?xml version="1.0" encoding="UTF-8"?>' .
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="' . esc_attr( $title ) . '">' .
			self::fonts() .
			'<rect width="1024" height="1024" fill="' . esc_attr( $bg ) . '"/>' .
			$record .
			$text .
			'</svg>';
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
		foreach ( self::layouts() as $layout ) {
			foreach ( self::palettes() as $palette ) {
				$svg    = self::draw( $item, $tracks, $palette, $layout );
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
	 * The record: the disc, one groove per track, the label and the hole. A groove's width is the
	 * track's share of the album's length, and its line follows the track's level data when the
	 * track carries any, so the music is in the grooves; otherwise it is a quiet, even ring.
	 *
	 * @param float  $cx     Centre x.
	 * @param float  $cy     Centre y.
	 * @param float  $r      Radius.
	 * @param array  $tracks Tracks.
	 * @param string $disc   Disc colour.
	 * @param string $accent Label colour.
	 * @param string $bg     Ground colour, which the hole shows.
	 * @param string $ink    Ink colour, for the grooves.
	 * @return string SVG fragment.
	 */
	private static function record( float $cx, float $cy, float $r, array $tracks, string $disc, string $accent, string $bg, string $ink ): string {
		// A groove is cut into the record, so it reads as the lighter line on a dark disc and the
		// darker on a light one, whatever the ink of the words.
		$ink   = self::luminance( $disc ) < 0.5 ? '#ffffff' : '#1e1e1e';
		$label = $r / 3;
		$hole  = max( 4, $r * 0.024 );
		$out   = sprintf( '<circle cx="%s" cy="%s" r="%s" fill="%s"/>', $cx, $cy, $r, esc_attr( $disc ) );

		$inner = $label + $r * 0.05;
		$outer = $r * 0.95;
		$total = 0.0;
		foreach ( $tracks as $t ) {
			$total += max( 30.0, (float) ( $t['duration'] ?? 0 ) );
		}
		$tracks = array_values( $tracks );
		$n      = count( $tracks );
		$at     = $inner;
		for ( $i = 0; $i < $n; $i++ ) {
			$t     = $tracks[ $i ];
			$share = $total > 0 ? max( 30.0, (float) ( $t['duration'] ?? 0 ) ) / $total : 1 / $n;
			$width = ( $outer - $inner ) * $share;
			$mid   = $at + $width / 2;
			$at   += $width;
			if ( $width < 3 ) {
				continue;
			}
			$levels = isset( $t['levels'] ) && is_string( $t['levels'] ) && strlen( $t['levels'] ) >= 8 ? $t['levels'] : '';
			$weight = max( 1.5, min( 6, $width * 0.22 ) );
			if ( $levels ) {
				$out .= sprintf( '<path class="riff-groove" d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="0.34" stroke-linejoin="round"/>', self::wave( $cx, $cy, $mid, min( ( $width - $weight ) / 2, $r * 0.006 ), $levels ), esc_attr( $ink ), $weight );
			} else {
				$out .= sprintf( '<circle class="riff-groove" cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="0.22"/>', $cx, $cy, round( $mid, 1 ), esc_attr( $ink ), $weight );
			}
		}

		$out .= sprintf( '<circle cx="%s" cy="%s" r="%s" fill="%s"/>', $cx, $cy, $label, esc_attr( $accent ) );
		$out .= sprintf( '<circle cx="%s" cy="%s" r="%s" fill="%s"/>', $cx, $cy, $hole, esc_attr( $bg ) );
		return $out;
	}

	/**
	 * A ring whose radius follows the track's levels around the circle: the waveform wrapped,
	 * each point averaged with its neighbours so it reads as the music's texture, not a tremor.
	 *
	 * @param float  $cx     Centre x.
	 * @param float  $cy     Centre y.
	 * @param float  $r      Mean radius.
	 * @param float  $amp    Largest departure from the mean.
	 * @param string $levels Digits 0 to 9, one per sample.
	 * @return string Path data.
	 */
	private static function wave( float $cx, float $cy, float $r, float $amp, string $levels ): string {
		$n      = strlen( $levels );
		$points = min( 180, max( 60, $n ) );
		$d      = '';
		for ( $i = 0; $i < $points; $i++ ) {
			$at    = (int) floor( $i * $n / $points );
			$digit = ( (int) $levels[ ( $at + $n - 1 ) % $n ] + 2 * (int) $levels[ $at ] + (int) $levels[ ( $at + 1 ) % $n ] ) / 4;
			$rr    = $r + ( $digit / 9 - 0.5 ) * 2 * $amp;
			$a     = 2 * M_PI * $i / $points;
			$d    .= ( 0 === $i ? 'M' : 'L' ) . round( $cx + $rr * cos( $a ), 1 ) . ' ' . round( $cy + $rr * sin( $a ), 1 ) . ' ';
		}
		return $d . 'Z';
	}

	/**
	 * The words: the count as a numeral, the title in Garamond, the artist and the byline in Inter.
	 *
	 * @param string $title  Title.
	 * @param string $artist Artist.
	 * @param string $line   Byline.
	 * @param int    $count  Track count.
	 * @param string $ink    Ink colour.
	 * @param string $meta   Byline colour.
	 * @param string $where  `bottom` or `top`.
	 * @return string SVG fragment.
	 */
	private static function text( string $title, string $artist, string $line, int $count, string $ink, string $meta, string $where ): string {
		$garamond = "'Riff Garamond', 'EB Garamond', Garamond, Georgia, serif";
		$inter    = "'Riff Inter', Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif";
		// The record takes the top right in the horizon layout, so the title breaks sooner there;
		// everywhere a line is sized to clear the right edge at Garamond's width.
		$lines = self::wrap( $title, 'top' === $where ? 14 : 18 );
		$size  = count( $lines ) > 1 ? 72 : (int) max( 56, min( 96, 1700 / max( 1, mb_strlen( $title ) ) ) );
		$lead  = (int) ( $size * 1.02 );
		$ink   = esc_attr( $ink );
		$meta  = esc_attr( $meta );

		$block = count( $lines ) * $lead + ( $artist ? 52 : 0 ) + 44;
		$top   = 'top' === $where ? 96 + $size : 1024 - 72 - $block + $size;
		$y     = $top;
		$out   = '';
		foreach ( $lines as $l ) {
			$out .= sprintf( '<text x="72" y="%d" font-family="%s" font-size="%d" font-weight="400" fill="%s">%s</text>', $y, esc_attr( $garamond ), $size, $ink, esc_html( $l ) );
			$y   += $lead;
		}
		if ( $artist ) {
			$y   += 8;
			$out .= sprintf( '<text x="72" y="%d" font-family="%s" font-size="30" font-weight="500" fill="%s">%s</text>', $y, esc_attr( $inter ), $ink, esc_html( self::clip( $artist, 44 ) ) );
			$y   += 44;
		} else {
			$y += 8;
		}
		$out .= sprintf( '<text x="72" y="%d" font-family="%s" font-size="24" font-weight="500" fill="%s">%s</text>', $y, esc_attr( $inter ), $meta, esc_html( $line ) );

		// The count, as the landing page sets its numbers: Garamond, large, in the corner the record leaves free.
		$numeral = 'top' === $where
			? sprintf( '<text x="952" y="168" text-anchor="end" font-family="%s" font-size="128" font-weight="400" fill="%s">%s</text>', esc_attr( $garamond ), $ink, (int) $count )
			: sprintf( '<text x="72" y="168" font-family="%s" font-size="128" font-weight="400" fill="%s">%s</text>', esc_attr( $garamond ), $ink, (int) $count );
		return $numeral . $out;
	}

	/**
	 * The two fonts, subset to Latin, embedded so the cover is set the same wherever it is shown.
	 * An SVG shown as an image cannot reach the page's fonts.
	 *
	 * @return string A style element, or nothing when the files are not there.
	 */
	private static function fonts(): string {
		static $style = null;
		if ( null !== $style ) {
			return $style;
		}
		$style = '';
		$faces = array(
			'Riff Garamond' => array( 'garamond.woff2', 400 ),
			'Riff Inter'    => array( 'inter.woff2', 500 ),
		);
		foreach ( $faces as $family => [ $file, $weight ] ) {
			$path = RIFF_DIR . 'features/listen/fonts/' . $file;
			if ( ! is_readable( $path ) ) {
				continue;
			}
			$style .= sprintf(
				"@font-face{font-family:'%s';font-weight:%d;src:url(data:font/woff2;base64,%s) format('woff2')}",
				$family,
				$weight,
				base64_encode( (string) file_get_contents( $path ) ) // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a font file of the plugin's own, embedded.
			);
		}
		$style = $style ? '<style>' . $style . '</style>' : '';
		return $style;
	}

	/**
	 * Breaks a title into at most two lines of about so many characters, at a space.
	 *
	 * @param string $text Text.
	 * @param int    $max  Characters per line.
	 * @return string[]
	 */
	private static function wrap( string $text, int $max ): array {
		if ( mb_strlen( $text ) <= $max ) {
			return array( $text );
		}
		$words = explode( ' ', $text );
		$first = '';
		while ( $words && mb_strlen( $first . ' ' . $words[0] ) <= $max ) {
			$first .= ( $first ? ' ' : '' ) . array_shift( $words );
		}
		if ( '' === $first ) {
			$first = array_shift( $words );
		}
		$rest = implode( ' ', $words );
		return $rest ? array( $first, self::clip( $rest, $max ) ) : array( self::clip( $first, $max ) );
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
			$palettes = self::palettes();
			$palette  = $palettes[ crc32( $slug ) % count( $palettes ) ];
			return isset( self::DISCS[ $palette[0] ] ) && '#ffb020' !== $palette[0] ? (string) $palette[1] : (string) $palette[0];
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

	/**
	 * The relative luminance of a hex colour, 0 dark to 1 light.
	 *
	 * @param string $hex Colour.
	 * @return float
	 */
	private static function luminance( string $hex ): float {
		$p = sscanf( ltrim( $hex, '#' ), '%2x%2x%2x' );
		if ( ! $p || in_array( null, $p, true ) ) {
			return 0;
		}
		return ( 0.2126 * $p[0] + 0.7152 * $p[1] + 0.0722 * $p[2] ) / 255;
	}

	/**
	 * Mixes two hex colours.
	 *
	 * @param string $a      First colour.
	 * @param string $b      Second colour.
	 * @param float  $amount How much of the second, 0 to 1.
	 * @return string Hex colour.
	 */
	private static function mix( string $a, string $b, float $amount ): string {
		$pa = sscanf( ltrim( $a, '#' ), '%2x%2x%2x' );
		$pb = sscanf( ltrim( $b, '#' ), '%2x%2x%2x' );
		if ( ! $pa || ! $pb || in_array( null, $pa, true ) || in_array( null, $pb, true ) ) {
			return $a;
		}
		$out = '#';
		for ( $i = 0; $i < 3; $i++ ) {
			$out .= str_pad( dechex( (int) round( $pa[ $i ] * ( 1 - $amount ) + $pb[ $i ] * $amount ) ), 2, '0', STR_PAD_LEFT );
		}
		return $out;
	}
}
