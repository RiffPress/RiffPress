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
		if ( '' === $search ) {
			return self::browse( $page );
		}
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

	/**
	 * Search before any words: the lists to browse, as tiles, as the apps' Search tab opens. The
	 * field is the bar's, above it; typing there shows recent searches and suggestions.
	 *
	 * @param string $page Listen page.
	 * @return string
	 */
	private static function browse( string $page ): string {
		// Each tile in a colour of the drawn covers' palette, with words that keep 4.5:1 on it.
		$tiles = array(
			'albums'  => array( __( 'Albums', 'riff' ), '#3858e9', '#ffffff' ),
			'artists' => array( __( 'Artists', 'riff' ), '#7a00df', '#ffffff' ),
			'tracks'  => array( __( 'Tracks', 'riff' ), '#e26f56', '#1e1e1e' ),
			'posts'   => array( __( 'Posts', 'riff' ), '#33f078', '#1e1e1e' ),
		);
		$html  = '';
		foreach ( $tiles as $view => list( $label, $bg, $ink ) ) {
			$html .= sprintf(
				'<li><a class="riff-browse-tile" href="%s" style="background:%s;color:%s">%s</a></li>',
				esc_url( add_query_arg( Browse::VIEW, $view, $page ) ),
				esc_attr( $bg ),
				esc_attr( $ink ),
				esc_html( $label )
			);
		}
		return Ui::title( __( 'Browse all', 'riff' ) ) . '<ul class="riff-browse">' . $html . '</ul>';
	}
}
