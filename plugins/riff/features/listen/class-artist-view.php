<?php
/**
 * One artist.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Catalog;
use Riff\Tracks;

defined( 'ABSPATH' ) || exit;

/**
 * Their picture and name with Play and Shuffle, their tracks newest first, then their albums.
 */
final class Artist_View {

	/**
	 * One artist, as the apps draw them: their picture and name with Play and Shuffle, their tracks
	 * newest first (until plays are counted, the newest stand in for the most played), ten at a
	 * time, then their albums.
	 *
	 * @since 4.16.0
	 * @since 4.19.0 Their picture, their latest tracks, and their albums.
	 *
	 * @param string $page   Listen page.
	 * @param int    $id     Artist term ID.
	 * @param int    $number Page of tracks.
	 * @return string
	 */
	public static function view( string $page, int $id, int $number ): string {
		$data = Browse::get(
			'/tracks',
			array(
				'artist'   => $id,
				'orderby'  => 'added',
				'per_page' => 10,
				'page'     => $number,
			)
		);
		$term = get_term( $id );
		if ( ! $data['items'] || ! $term instanceof \WP_Term ) {
			return Artists_View::view( $page, 1 );
		}
		$albums = Browse::get(
			'/albums',
			array(
				'artist'  => $id,
				'orderby' => 'added',
			)
		);
		// Their own picture, else their newest album's cover. A cover Riff drew sets its type to the
		// square's edges, which the round frame cuts off, so for one of those it is their initial,
		// as on their card, in the album's colour.
		$image = (int) get_term_meta( $id, 'riff_artist_image', true );
		$art   = $image ? Tracks::art( $image ) : (array) ( $albums['items'][0]['art'] ?? array() );
		$cover = $art && ! Art::drawn( $art ) ? (string) end( $art )['src'] : '';
		$mark  = '' === $cover ? '<span class="riff-album-mark" aria-hidden="true">' . esc_html( mb_strtoupper( mb_substr( Catalog::name( $term->name ), 0, 1 ) ) ) . '</span>' : '';
		$meta  = array( Browse::count( (int) $data['total'] ) );
		if ( $albums['total'] ) {
			/* translators: %s: number of albums. */
			$meta[] = sprintf( _n( '%s album', '%s albums', (int) $albums['total'], 'riff' ), number_format_i18n( (int) $albums['total'] ) );
		}
		$html  = App::header( Catalog::name( $term->name ), implode( ' · ', $meta ), __( 'Artist', 'riff' ), $cover, Art::tint( $art ), true, 'artist', $id, array(), '', $mark );
		$html .= '<h3 class="riff-app-section">' . esc_html__( 'Latest', 'riff' ) . '</h3>' . Browse::rows( $data['items'] ) . Browse::next( add_query_arg( Browse::ARTIST, $id, $page ), $data );
		if ( $albums['items'] ) {
			$html .= '<h3 class="riff-app-section">' . esc_html__( 'Albums', 'riff' ) . '</h3>' . Browse::album_grid( $albums['items'], $page );
		}
		return $html;
	}
}
