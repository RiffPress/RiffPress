<?php
/**
 * The artists list.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

defined( 'ABSPATH' ) || exit;

/**
 * Every artist as a link with their track count, a page at a time.
 */
final class Artists_View {

	/**
	 * The artists list.
	 *
	 * @param string $page   Listen page.
	 * @param int    $number Page of artists.
	 * @return string
	 */
	public static function view( string $page, int $number ): string {
		$data = Browse::get( '/artists', array( 'page' => $number ) );
		if ( ! $data['items'] ) {
			return Ui::title( __( 'Artists', 'riff' ) ) . Browse::empty_note();
		}
		return Ui::title( __( 'Artists', 'riff' ) ) . Browse::artist_list( $data['items'], $page ) . Browse::next( add_query_arg( Browse::VIEW, 'artists', $page ), $data );
	}
}
