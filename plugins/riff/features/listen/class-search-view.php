<?php
/**
 * Search results.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

defined( 'ABSPATH' ) || exit;

/**
 * The albums, artists and tracks that match the words.
 */
final class Search_View {

	/**
	 * Search: the albums, artists and tracks that match.
	 *
	 * @param string $page   Listen page.
	 * @param string $search Words.
	 * @return string
	 */
	public static function view( string $page, string $search ): string {
		$albums  = Browse::get( '/albums', array( 'search' => $search ) );
		$artists = Browse::get( '/artists', array( 'search' => $search ) );
		$tracks  = Browse::get( '/tracks', array( 'search' => $search ) );
		/* translators: %s: the words searched for. */
		$html = Ui::title( sprintf( __( 'Results for “%s”', 'riff' ), $search ) );
		if ( ! $albums['items'] && ! $artists['items'] && ! $tracks['items'] ) {
			return $html . '<p class="riff-app-empty">' . esc_html__( 'Nothing matches that. Try fewer words, or part of a name.', 'riff' ) . '</p>';
		}
		if ( $albums['items'] ) {
			$html .= '<h3 class="riff-app-section">' . esc_html__( 'Albums', 'riff' ) . '</h3>' . Browse::album_grid( array_slice( $albums['items'], 0, 12 ), $page );
		}
		if ( $artists['items'] ) {
			$html .= '<h3 class="riff-app-section">' . esc_html__( 'Artists', 'riff' ) . '</h3>' . Browse::artist_list( array_slice( $artists['items'], 0, 12 ), $page );
		}
		if ( $tracks['items'] ) {
			$html .= '<h3 class="riff-app-section">' . esc_html__( 'Tracks', 'riff' ) . '</h3>' . Browse::rows( $tracks['items'] );
		}
		return $html;
	}
}
