<?php
/**
 * Home, the view the Listen page opens on.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

use Riff\Library;
use Riff\Listener;
use Riff\Tracks;

defined( 'ABSPATH' ) || exit;

/**
 * Home: rows that scroll sideways, as the apps open. What was played draws here too, so nothing
 * moves once the page is up: a signed-in listener's from their account, and a visitor's as rows
 * of empty cards the script fills in place, when the player's cookie says their browser has a
 * history, with cards drawn here from what the browser kept, at riff/v1/played. Your Library
 * borrows the Recently played row.
 */
final class Home_View {

	/**
	 * The most of a browser's history drawn at once: what the player keeps.
	 */
	private const PLAYED_MAX = 50;

	/**
	 * Hooks the route.
	 *
	 * @since 5.8.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * GET /riff/v1/played: a visitor's Jump back in and Recently played, drawn as a signed-in
	 * listener's are, from what their browser kept: each track played, newest first, as its
	 * attachment and the post it played from. What the site no longer has, or the visitor may not
	 * see, is left out. Riff's own, for the Listen app, and not public: it may change with the app.
	 *
	 * @since 5.8.0
	 */
	public static function routes(): void {
		register_rest_route(
			Library::REST,
			'/played',
			array(
				'methods'             => 'GET',
				'callback'            => array( self::class, 'rest_played' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'items' => array(
						'description' => __( 'Tracks played, newest first, each as its attachment ID and the post it played from, or 0: 12:34,15:0.', 'riff' ),
						'type'        => 'string',
						'required'    => true,
						'pattern'     => '^\\d+:\\d+(,\\d+:\\d+)*$',
					),
					'page'  => array(
						'description' => __( 'The Listen page the cards link to.', 'riff' ),
						'type'        => 'string',
						'format'      => 'uri',
						'required'    => true,
					),
				),
			)
		);
	}

	/**
	 * GET /played.
	 *
	 * @since 5.8.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_played( WP_REST_Request $request ) {
		// Only this site's own Listen page, so a card never links anywhere else.
		$page = wp_validate_redirect( (string) $request['page'], '' );
		if ( '' === $page ) {
			return new WP_Error( 'rest_invalid_param', __( 'That is not a page of this site.', 'riff' ), array( 'status' => 400 ) );
		}
		$items = array();
		foreach ( array_slice( explode( ',', (string) $request['items'] ), 0, self::PLAYED_MAX ) as $pair ) {
			[ $id, $post ] = array_map( 'intval', explode( ':', $pair ) );
			$items[]       = array(
				'id'   => $id,
				'post' => $post,
			);
		}
		// Each with its place in the browser's history, which Recently played's buttons play by.
		$played = array();
		foreach ( Tracks::readable( $items ) as $i => $track ) {
			if ( ! $track ) {
				continue;
			}
			// A post it can't be shown from, or the Listen page itself, is no post to jump back into.
			if ( (int) ( $track['post']['id'] ?? 0 ) !== $items[ $i ]['post'] ) {
				$track['post'] = null;
			}
			$track['index'] = $i;
			$played[]       = $track;
		}
		return new WP_REST_Response(
			array(
				'jump'   => self::jump_cards( $played, $page ),
				'recent' => self::recent_cards( $played, $page ),
			)
		);
	}

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
		$html = Ui::title( __( 'Home', 'riff' ) );
		// Home is painted around its first row of covers, whichever row that is: they load at once,
		// the first before anything else, and the rest when scrolled to.
		Ui::lead( self::LEAD );
		$html .= self::played_shelves( $page );
		// Who else is playing, which the script fills; hidden until someone is.
		if ( Together::available() && true === Listener::signed_in() ) {
			$html .= Ui::shelf( 'together', __( 'Listening now', 'riff' ), '', '', true, 'div', array( 'together' => rest_url( Library::REST . '/together' ) ) );
		}
		if ( $albums['items'] && Views::has( 'albums' ) ) {
			$html .= Ui::shelf( 'added', __( 'Recently added', 'riff' ), add_query_arg( Browse::VIEW, 'albums', $page ), Browse::album_cards( $albums['items'], $page ) );
		}
		if ( $artists['items'] && Views::has( 'artists' ) ) {
			$html .= Ui::shelf( 'artists', __( 'Artists', 'riff' ), add_query_arg( Browse::VIEW, 'artists', $page ), Browse::artist_items( $artists['items'], $page ), false, 'ul' );
		}
		if ( '' !== $posts && Views::has( 'posts' ) ) {
			$html .= Ui::shelf( 'posts', __( 'New posts', 'riff' ), add_query_arg( Browse::VIEW, 'posts', $page ), $posts );
		}
		Ui::lead( 0 );
		return $html;
	}

	/**
	 * How many cards a row held for a visitor's history shows while the script fills it: more than
	 * fit across the widest window, so the row looks full.
	 */
	private const SKELETONS = 8;

