<?php
/**
 * Your Library: the songs, albums and artists a listener liked.
 *
 * @since 4.20.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_REST_Request;

use Riff\Library;
use Riff\Player;
use Riff\Tracks;

defined( 'ABSPATH' ) || exit;

/**
 * The Your Library view, at ?riff_view=library.
 *
 * Laid out as the streaming apps lay theirs out: filter chips for songs, albums and artists, a
 * sort, and everything liked in one grid with Liked songs pinned first. A signed-in listener's
 * likes come from riff/v1/users/me/likes. A visitor's are in their browser, so app.js sends them along
 * as ?riff_liked when it fetches this view; without the script a visitor sees how to start. Every
 * like is shown through the catalogue routes, so a track whose post went private drops out.
 */
final class Collection {

	/**
	 * The query argument app.js sends a visitor's likes in: t, a or r (track, album, artist) and an
	 * ID each, newest first, separated by commas.
	 *
	 * @since 4.20.0
	 */
	public const LIKED = 'riff_liked';

	/**
	 * How many of a visitor's likes the view reads from the address.
	 *
	 * @since 4.20.0
	 */
	public const DEVICE_MAX = 400;

	/**
	 * Liked songs per page.
	 */
	private const PER_PAGE = 50;

	/**
	 * Renders the view.
	 *
	 * @since 4.20.0
	 *
	 * @param string $page The Listen page's address.
	 * @return string
	 */
	public static function view( string $page ): string {
		$filter = self::arg( Browse::FILTER );
		$filter = in_array( $filter, array( 'playlists', 'songs', 'albums', 'artists' ), true ) ? $filter : 'all';
		$sort   = 'name' === self::arg( Browse::SORT ) ? 'name' : 'recent';
		$number = ctype_digit( self::arg( App::PAGE_QUERY ) ) ? max( 1, (int) self::arg( App::PAGE_QUERY ) ) : 1;

		list( $likes, $account ) = self::likes();
		$ids                     = array(
			'track'  => array(),
			'album'  => array(),
			'artist' => array(),
		);
		foreach ( $likes as $like ) {
			$ids[ $like['kind'] ][] = (int) $like['id'];
		}

		$lists = $account ? Playlist_View::mine() : array();
		if ( 'name' === $sort ) {
			usort( $lists, static fn( $a, $b ) => strnatcasecmp( (string) $a['title'], (string) $b['title'] ) );
		}
		$html = Ui::title( __( 'Your Library', 'riff' ) ) . self::bar( $page, $filter, $sort, $account );
		if ( ! $account && ! $likes ) {
			$html .= self::sign_in( $page );
		}
		switch ( $filter ) {
			case 'playlists':
				if ( ! $account ) {
					$html .= Ui::empty_note( __( 'Sign in to make playlists. They are kept in your account.', 'riff' ) );
				} elseif ( ! $lists ) {
					$html .= Ui::empty_note( __( 'Playlists you make show up here. Press New playlist, or choose Add to playlist in the … menu beside any track.', 'riff' ) );
				} else {
					$html .= '<div class="riff-grid">' . implode( '', array_map( static fn( $l ) => Playlist_View::card( $l, $page ), $lists ) ) . '</div>';
				}
				break;
			case 'songs':
				$html .= self::songs( $page, $ids['track'], $sort, $number );
				break;
			case 'albums':
				$albums = self::terms( '/albums', $ids['album'], $sort );
				$html  .= $albums ? '<div class="riff-grid">' . Browse::album_cards( $albums, $page ) . '</div>' : Ui::empty_note( __( 'Albums you like show up here. Press the heart on an album’s page.', 'riff' ) );
				break;
			case 'artists':
				$artists = self::terms( '/artists', $ids['artist'], $sort );
				$html   .= $artists ? '<ul class="riff-artists">' . Browse::artist_items( $artists, $page ) . '</ul>' : Ui::empty_note( __( 'Artists you like show up here. Press the heart on an artist’s page.', 'riff' ) );
				break;
			default:
				$html .= self::everything( $page, $ids, $likes, $sort, $lists );
		}
		if ( ! $account && $likes ) {
			$html .= self::sign_in( $page );
		}
		return sprintf( '<div class="riff-library" data-riff-library="%s">%s</div>', $account ? 'account' : 'device', $html );
	}

