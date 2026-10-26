<?php
/**
 * Drawing a cover.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

defined( 'ABSPATH' ) || exit;

/**
 * The cover Riff draws for an album with no image: a record with one groove per track, each as
 * long as the track and following its level data when it has any, the title and artist in type,
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
