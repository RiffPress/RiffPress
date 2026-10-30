<?php
/**
 * Home, the view the Listen page opens on.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_REST_Request;

use Riff\Library;
use Riff\Likes_Rest;

defined( 'ABSPATH' ) || exit;

/**
 * Home: rows that scroll sideways, as the apps open. What was played draws here too, so nothing
 * moves once the page is up: a signed-in listener's from their account, and a visitor's as rows
 * of empty cards the script fills in place, when the player's cookie says their browser has a
 * history. Your Library borrows the Recently played row.
 */
final class Home_View {

	/**
	 * Home: rows that scroll sideways, as the apps open.
	 *
	 * What was played draws here too, so nothing moves once the page is up: a signed-in listener's
	 * from their account, and a visitor's as rows of empty cards the script fills in place, when
	 * the player's cookie says their browser has a history. Without it the rows stay hidden, and
	 * are only filled when the script draws Home itself; nothing appears above a page already shown.
	 *
	 * @since 4.18.0
	 * @since 4.21.0 Draws what was played, or holds its place.
	 *
	 * @param string $page Listen page.
	 * @return string
	 */
	public static function view( string $page ): string {
		$albums  = Browse::get( '/albums', array( 'orderby' => 'added' ) );
		$artists = Browse::get( '/artists' );
		$posts   = App::post_cards( $page );
		if ( ! $albums['items'] && ! $artists['items'] && '' === $posts ) {
			return Ui::title( __( 'Home', 'riff' ) ) . Browse::empty_note();
		}
		$html  = Ui::title( __( 'Home', 'riff' ) );
		$html .= self::played_shelves( $page );
		// Who else is playing, which the script fills; hidden until someone is.
		if ( Together::available() && true === Likes_Rest::allowed() ) {
			$html .= Ui::shelf( 'together', __( 'Listening now', 'riff' ), '', '', true, 'div', array( 'together' => rest_url( Library::REST . '/together' ) ) );
		}
		if ( $albums['items'] ) {
			$html .= Ui::shelf( 'added', __( 'Recently added', 'riff' ), add_query_arg( Browse::VIEW, 'albums', $page ), Browse::album_cards( $albums['items'], $page ) );
		}
		if ( $artists['items'] ) {
			$html .= Ui::shelf( 'artists', __( 'Artists', 'riff' ), add_query_arg( Browse::VIEW, 'artists', $page ), Browse::artist_items( $artists['items'], $page ), false, 'ul' );
		}
		if ( '' !== $posts ) {
			$html .= Ui::shelf( 'posts', __( 'New posts', 'riff' ), add_query_arg( Browse::VIEW, 'posts', $page ), $posts );
		}
		return $html;
	}

	/**
	 * How many cards a row held for a visitor's history shows while the script fills it: more than
	 * fit across the widest window, so the row looks full.
	 */
	private const SKELETONS = 8;

	/**
	 * Jump back in and Recently played, as Home shows them, or Recently played alone, as Your
	 * Library does: drawn from a signed-in listener's account, held as empty cards for a visitor
	 * whose browser has a history, or hidden for the script.
	 *
	 * @since 4.21.0
	 *
	 * @param string $page Listen page.
	 * @param bool   $jump Whether Jump back in comes first.
	 * @return string
	 */
	public static function played_shelves( string $page, bool $jump = true ): string {
		$response = rest_do_request( new WP_REST_Request( 'GET', '/' . Library::REST . '/users/me/history' ) );
		if ( ! $response->is_error() ) {
			$played = array_values( (array) ( $response->get_data()['items'] ?? array() ) );
			return ( $jump ? self::jump_shelf( $played, $page ) : '' ) . self::recent_shelf( $played, $page );
		}
		$hint = isset( $_COOKIE[ Browse::HISTORY_HINT ] ) ? (int) $_COOKIE[ Browse::HISTORY_HINT ] : 0;
		if ( $hint > 0 ) {
			// The script fills these in place; until then they are only a shape.
			// A no-break space keeps each line its full height.
			$cards = str_repeat(
				Ui::card(
					array(
						'title' => "\u{00A0}",
						'sub'   => "\u{00A0}",
						'class' => 'riff-card-skeleton',
					)
				),
				self::SKELETONS
			);
			$wait  = array( 'skeleton' => '' );
			$first = $hint > 1 ? Ui::shelf( 'jump', __( 'Jump back in', 'riff' ), '', $cards, false, 'div', $wait ) : Ui::shelf( 'jump', __( 'Jump back in', 'riff' ), '', '', true );
			return ( $jump ? $first : '' ) . Ui::shelf( 'recent', __( 'Recently played', 'riff' ), '', $cards, false, 'div', $wait );
		}
		return ( $jump ? Ui::shelf( 'jump', __( 'Jump back in', 'riff' ), '', '', true ) : '' ) . Ui::shelf( 'recent', __( 'Recently played', 'riff' ), '', '', true );
	}