	/**
	 * The listener's likes, newest first, and whether they are an account's.
	 *
	 * @return array{0: array[], 1: bool}
	 */
	private static function likes(): array {
		$response = rest_do_request( new WP_REST_Request( 'GET', '/' . Library::REST . '/users/me/likes' ) );
		if ( ! $response->is_error() ) {
			return array( (array) ( $response->get_data()['items'] ?? array() ), true );
		}
		$kinds = array(
			't' => 'track',
			'a' => 'album',
			'r' => 'artist',
		);
		$likes = array();
		$seen  = array();
		foreach ( array_slice( explode( ',', self::arg( self::LIKED ) ), 0, self::DEVICE_MAX ) as $part ) {
			if ( preg_match( '/^([tar])([1-9]\d{0,19})$/', trim( $part ), $m ) && ! isset( $seen[ $m[0] ] ) ) {
				$seen[ $m[0] ] = true;
				$likes[]       = array(
					'kind' => $kinds[ $m[1] ],
					'id'   => (int) $m[2],
				);
			}
		}
		return array( $likes, false );
	}

	/**
	 * The filter chips and the sort, as links, so both work without the script.
	 *
	 * @param string $page   Listen page.
	 * @param string $filter The filter showing.
	 * @param string $sort   The sort in use.
	 * @param bool   $account Whether the listener is signed in, for New playlist.
	 * @return string
	 */
	private static function bar( string $page, string $filter, string $sort, bool $account = false ): string {
		$chips  = array(
			'all'       => __( 'All', 'riff' ),
			'playlists' => __( 'Playlists', 'riff' ),
			'songs'     => __( 'Songs', 'riff' ),
			'albums'    => __( 'Albums', 'riff' ),
			'artists'   => __( 'Artists', 'riff' ),
		);
		$sorts  = array(
			'recent' => __( 'Recently added', 'riff' ),
			'name'   => __( 'Alphabetical', 'riff' ),
		);
		$choice = static fn( string $label, string $href, bool $current ): array => array(
			'label'   => $label,
			'href'    => $href,
			'current' => $current,
		);
		$links  = array();
		foreach ( $chips as $slug => $label ) {
			$links[] = $choice( $label, self::link( $page, $slug, $sort ), $slug === $filter );
		}
		$order = array();
		foreach ( $sorts as $slug => $label ) {
			$order[] = $choice( $label, self::link( $page, $filter, $slug ), $slug === $sort );
		}
		// Spotify's Create: a new playlist, for someone signed in. app.js makes it and opens it.
		$create = $account ? '<button type="button" class="riff-pill riff-pill-solid riff-library-create" data-riff-app-action="new-playlist">' . esc_html__( 'New playlist', 'riff' ) . '</button>' : '';
		return '<div class="riff-library-bar">' . Ui::choices( __( 'Show', 'riff' ), $links ) . Ui::choices( __( 'Sort by', 'riff' ), $order, 'sort' ) . $create . '</div>';
	}

	/**
	 * The library's address with a filter and a sort, leaving out the defaults.
	 *
	 * @param string $page   Listen page.
	 * @param string $filter all, songs, albums or artists.
	 * @param string $sort   recent or name.
	 * @return string
	 */
	private static function link( string $page, string $filter, string $sort ): string {
		return add_query_arg(
			array_filter(
				array(
					Browse::VIEW   => 'library',
					Browse::FILTER => 'all' === $filter ? null : $filter,
					Browse::SORT   => 'recent' === $sort ? null : $sort,
				)
			),
			$page
		);
	}

