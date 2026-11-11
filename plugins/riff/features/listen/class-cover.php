<?php
/**
 * Drawing a cover.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Library;

defined( 'ABSPATH' ) || exit;

/**
 * The cover Riff draws for an album with no image: side A of its record, a band of grooves for each
 * track, as long as the track and lighter where the music is loud,
 * in one of the palettes and layouts, chosen from the album's slug. Pure drawing: Art decides
 * when a cover is drawn and serves it.
 */
final class Cover {

	/**
	 * Palettes: background, accent, ink, all wordpress.org design system tokens. Not Riff's ivory:
	 * that is the player's own colour, kept for what you press, as Play, so a cover never looks
	 * like a button. Charcoal grounds take full-strength accents; blueberry grounds white, charcoal
	 * and the lighter accents, with white ink; the light ground the deep colours, with charcoal ink.
	 */
	private const PALETTES = array(
		array( '#1e1e1e', '#3858e9', '#ffffff' ), // charcoal-1, blueberry-1, white.
		array( '#1e1e1e', '#e26f56', '#ffffff' ), // charcoal-1, pomegrade-1.
		array( '#1e1e1e', '#33f078', '#ffffff' ), // charcoal-1, acid-green-1.
		array( '#1e1e1e', '#fff972', '#ffffff' ), // charcoal-1, lemon-1.
		array( '#1e1e1e', '#d7a7ff', '#ffffff' ), // charcoal-1, purple-3.
		array( '#3858e9', '#1e1e1e', '#ffffff' ), // blueberry-1, charcoal-1.
		array( '#3858e9', '#ffffff', '#ffffff' ), // blueberry-1, white.
		array( '#3858e9', '#33f078', '#ffffff' ), // blueberry-1, acid-green-1.
		array( '#3858e9', '#fff972', '#ffffff' ), // blueberry-1, lemon-1.
		array( '#f6f6f6', '#3858e9', '#1e1e1e' ), // light-grey-2, blueberry-1, charcoal-1.
		array( '#f6f6f6', '#e26f56', '#1e1e1e' ), // light-grey-2, pomegrade-1.
		array( '#f6f6f6', '#7a00df', '#1e1e1e' ), // light-grey-2, purple-2.
	);

	/**
	 * The record's own colour on each ground: a step lighter than charcoal, a step deeper than
	 * blueberry, and charcoal on the light ground.
	 */
	public const DISCS = array(
		'#1e1e1e' => '#40464d', // charcoal-3.
		'#3858e9' => '#213fd4', // deep blueberry.
		'#f6f6f6' => '#1e1e1e', // charcoal-1.
	);

