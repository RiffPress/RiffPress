<?php
/**
 * One album.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Catalog;

defined( 'ABSPATH' ) || exit;

/**
 * Its name and artist beside Play and Shuffle, then its tracks in order, then more by the artist.
 */
final class Album_View {

	/**
	 * The most pages of 100 an album view reads: an album of up to 2,000 tracks shows whole.
	 */
	private const ALBUM_PAGES = 20;

	/**
	 * One album: its name and artist beside Play and Shuffle, then its tracks in order.
	 *
	 * @param string $page Listen page.
	 * @param int    $id   Album term ID.
	 * @return string
	 */
	public static function view( string $page, int $id ): string {
		// The whole album, page by page: a box set runs past one page of the route.
		$data = Browse::get(
			'/tracks',
			array(
				'album'    => $id,
				'per_page' => 100,
			)
		);
		$last = min( (int) $data['pages'], self::ALBUM_PAGES );
		for ( $number = 2; $number <= $last; $number++ ) {
			$more          = Browse::get(
				'/tracks',
				array(
					'album'    => $id,
					'per_page' => 100,
					'page'     => $number,
				)
			);
			$data['items'] = array_merge( $data['items'], $more['items'] );
		}
		$term = get_term( $id );
		if ( ! $data['items'] || ! $term instanceof \WP_Term ) {
			return Albums_View::view( $page, 1 );
		}
		$artist = (string) get_term_meta( $id, 'riff_album_artist', true );
		$meta   = implode( ' · ', array_filter( array( $artist, Browse::count( (int) $data['total'] ) ) ) );
		return Browse::list_view( Catalog::name( $term->name ), $meta, $data, __( 'Album', 'riff' ), true, $id ) . self::more_by( $artist, $id, $page );
	}

	/**
	 * More by this artist: their other albums, under one album's tracks.
	 *
	 * @since 4.18.0
	 *
	 * @param string $artist The album's artist, as its term meta has it.
	 * @param int    $album  The album showing, left out.
	 * @param string $page   Listen page.
	 * @return string
	 */
	private static function more_by( string $artist, int $album, string $page ): string {
		$term = '' !== $artist ? get_term_by( 'name', $artist, 'riff_artist' ) : false;
		if ( ! $term instanceof \WP_Term ) {
			return '';
		}
		$data   = Browse::get( '/albums', array( 'artist' => (int) $term->term_id ) );
		$others = array_values( array_filter( $data['items'], static fn( $a ) => (int) $a['id'] !== $album ) );
		if ( ! $others ) {
			return '';
		}
		return sprintf(
			'<section class="riff-more" aria-labelledby="riff-more-title"><h3 class="riff-more-title" id="riff-more-title"><a href="%s">%s</a></h3>%s</section>',
			esc_url( add_query_arg( Browse::ARTIST, (int) $term->term_id, $page ) ),
			/* translators: %s: artist name. */
			esc_html( sprintf( __( 'More by %s', 'riff' ), $artist ) ),
			Browse::album_grid( $others, $page )
		);
	}
}