	/**
	 * All: Liked songs first, then the albums and artists, together, then what was played lately.
	 * It never looks empty, as the apps' libraries never do: Liked songs is always there and says
	 * how to fill it, and with nothing liked a row of the site's albums offers somewhere to start.
	 * Recently played is drawn, or held, as on Home, and the row of albums gives way to it; where
	 * the server could not know, the script fills it and hides the row of albums.
	 *
	 * @param string  $page  Listen page.
	 * @param array[] $ids   Liked IDs by kind, newest first.
	 * @param array[] $likes Every like, newest first.
	 * @param string  $sort  recent or name.
	 * @param array[] $lists The listener's playlists.
	 * @return string
	 */
	private static function everything( string $page, array $ids, array $likes, string $sort, array $lists = array() ): string {
		// Albums and artists in one list: newest first by where each sits in the likes, or by name.
		$place = array();
		foreach ( $likes as $i => $like ) {
			$place[ $like['kind'] . ':' . $like['id'] ] = $i;
		}
		$items = array();
		foreach ( self::terms( '/albums', $ids['album'], 'recent' ) as $album ) {
			$items[] = array(
				'name' => (string) $album['name'],
				'at'   => $place[ 'album:' . (int) $album['id'] ] ?? PHP_INT_MAX,
				'card' => Browse::album_cards( array( $album ), $page ),
			);
		}
		foreach ( self::terms( '/artists', $ids['artist'], 'recent' ) as $artist ) {
			$items[] = array(
				'name' => (string) $artist['name'],
				'at'   => $place[ 'artist:' . (int) $artist['id'] ] ?? PHP_INT_MAX,
				'card' => self::artist_card( $artist, $page ),
			);
		}
		usort(
			$items,
			'name' === $sort
				? static fn( $a, $b ) => strnatcasecmp( $a['name'], $b['name'] )
				: static fn( $a, $b ) => $a['at'] <=> $b['at']
		);
		// Liked songs, playable from its cover with the first hundred, newest first.
		$songs = $ids['track'] ? Browse::get(
			'/tracks',
			array(
				'include'  => $ids['track'],
				'orderby'  => 'include',
				'per_page' => 100,
			)
		) : array(
			'items' => array(),
			'total' => 0,
		);
		$count = (int) $songs['total'];
		$liked = Ui::card(
			array(
				'title' => __( 'Liked songs', 'riff' ),
				'href'  => self::link( $page, 'songs', $sort ),
				/* translators: %s: number of songs. */
				'sub'   => $count ? sprintf( _n( '%s song', '%s songs', $count, 'riff' ), number_format_i18n( $count ) ) : __( 'Press the heart on a song to keep it here', 'riff' ),
				'heart' => true,
				'class' => 'riff-card-liked',
				'play'  => $songs['items'] ? array(
					'action' => 'play-liked',
					'data'   => array( 'tracks' => (string) wp_json_encode( $songs['items'] ) ),
					'label'  => __( 'Play Liked songs', 'riff' ),
				) : array(),
			)
		);
		// The listener's playlists come right after Liked songs, as the apps pin them.
		$playlists = implode( '', array_map( static fn( $l ) => Playlist_View::card( $l, $page ), $lists ) );
		$html      = '<div class="riff-grid riff-library-grid">' . $liked . $playlists . implode( '', wp_list_pluck( $items, 'card' ) ) . '</div>';
		$recent    = Browse::played_shelves( $page, false );
		$html     .= $recent;
		// Somewhere to start, unless what was played is already there to show instead.
		if ( ! $likes && ! $lists && str_contains( $recent, 'aria-labelledby="riff-shelf-recent" hidden>' ) ) {
			$albums = Browse::get( '/albums', array( 'orderby' => 'added' ) );
			if ( $albums['items'] ) {
				$html .= Ui::shelf( 'start', __( 'Start with', 'riff' ), add_query_arg( Browse::VIEW, 'albums', $page ), Browse::album_cards( array_slice( $albums['items'], 0, 12 ), $page ) );
			}
		}
		return $html;
	}