	/**
	 * What app.js compares with the player's history, to leave a row the server drew alone.
	 *
	 * @param array[] $played Tracks played, newest first.
	 * @return string
	 */
	private static function played_key( array $played ): string {
		return $played ? count( $played ) . ':' . $played[0]['id'] . ':' . (int) ( $played[0]['played'] ?? 0 ) : '0';
	}

	/**
	 * A played track's largest cover, as app.js picks it.
	 *
	 * @param array $track Track.
	 * @return string
	 */
	private static function played_art( array $track ): string {
		$art = (array) ( $track['art'] ?? array() );
		return $art ? (string) ( end( $art )['src'] ?? '' ) : '';
	}

	/**
	 * Jump back in: the posts last played from, each once, as app.js draws it.
	 *
	 * @param array[] $played Tracks played, newest first.
	 * @param string  $page   Listen page.
	 * @return string
	 */
	private static function jump_shelf( array $played, string $page ): string {
		$cards = '';
		$seen  = array();
		foreach ( $played as $track ) {
			$post = (int) ( $track['post']['id'] ?? 0 );
			if ( ! $post || isset( $seen[ $post ] ) || count( $seen ) >= 12 ) {
				continue;
			}
			$seen[ $post ] = true;
			$title         = (string) ( $track['post']['title'] ?? '' );
			$cards        .= Ui::card(
				array(
					'title' => $title,
					'href'  => add_query_arg( App::QUERY, $post, $page ),
					'sub'   => (string) ( $track['artist'] ?? '' ),
					'art'   => self::played_art( $track ),
					'play'  => array(
						'action' => 'play-card',
						'data'   => array( 'post' => $post ),
						/* translators: %s: track or post title. */
						'label'  => sprintf( __( 'Play %s', 'riff' ), $title ),
					),
				)
			);
		}
		return Ui::shelf( 'jump', __( 'Jump back in', 'riff' ), '', $cards, '' === $cards, 'div', array( 'played' => self::played_key( $played ) ) );
	}

	/**
	 * Recently played: the tracks themselves, as app.js draws them.
	 *
	 * @param array[] $played Tracks played, newest first.
	 * @param string  $page   Listen page.
	 * @return string
	 */
	private static function recent_shelf( array $played, string $page ): string {
		$cards = '';
		foreach ( array_slice( $played, 0, 20 ) as $i => $track ) {
			$post   = (int) ( $track['post']['id'] ?? 0 );
			$title  = (string) ( $track['title'] ?? '' );
			$cards .= Ui::card(
				array(
					'title' => $title,
					'href'  => $post ? add_query_arg( App::QUERY, $post, $page ) : '',
					'sub'   => (string) ( $track['artist'] ?? '' ),
					'art'   => self::played_art( $track ),
					'play'  => array(
						'action' => 'play-history',
						'data'   => array( 'index' => $i ),
						/* translators: %s: track or post title. */
						'label'  => sprintf( __( 'Play %s', 'riff' ), $title ),
					),
				)
			);
		}
		return Ui::shelf( 'recent', __( 'Recently played', 'riff' ), '', $cards, '' === $cards, 'div', array( 'played' => self::played_key( $played ) ) );
	}
}
