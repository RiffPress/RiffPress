<?php
/**
 * The albums grid.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

defined( 'ABSPATH' ) || exit;

/**
 * Every album as a card, a page at a time.
 */
final class Albums_View {

	/**
	 * The albums grid.
	 *
	 * @param string $page   Listen page.
	 * @param int    $number Page of albums.
	 * @return string
	 */
	public static function view( string $page, int $number ): string {
		$data = Browse::get( '/albums', array( 'page' => $number ) );
		if ( ! $data['items'] ) {
			return Ui::title( __( 'Albums', 'riff' ) ) . Browse::empty_note();
		}
		return Ui::title( __( 'Albums', 'riff' ) ) . Browse::album_grid( $data['items'], $page ) . Browse::next( add_query_arg( Browse::VIEW, 'albums', $page ), $data );
	}
}