	/**
	 * Layouts: where the record sits.
	 */
	private const LAYOUTS = array( 'corner', 'centre', 'horizon' );

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
	 * The cover for one that cannot be shown: a plain record on charcoal, with no words and no
	 * album's colours, so it tells nothing of the album it stands for. The player draws the same one
	 * (BLANK_COVER, in assets/player/helpers.js) for a cover that does not load.
	 *
	 * @since 6.8.1
	 *
	 * @return string SVG document.
	 */
	public static function blank(): string {
		return '<?xml version="1.0" encoding="UTF-8"?>' .
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" aria-hidden="true">' .
			'<rect width="1024" height="1024" fill="#1e1e1e"/>' .
			'<circle cx="512" cy="512" r="330" fill="#2a2a2a"/>' .
			'<circle cx="512" cy="512" r="110" fill="#333"/>' .
			'<circle cx="512" cy="512" r="12" fill="#1e1e1e"/>' .
			'</svg>';
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
	 * The record as the turntable plays it: side A of the album's pressing (Library::pressing()), to
	 * the same measure as the player's record, its first track outermost and each track's width its
	 * share of the side, since a record's grooves keep one pitch. A ring parts each track from the
	 * next, and where the tracks carry level data the grooves are lighter where the music is loud.
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
		$ink      = self::luminance( $disc ) < 0.5 ? '#ffffff' : '#1e1e1e';
		$tracks   = array_values( $tracks );
		$pressing = Library::pressing( $tracks );
		$single   = '7' === $pressing['format'];
		$side     = $pressing['sides'][0] ?? array(
			'from' => 0,
			'to'   => count( $tracks ),
		);
		$tracks   = array_slice( $tracks, $side['from'], $side['to'] - $side['from'] );
		$label    = $r * ( $single ? 0.5 : 0.345 );
		$hole     = max( 4, $r * ( $single ? 0.11 : 0.024 ) );
		$lead_out = $r * ( $single ? 0.56 : 0.4 );
		$lead_in  = $r * 0.97;
		$at       = static fn( float $played ): float => round( $lead_in - ( $lead_in - $lead_out ) * $played, 1 );
		$lengths  = array_map( static fn( $t ) => (float) ( $t['duration'] ?? 0 ), $tracks );
		$whole    = array_sum( $lengths );
		// With no lengths known, each track takes the same.
		if ( $whole <= 0 ) {
			$lengths = array_fill( 0, count( $tracks ), 1.0 );
			$whole   = max( 1.0, (float) count( $tracks ) );
		}
		$out = sprintf( '<circle cx="%s" cy="%s" r="%s" fill="%s"/>', $cx, $cy, $r, esc_attr( $disc ) );

		// The music in the grooves: from the lead-out outwards, as a gradient's stops run, with nothing
		// on the dead wax inside it, or on a track with no levels.
		$shade = static fn( float $played, float $opacity ): string => sprintf(
			'<stop offset="%s" stop-color="%s" stop-opacity="%s"/>',
			round( $at( $played ) / $lead_in, 4 ),
			esc_attr( $ink ),
			round( $opacity, 3 )
		);
		$stops = '';
		$into  = $whole;
		$heard = false;
		for ( $i = count( $tracks ) - 1; $i >= 0; $i-- ) {
			$into  -= $lengths[ $i ];
			$levels = isset( $tracks[ $i ]['levels'] ) && is_string( $tracks[ $i ]['levels'] ) ? $tracks[ $i ]['levels'] : '';
			$n      = min( 24, strlen( $levels ) );
			if ( ! $n ) {
				$stops .= $shade( ( $into + $lengths[ $i ] ) / $whole, 0 ) . $shade( $into / $whole, 0 );
				continue;
			}
			$heard = true;
			for ( $j = $n - 1; $j >= 0; $j-- ) {
				$part   = substr( $levels, (int) floor( $j * strlen( $levels ) / $n ), max( 1, (int) floor( strlen( $levels ) / $n ) ) );
				$stops .= $shade( ( $into + ( $j + 0.5 ) * $lengths[ $i ] / $n ) / $whole, 0.14 * (int) max( str_split( $part ) ) / 9 );
			}
		}
		$stops = $heard ? $shade( 1, 0 ) . $stops . $shade( 0, 0 ) : '';
		if ( $stops ) {
			$out .= sprintf( '<radialGradient id="riff-grooves">%s</radialGradient><circle cx="%s" cy="%s" r="%s" fill="url(#riff-grooves)"/>', $stops, $cx, $cy, $lead_in );
		}

		// The lead-in, a ring between each track and the next, and the lead-out.
		$played = 0.0;
		foreach ( array_merge( array( 0.0 ), $lengths ) as $length ) {
			$played += $length;
			$out    .= sprintf( '<circle class="riff-groove" cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="0.34"/>', $cx, $cy, $at( $played / $whole ), esc_attr( $ink ), max( 1.5, $r * 0.006 ) );
		}

		$out .= sprintf( '<circle cx="%s" cy="%s" r="%s" fill="%s"/>', $cx, $cy, $label, esc_attr( $accent ) );
		$out .= sprintf( '<circle cx="%s" cy="%s" r="%s" fill="%s"/>', $cx, $cy, $hole, esc_attr( $bg ) );
		return $out;
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
	 * The two fonts, each one weight subset to Basic Latin, Latin-1 and the punctuation a title
	 * uses, embedded so the cover is set the same wherever it is shown.
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
	 * Breaks a title into at most two lines of about so many characters, at a space, as evenly as
	 * they will go, and never with one word alone on the second line when the title has three or
	 * more: "Hands Across / the Sea", not "Hands Across the / Sea". A title too long for two lines
	 * keeps its most even break and is shortened on the second.
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
		$count = count( $words );
		if ( 1 === $count ) {
			return array( self::clip( $text, $max ) );
		}
		$best = null;
		for ( $k = 1; $k < $count; $k++ ) {
			// No lone last word, unless the title is only two words.
			if ( $count >= 3 && $count - $k < 2 ) {
				continue;
			}
			$first  = implode( ' ', array_slice( $words, 0, $k ) );
			$second = implode( ' ', array_slice( $words, $k ) );
			$fits   = mb_strlen( $first ) <= $max && mb_strlen( $second ) <= $max;
			// Breaks that fit come first; among them, the most even; then the fuller first line.
			$score = array( $fits ? 0 : 1, max( mb_strlen( $first ), mb_strlen( $second ) ), -mb_strlen( $first ) );
			if ( null === $best || $score < $best[0] ) {
				$best = array( $score, $first, $second );
			}
		}
		return array( self::clip( $best[1], $max ), self::clip( $best[2], $max ) );
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
	 * Mixes two hex colours.
	 *
	 * @param string $a      First colour.
	 * @param string $b      Second colour.
	 * @param float  $amount How much of the second, 0 to 1.
	 * @return string Hex colour.
	 */
	public static function mix( string $a, string $b, float $amount ): string {
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
}