	/**
	 * Liked songs, a page at a time, with Play and Shuffle.
	 *
	 * @param string $page   Listen page.
	 * @param int[]  $ids    Liked track IDs, newest first.
	 * @param string $sort   recent or name.
	 * @param int    $number Page.
	 * @return string
	 */
	private static function songs( string $page, array $ids, string $sort, int $number ): string {
		$data = $ids ? Browse::get(
			'/tracks',
			array(
				'include'  => $ids,
				'orderby'  => 'name' === $sort ? 'title' : 'include',
				'per_page' => self::PER_PAGE,
				'page'     => $number,
			)
		) : array( 'items' => array() );
		if ( ! $data['items'] ) {
			return Ui::empty_note( __( 'Songs you like show up here. Press the heart beside any track.', 'riff' ) );
		}
		return sprintf(
			'<section class="riff-library-songs" aria-labelledby="riff-library-songs"><h3 class="riff-app-section" id="riff-library-songs">%s</h3><p class="riff-album-meta">%s</p>%s%s%s</section>',
			esc_html__( 'Liked songs', 'riff' ),
			/* translators: %s: number of songs. */
			esc_html( sprintf( _n( '%s song', '%s songs', (int) $data['total'], 'riff' ), number_format_i18n( (int) $data['total'] ) ) ),
			Ui::actions(),
			Browse::rows( $data['items'] ),
			Browse::next( self::link( $page, 'songs', $sort ), $data )
		);
	}

	/**
	 * Liked albums or artists as the catalogue shows them, newest first or by name.
	 *
	 * @param string $route /albums or /artists.
	 * @param int[]  $ids   Term IDs, newest first.
	 * @param string $sort  recent or name.
	 * @return array[]
	 */
	private static function terms( string $route, array $ids, string $sort ): array {
		$found = array();
		// A page of the route is 48 terms; a long list of likes is asked for in as many pages.
		foreach ( array_chunk( $ids, 48 ) as $chunk ) {
			foreach ( Browse::get( $route, array( 'include' => $chunk ) )['items'] as $term ) {
				$found[ (int) $term['id'] ] = $term;
			}
		}
		if ( 'name' === $sort ) {
			usort( $found, static fn( $a, $b ) => strnatcasecmp( (string) $a['name'], (string) $b['name'] ) );
			return $found;
		}
		$ordered = array();
		foreach ( $ids as $id ) {
			if ( isset( $found[ $id ] ) ) {
				$ordered[] = $found[ $id ];
			}
		}
		return $ordered;
	}

	/**
	 * An artist as a card, round, with their picture when they have one.
	 *
	 * @param array  $artist From /artists.
	 * @param string $page   Listen page.
	 * @return string
	 */
	private static function artist_card( array $artist, string $page ): string {
		$image = (int) get_term_meta( (int) $artist['id'], 'riff_artist_image', true );
		$art   = $image ? Tracks::art( $image ) : array();
		return Ui::card(
			array(
				'title' => (string) $artist['name'],
				'href'  => add_query_arg( Browse::ARTIST, (int) $artist['id'], $page ),
				'sub'   => __( 'Artist', 'riff' ),
				'art'   => $art ? (string) end( $art )['src'] : '',
				'mark'  => mb_strtoupper( mb_substr( (string) $artist['name'], 0, 1 ) ),
				'class' => 'riff-card-artist',
				'data'  => array( 'artist' => (int) $artist['id'] ),
			)
		);
	}

	/**
	 * For a visitor: where their likes are kept, and a way to keep them in an account.
	 *
	 * @param string $page Listen page.
	 * @return string
	 */
	private static function sign_in( string $page ): string {
		$text = esc_html__( 'Your likes are kept in this browser.', 'riff' );
		if ( ! is_user_logged_in() ) {
			$text .= sprintf( ' <a href="%s">%s</a>', esc_url( wp_login_url( self::link( $page, 'all', 'recent' ) ) ), esc_html__( 'Sign in to keep them in your account.', 'riff' ) );
		}
		return '<p class="riff-library-note">' . $text . '</p>';
	}

	/**
	 * One query argument, as text.
	 *
	 * @param string $key Name.
	 * @return string
	 */
	private static function arg( string $key ): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- which view to show; nothing changes.
		return isset( $_GET[ $key ] ) ? sanitize_text_field( wp_unslash( $_GET[ $key ] ) ) : '';
	}
}