	/**
	 * How many covers Home loads at once: its first row, as many as fit across a computer.
	 */
	private const LEAD = 6;

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
	 * A played track's cover, in every size it has.
	 *
	 * @param array $track Track.
	 * @return array
	 */
	private static function played_art( array $track ): array {
		return (array) ( $track['art'] ?? array() );
	}

	/**
	 * Jump back in: the posts last played from, each once.
	 *
	 * @param array[] $played Tracks played, newest first.
	 * @param string  $page   Listen page.
	 * @return string
	 */
	private static function jump_shelf( array $played, string $page ): string {
		$cards = self::jump_cards( $played, $page );
		return Ui::shelf( 'jump', __( 'Jump back in', 'riff' ), '', $cards, '' === $cards, 'div', array( 'played' => self::played_key( $played ) ) );
	}

	/**
	 * Jump back in's cards.
	 *
	 * @param array[] $played Tracks played, newest first.
	 * @param string  $page   Listen page.
	 * @return string
	 */
	private static function jump_cards( array $played, string $page ): string {
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
					'title'   => $title,
					'href'    => add_query_arg( App::QUERY, $post, $page ),
					'sub'     => (string) ( $track['artist'] ?? '' ),
					'art'     => self::played_art( $track ),
					'play'    => array(
						'action' => 'play-card',
						'data'   => array( 'post' => $post ),
						/* translators: %s: track or post title. */
						'label'  => sprintf( __( 'Play %s', 'riff' ), $title ),
					),
					'private' => ! empty( $track['post']['private'] ),
				)
			);
		}
		return $cards;
	}

	/**
	 * Recently played: the tracks themselves.
	 *
	 * @param array[] $played Tracks played, newest first.
	 * @param string  $page   Listen page.
	 * @return string
	 */
	private static function recent_shelf( array $played, string $page ): string {
		$cards = self::recent_cards( $played, $page );
		return Ui::shelf( 'recent', __( 'Recently played', 'riff' ), '', $cards, '' === $cards, 'div', array( 'played' => self::played_key( $played ) ) );
	}

	/**
	 * Recently played's cards, each playing its track by its place in the history, which is its
	 * index here unless what was before it was left out.
	 *
	 * @param array[] $played Tracks played, newest first.
	 * @param string  $page   Listen page.
	 * @return string
	 */
	private static function recent_cards( array $played, string $page ): string {
		$cards = '';
		foreach ( array_slice( $played, 0, 20 ) as $i => $track ) {
			$post   = (int) ( $track['post']['id'] ?? 0 );
			$title  = (string) ( $track['title'] ?? '' );
			$cards .= Ui::card(
				array(
					'title'   => $title,
					'href'    => $post ? add_query_arg( App::QUERY, $post, $page ) : '',
					'sub'     => (string) ( $track['artist'] ?? '' ),
					'art'     => self::played_art( $track ),
					'play'    => array(
						'action' => 'play-history',
						'data'   => array( 'index' => (int) ( $track['index'] ?? $i ) ),
						/* translators: %s: track or post title. */
						'label'  => sprintf( __( 'Play %s', 'riff' ), $title ),
					),
					'private' => ! empty( $track['post']['private'] ),
				)
			);
		}
		return $cards;
	}
}
