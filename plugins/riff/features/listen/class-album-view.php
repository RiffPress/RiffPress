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
	 * One album: its name and artist beside Play and Shuffle, then its tracks in order, a hundred
	 * at a time: a box set runs on over its pages, and Play and Shuffle play the whole of it.
	 *
	 * @param string $page   Listen page.
	 * @param int    $id     Album term ID.
	 * @param int    $number Page of tracks.
	 * @return string
	 */
	public static function view( string $page, int $id, int $number = 1 ): string {
		$args = array(
			'album'    => $id,
			'per_page' => 100,
		);
		$data = Browse::get( '/tracks', $args + array( 'page' => $number ) );
		$term = get_term( $id );
		if ( ! $data['items'] || ! $term instanceof \WP_Term ) {
			return Albums_View::view( $page, 1 );
		}
		$artist = (string) get_term_meta( $id, 'riff_album_artist', true );
		$by     = '' !== $artist ? get_term_by( 'name', $artist, 'riff_artist' ) : false;
		$by     = $by instanceof \WP_Term ? $by : null;
		// The artist opens their page, when they have one.
		$meta = array_values( array_filter( array( $by ? array( $artist, add_query_arg( Browse::ARTIST, (int) $by->term_id, $page ) ) : $artist, Browse::count( (int) $data['total'] ) ) ) );
		return Browse::list_view( Catalog::name( $term->name ), $meta, $data, __( 'Album', 'riff' ), true, $id, Browse::more( '/tracks', $args, $data ) ) . Browse::next( add_query_arg( Browse::ALBUM, $id, $page ), $data ) . self::more_by( $artist, $by, $id, $page );
	}

	/**
	 * More by this artist: their other albums, under one album's tracks.
	 *
	 * @since 4.18.0
	 *
	 * @param string        $artist The album's artist, as its term meta has it.
	 * @param \WP_Term|null $term   Their artist term, or null.
	 * @param int           $album  The album showing, left out.
	 * @param string        $page   Listen page.
	 * @return string
	 */
	private static function more_by( string $artist, ?\WP_Term $term, int $album, string $page ): string {
		if ( ! $term ) {
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
