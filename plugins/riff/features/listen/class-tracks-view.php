<?php
/**
 * The tracks list.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

defined( 'ABSPATH' ) || exit;

/**
 * Every track as a row, a page at a time.
 */
final class Tracks_View {

	/**
	 * Every track, a page at a time.
	 *
	 * @param string $page   Listen page.
	 * @param int    $number Page of tracks.
	 * @return string
	 */
	public static function view( string $page, int $number ): string {
		$data = Browse::get( '/tracks', array( 'page' => $number ) );
		return Browse::list_view( __( 'Tracks', 'riff' ), Browse::count( (int) $data['total'] ), $data, '', false, 0, Browse::more( '/tracks', array(), $data ) ) . Browse::next( add_query_arg( Browse::VIEW, 'tracks', $page ), $data );
	}
}
