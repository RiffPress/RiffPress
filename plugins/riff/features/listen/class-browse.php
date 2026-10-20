<?php
/**
 * Browsing the Media Library inside the Listen block: albums, artists, tracks and search.
 *
 * @since 4.16.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_REST_Request;

use Riff\Library;
use Riff\Tracks;

defined( 'ABSPATH' ) || exit;

/**
 * The browse views.
 *
 * Each view is an address on the Listen page and renders on the server, so it reads without the
 * script, a link to it can be shared, and Back works; app.js swaps the next view in without a
 * page load. The data comes through Riff's own REST routes (riff/v1/tracks, /albums and /artists),
 * the same door any other client uses, so a visitor sees here exactly what the routes show them.
 */
final class Browse {

	/**
	 * The query argument naming a list: albums, artists, tracks or posts.
	 *
	 * @since 4.16.0
	 */
	public const VIEW = 'riff_view';

	/**
	 * The query argument opening one album, by term ID.
	 *
	 * @since 4.16.0
	 */
	public const ALBUM = 'riff_album';

	/**
	 * The query argument opening one artist, by term ID.
	 *
	 * @since 4.16.0
	 */
	public const ARTIST = 'riff_artist';

	/**
	 * The query argument holding search words.
	 *
	 * @since 4.16.0
	 */
	public const SEARCH = 'riff_search';

	/**
	 * The query argument narrowing Your Library to songs, albums or artists.
	 *
	 * @since 4.20.0
	 */
	public const FILTER = 'riff_filter';

	/**
	 * The query argument sorting Your Library: recent, or name.
	 *
	 * @since 4.20.0
	 */
	public const SORT = 'riff_sort';

	/**
	 * The query argument opening one of the signed-in listener's playlists, by post ID.
	 *
	 * @since 4.20.0
	 */
	public const PLAYLIST = 'riff_playlist';

	/**
	 * The most pages of 100 an album view reads: an album of up to 2,000 tracks shows whole.
	 */
	private const ALBUM_PAGES = 20;

	/**
	 * Every query argument a browse view uses, for the script to recognise its own addresses.
	 *
	 * @since 4.16.0
	 * @since 4.20.0 Your Library's filter and sort, and a playlist.
	 */
	public const ARGS = array( self::VIEW, self::ALBUM, self::ARTIST, self::SEARCH, self::FILTER, self::SORT, self::PLAYLIST );

	/**
	 * Icons for the navigation, as Material Icons draws them, beside each label in the sidebar.
	 */
	private const ICONS = array(
		'home'    => 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
		'albums'  => 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z',
		'artists' => 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
		'tracks'  => 'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z',
		'posts'   => 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
		'library' => 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 5h-3v5.5c0 1.38-1.12 2.5-2.5 2.5S10 13.88 10 12.5s1.12-2.5 2.5-2.5c.57 0 1.08.19 1.5.51V5h4v2zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z',
	);

	/**
	 * Which browse view the address asks for, or null for Home or a post.
	 *
	 * @since 4.16.0
	 *
	 * @return array{view: string, id: int, search: string, page: int}|null
	 */
	public static function requested(): ?array {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- which view to show; nothing changes.
		$read   = static fn( string $key ): string => isset( $_GET[ $key ] ) ? sanitize_text_field( wp_unslash( $_GET[ $key ] ) ) : '';
		$page   = $read( App::PAGE_QUERY );
		$page   = ctype_digit( $page ) ? max( 1, (int) $page ) : 1;
		$album  = $read( self::ALBUM );
		$artist = $read( self::ARTIST );
		$search = trim( $read( self::SEARCH ) );
		$view   = $read( self::VIEW );
		$list   = $read( self::PLAYLIST );
		// phpcs:enable
		if ( ctype_digit( $list ) && (int) $list > 0 ) {
			return array( 'view' => 'playlist', 'id' => (int) $list, 'search' => '', 'page' => 1 ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		if ( ctype_digit( $album ) && (int) $album > 0 ) {
			return array( 'view' => 'album', 'id' => (int) $album, 'search' => '', 'page' => 1 ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		if ( ctype_digit( $artist ) && (int) $artist > 0 ) {
			return array( 'view' => 'artist', 'id' => (int) $artist, 'search' => '', 'page' => $page ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		if ( '' !== $search ) {
			return array( 'view' => 'search', 'id' => 0, 'search' => $search, 'page' => 1 ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		if ( in_array( $view, array( 'albums', 'artists', 'tracks', 'posts', 'library' ), true ) ) {
			return array( 'view' => $view, 'id' => 0, 'search' => '', 'page' => $page ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		// The posts grid lived at the page's own address before Home did; a link to one of its
		// later pages still opens it.
		if ( $page > 1 ) {
			return array( 'view' => 'posts', 'id' => 0, 'search' => '', 'page' => $page ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		return null;
	}

	/**
	 * The navigation above every view: Home, the lists, and search.
	 *
	 * @since 4.16.0
	 *
	 * @param string     $page    The Listen page's address.
	 * @param array|null $current The browse view showing, or null.
	 * @return string
	 */
	public static function nav( string $page, ?array $current ): string {
		$here  = $current['view'] ?? 'home';
		$here  = array( 'album' => 'albums', 'artist' => 'artists', 'playlist' => 'library' )[ $here ] ?? $here; // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$links = array(
			'home'    => array( __( 'Home', 'riff' ), $page ),
			'albums'  => array( __( 'Albums', 'riff' ), add_query_arg( self::VIEW, 'albums', $page ) ),
			'artists' => array( __( 'Artists', 'riff' ), add_query_arg( self::VIEW, 'artists', $page ) ),
			'tracks'  => array( __( 'Tracks', 'riff' ), add_query_arg( self::VIEW, 'tracks', $page ) ),
			'posts'   => array( __( 'Posts', 'riff' ), add_query_arg( self::VIEW, 'posts', $page ) ),
			// Last, as Spotify's and YouTube Music's: what is the listener's own, under what is the site's.
			'library' => array( __( 'Library', 'riff' ), add_query_arg( self::VIEW, 'library', $page ) ),
		);
		// The site's name heads the sidebar; as tabs it is hidden.
		$name = wp_strip_all_tags( (string) get_bloginfo( 'name' ) );
		$html = sprintf(
			'<span class="riff-app-brand"><button type="button" class="riff-app-collapse" data-riff-app-action="sidebar" aria-expanded="true" aria-label="%s"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg></button><span class="riff-app-name">%s</span></span>',
			esc_attr__( 'Sidebar', 'riff' ),
			esc_html( '' !== $name ? $name : 'Riff' )
		);
		foreach ( $links as $slug => list( $label, $href ) ) {
			$html .= sprintf(
				'<a class="riff-app-tab%s" href="%s"%s><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="%s"/></svg><span>%s</span></a>',
				'home' === $slug ? ' riff-app-home' : '',
				esc_url( $href ),
				$slug === $here ? ' aria-current="page"' : '',
				esc_attr( self::ICONS[ $slug ] ),
				esc_html( $label )
			);
		}
		// The signed-in listener's playlists under the views, as in Spotify's sidebar. Only the
		// standalone sidebar shows them; as tabs there is no room.
		$lists = Playlist_View::mine();
		if ( $lists ) {
			$links = '';
			foreach ( $lists as $list ) {
				$links .= sprintf(
					'<li><a class="riff-app-playlist" href="%s"%s>%s</a></li>',
					esc_url( add_query_arg( self::PLAYLIST, (int) $list['id'], $page ) ),
					'playlist' === ( $current['view'] ?? '' ) && (int) $current['id'] === (int) $list['id'] ? ' aria-current="page"' : '',
					esc_html( (string) $list['title'] )
				);
			}
			$html .= sprintf( '<div class="riff-app-playlists"><p class="riff-app-playlists-title" id="riff-app-playlists">%s</p><ul aria-labelledby="riff-app-playlists">%s</ul></div>', esc_html__( 'Playlists', 'riff' ), $links );
		}
		// A plain GET form, so search works without the script; the page's own arguments ride along
		// for a site without pretty permalinks.
		$hidden = '';
		$query  = (string) wp_parse_url( $page, PHP_URL_QUERY );
		parse_str( $query, $own );
		foreach ( $own as $key => $value ) {
			if ( is_string( $value ) ) {
				$hidden .= sprintf( '<input type="hidden" name="%s" value="%s">', esc_attr( $key ), esc_attr( $value ) );
			}
		}
		$html .= sprintf(
			'<form class="riff-app-search" role="search" action="%s" method="get">%s<input type="search" name="%s" value="%s" placeholder="%s" aria-label="%s"></form>',
			esc_url( strtok( $page, '?' ) ),
			$hidden,
			esc_attr( self::SEARCH ),
			esc_attr( $current['search'] ?? '' ),
			esc_attr__( 'Search', 'riff' ),
			esc_attr__( 'Search music', 'riff' )
		);
		return $html . self::account( $page, $current );
	}

	/**
	 * The address of the view showing: the Listen page with the view's own arguments, as a link
	 * to it would carry them.
	 *
	 * @param string     $page    Listen page.
	 * @param array|null $current The view showing, from current().
	 * @return string
	 */
	private static function address( string $page, ?array $current ): string {
		if ( ! $current ) {
			return $page;
		}
		$args = array();
		switch ( $current['view'] ) {
			case 'album':
				$args[ self::ALBUM ] = (int) $current['id'];
				break;
			case 'artist':
				$args[ self::ARTIST ] = (int) $current['id'];
				break;
			case 'playlist':
				$args[ self::PLAYLIST ] = (int) $current['id'];
				break;
			case 'search':
				$args[ self::SEARCH ] = rawurlencode( (string) $current['search'] );
				break;
			case 'home':
				break;
			default:
				$args[ self::VIEW ] = (string) $current['view'];
		}
		return add_query_arg( $args, $page );
	}

	/**
	 * Who is listening, at the end of the bar as the music apps have it: the signed-in listener's
	 * picture, which opens their name, Your Library, their profile and Sign out; a visitor gets
	 * Sign in. Signing in or out comes back to the view it was pressed on. A details element, so
	 * it opens without the script.
	 *
	 * @param string     $page    Listen page.
	 * @param array|null $current The view showing, from current().
	 * @return string
	 */
	private static function account( string $page, ?array $current ): string {
		$back = self::address( $page, $current );
		$user = wp_get_current_user();
		if ( ! $user->exists() ) {
			return sprintf(
				'<a class="riff-pill riff-app-signin" href="%s">%s</a>',
				esc_url( wp_login_url( $back ) ),
				esc_html__( 'Sign in', 'riff' )
			);
		}
		$name = '' !== trim( (string) $user->display_name ) ? (string) $user->display_name : (string) $user->user_login;
		// The site's avatars, when it shows them and one comes back; otherwise the name's first
		// letter, as an artist's.
		$src  = get_option( 'show_avatars' ) ? get_avatar_url( $user->ID, array( 'size' => 64 ) ) : false;
		$face = $src
			? sprintf( '<img class="riff-app-avatar" src="%s" alt="" width="32" height="32" decoding="async">', esc_url( (string) $src ) )
			: sprintf( '<span class="riff-app-avatar riff-app-initial" aria-hidden="true">%s</span>', esc_html( mb_strtoupper( mb_substr( $name, 0, 1 ) ) ) );
		return sprintf(
			'<details class="riff-app-account"><summary aria-label="%1$s">%2$s</summary><div class="riff-app-account-menu"><p class="riff-app-account-name">%3$s</p><a href="%4$s">%5$s</a><a href="%6$s">%7$s</a><a href="%8$s">%9$s</a></div></details>',
			/* translators: %s: the signed-in listener's name. */
			esc_attr( sprintf( __( 'Account: %s', 'riff' ), $name ) ),
			$face,
			esc_html( $name ),
			esc_url( add_query_arg( self::VIEW, 'library', $page ) ),
			esc_html__( 'Your Library', 'riff' ),
			esc_url( get_edit_profile_url( $user->ID ) ),
			esc_html__( 'Edit profile', 'riff' ),
			esc_url( wp_logout_url( $back ) ),
			esc_html__( 'Sign out', 'riff' )
		);
	}

	/**
	 * Renders the view the address asks for.
	 *
	 * @since 4.16.0
	 *
	 * @param array  $current From requested().
	 * @param string $page    The Listen page's address.
	 * @return string
	 */
	public static function view( array $current, string $page ): string {
		switch ( $current['view'] ) {
			case 'albums':
				return self::albums_view( $page, $current['page'] );
			case 'artists':
				return self::artists_view( $page, $current['page'] );
			case 'tracks':
				return self::tracks_view( $page, $current['page'] );
			case 'posts':
				return App::posts_view( $page );
			case 'library':
				return Collection::view( $page );
			case 'playlist':
				return Playlist_View::view( $page, $current['id'] );
			case 'album':
				return self::album_view( $page, $current['id'] );
			case 'artist':
				return self::artist_view( $page, $current['id'], $current['page'] );
			default:
				return self::search_view( $page, $current['search'] );
		}
	}

	/**
	 * A GET to one of Riff's routes, as the requester.
	 *
	 * @param string $route Route under riff/v1.
	 * @param array  $args  Query arguments.
	 * @return array The response data, or an empty list on an error.
	 */
	public static function get( string $route, array $args = array() ): array {
		$request = new WP_REST_Request( 'GET', '/' . Library::REST . $route );
		$request->set_query_params( $args );
		$response = rest_do_request( $request );
		$data     = $response->is_error() ? array() : $response->get_data();
		return is_array( $data ) ? $data + array(
			'items' => array(),
			'page'  => 1,
			'pages' => 0,
			'total' => 0,
		) : array(
			'items' => array(),
			'pages' => 0,
			'total' => 0,
		);
	}

	/**
	 * A "Next page" link while there are more pages.
	 *
	 * @param string $href  The view's address.
	 * @param array  $data  A route's response.
	 * @return string
	 */
	public static function next( string $href, array $data ): string {
		if ( (int) $data['page'] >= (int) $data['pages'] ) {
			return '';
		}
		return sprintf(
			'<p class="riff-app-more"><a class="riff-pill" href="%s">%s</a></p>',
			esc_url( add_query_arg( App::PAGE_QUERY, (int) $data['page'] + 1, $href ) ),
			esc_html__( 'Next page', 'riff' )
		);
	}

	/**
	 * The albums grid.
	 *
	 * @param string $page   Listen page.
	 * @param int    $number Page of albums.
	 * @return string
	 */
	private static function albums_view( string $page, int $number ): string {
		$data = self::get( '/albums', array( 'page' => $number ) );
		if ( ! $data['items'] ) {
			return Ui::title( __( 'Albums', 'riff' ) ) . self::empty_note();
		}
		return Ui::title( __( 'Albums', 'riff' ) ) . self::album_grid( $data['items'], $page ) . self::next( add_query_arg( self::VIEW, 'albums', $page ), $data );
	}

	/**
	 * Album cards, each opening the album and playing it from its cover.
	 *
	 * @param array  $albums Albums from the route.
	 * @param string $page   Listen page.
	 * @return string
	 */
	private static function album_grid( array $albums, string $page ): string {
		return '<div class="riff-grid">' . self::album_cards( $albums, $page ) . '</div>';
	}

	/**
	 * Album cards, without the grid around them.
	 *
	 * @param array  $albums Albums from the route.
	 * @param string $page   Listen page.
	 * @return string
	 */
	public static function album_cards( array $albums, string $page ): string {
		$cards = '';
		foreach ( $albums as $album ) {
			$cards .= Ui::album( $album, add_query_arg( self::ALBUM, (int) $album['id'], $page ) );
		}
		return $cards;
	}

	/**
	 * The artists list.
	 *
	 * @param string $page   Listen page.
	 * @param int    $number Page of artists.
	 * @return string
	 */
	private static function artists_view( string $page, int $number ): string {
		$data = self::get( '/artists', array( 'page' => $number ) );
		if ( ! $data['items'] ) {
			return Ui::title( __( 'Artists', 'riff' ) ) . self::empty_note();
		}
		return Ui::title( __( 'Artists', 'riff' ) ) . self::artist_list( $data['items'], $page ) . self::next( add_query_arg( self::VIEW, 'artists', $page ), $data );
	}

	/**
	 * Artists as a list of links with their track counts.
	 *
	 * @param array  $artists Artists from the route.
	 * @param string $page    Listen page.
	 * @return string
	 */
	private static function artist_list( array $artists, string $page ): string {
		return '<ul class="riff-artists">' . self::artist_items( $artists, $page ) . '</ul>';
	}

	/**
	 * Artists as list items, without the list around them.
	 *
	 * @param array  $artists Artists from the route.
	 * @param string $page    Listen page.
	 * @return string
	 */
	public static function artist_items( array $artists, string $page ): string {
		$items = '';
		foreach ( $artists as $artist ) {
			$items .= sprintf(
				'<li><a class="riff-artist" href="%s"><span class="riff-artist-mark" aria-hidden="true">%s</span><span class="riff-artist-name">%s</span><span class="riff-artist-sub">%s</span></a></li>',
				esc_url( add_query_arg( self::ARTIST, (int) $artist['id'], $page ) ),
				esc_html( mb_strtoupper( mb_substr( (string) $artist['name'], 0, 1 ) ) ),
				esc_html( $artist['name'] ),
				esc_html( self::count( (int) $artist['count'] ) )
			);
		}
		return $items;
	}

	/**
	 * The cookie the player sets while a visitor's browser keeps a history: 1 when it fills
	 * Recently played, 2 when it fills Jump back in too. It says nothing about what was played.
	 *
	 * @since 4.21.0
	 */
	public const HISTORY_HINT = 'riff_history';

	/**
	 * How many cards a row held for a visitor's history shows while the script fills it: more than
	 * fit across the widest window, so the row looks full.
	 */
	private const SKELETONS = 8;

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
	public static function home_view( string $page ): string {
		$albums  = self::get( '/albums', array( 'orderby' => 'added' ) );
		$artists = self::get( '/artists' );
		$posts   = App::post_cards( $page );
		if ( ! $albums['items'] && ! $artists['items'] && '' === $posts ) {
			return Ui::title( __( 'Home', 'riff' ) ) . self::empty_note();
		}
		$html  = Ui::title( __( 'Home', 'riff' ) );
		$html .= self::played_shelves( $page );
		if ( $albums['items'] ) {
			$html .= Ui::shelf( 'added', __( 'Recently added', 'riff' ), add_query_arg( self::VIEW, 'albums', $page ), self::album_cards( $albums['items'], $page ) );
		}
		if ( $artists['items'] ) {
			$html .= Ui::shelf( 'artists', __( 'Artists', 'riff' ), add_query_arg( self::VIEW, 'artists', $page ), self::artist_items( $artists['items'], $page ), false, 'ul' );
		}
		if ( '' !== $posts ) {
			$html .= Ui::shelf( 'posts', __( 'New posts', 'riff' ), add_query_arg( self::VIEW, 'posts', $page ), $posts );
		}
		return $html;
	}

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
		$hint = isset( $_COOKIE[ self::HISTORY_HINT ] ) ? (int) $_COOKIE[ self::HISTORY_HINT ] : 0;
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

	/**
	 * Every track, a page at a time.
	 *
	 * @param string $page   Listen page.
	 * @param int    $number Page of tracks.
	 * @return string
	 */
	private static function tracks_view( string $page, int $number ): string {
		$data = self::get( '/tracks', array( 'page' => $number ) );
		return self::list_view( __( 'Tracks', 'riff' ), self::count( (int) $data['total'] ), $data ) . self::next( add_query_arg( self::VIEW, 'tracks', $page ), $data );
	}

	/**
	 * One album: its name and artist beside Play and Shuffle, then its tracks in order.
	 *
	 * @param string $page Listen page.
	 * @param int    $id   Album term ID.
	 * @return string
	 */
	private static function album_view( string $page, int $id ): string {
		// The whole album, page by page: a box set runs past one page of the route.
		$data = self::get(
			'/tracks',
			array(
				'album'    => $id,
				'per_page' => 100,
			)
		);
		$last = min( (int) $data['pages'], self::ALBUM_PAGES );
		for ( $number = 2; $number <= $last; $number++ ) {
			$more          = self::get(
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
			return self::albums_view( $page, 1 );
		}
		$artist = (string) get_term_meta( $id, 'riff_album_artist', true );
		$meta   = implode( ' · ', array_filter( array( $artist, self::count( (int) $data['total'] ) ) ) );
		return self::list_view( $term->name, $meta, $data, __( 'Album', 'riff' ), true, $id ) . self::more_by( $artist, $id, $page );
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
		$data   = self::get( '/albums', array( 'artist' => (int) $term->term_id ) );
		$others = array_values( array_filter( $data['items'], static fn( $a ) => (int) $a['id'] !== $album ) );
		if ( ! $others ) {
			return '';
		}
		return sprintf(
			'<section class="riff-more" aria-labelledby="riff-more-title"><h3 class="riff-more-title" id="riff-more-title"><a href="%s">%s</a></h3>%s</section>',
			esc_url( add_query_arg( self::ARTIST, (int) $term->term_id, $page ) ),
			/* translators: %s: artist name. */
			esc_html( sprintf( __( 'More by %s', 'riff' ), $artist ) ),
			self::album_grid( $others, $page )
		);
	}

	/**
	 * One artist, as the apps draw them: their picture and name with Play and Shuffle, their tracks
	 * newest first (until plays are counted, the newest stand in for the most played), ten at a
	 * time, then their albums.
	 *
	 * @since 4.16.0
	 * @since 4.19.0 Their picture, their latest tracks, and their albums.
	 *
	 * @param string $page   Listen page.
	 * @param int    $id     Artist term ID.
	 * @param int    $number Page of tracks.
	 * @return string
	 */
	private static function artist_view( string $page, int $id, int $number ): string {
		$data = self::get(
			'/tracks',
			array(
				'artist'   => $id,
				'orderby'  => 'added',
				'per_page' => 10,
				'page'     => $number,
			)
		);
		$term = get_term( $id );
		if ( ! $data['items'] || ! $term instanceof \WP_Term ) {
			return self::artists_view( $page, 1 );
		}
		$albums = self::get(
			'/albums',
			array(
				'artist'  => $id,
				'orderby' => 'added',
			)
		);
		// Their own picture, else their newest album's cover.
		$image = (int) get_term_meta( $id, 'riff_artist_image', true );
		$art   = $image ? Tracks::art( $image ) : (array) ( $albums['items'][0]['art'] ?? array() );
		$cover = $art ? (string) end( $art )['src'] : '';
		$meta  = array( self::count( (int) $data['total'] ) );
		if ( $albums['total'] ) {
			/* translators: %s: number of albums. */
			$meta[] = sprintf( _n( '%s album', '%s albums', (int) $albums['total'], 'riff' ), number_format_i18n( (int) $albums['total'] ) );
		}
		$html  = App::header( $term->name, implode( ' · ', $meta ), __( 'Artist', 'riff' ), $cover, Art::tint( $art ), true, 'artist', $id );
		$html .= '<h3 class="riff-app-section">' . esc_html__( 'Latest', 'riff' ) . '</h3>' . self::rows( $data['items'] ) . self::next( add_query_arg( self::ARTIST, $id, $page ), $data );
		if ( $albums['items'] ) {
			$html .= '<h3 class="riff-app-section">' . esc_html__( 'Albums', 'riff' ) . '</h3>' . self::album_grid( $albums['items'], $page );
		}
		return $html;
	}

	/**
	 * Search: the albums, artists and tracks that match.
	 *
	 * @param string $page   Listen page.
	 * @param string $search Words.
	 * @return string
	 */
	private static function search_view( string $page, string $search ): string {
		$albums  = self::get( '/albums', array( 'search' => $search ) );
		$artists = self::get( '/artists', array( 'search' => $search ) );
		$tracks  = self::get( '/tracks', array( 'search' => $search ) );
		/* translators: %s: the words searched for. */
		$html = Ui::title( sprintf( __( 'Results for “%s”', 'riff' ), $search ) );
		if ( ! $albums['items'] && ! $artists['items'] && ! $tracks['items'] ) {
			return $html . '<p class="riff-app-empty">' . esc_html__( 'Nothing matches that. Try fewer words, or part of a name.', 'riff' ) . '</p>';
		}
		if ( $albums['items'] ) {
			$html .= '<h3 class="riff-app-section">' . esc_html__( 'Albums', 'riff' ) . '</h3>' . self::album_grid( array_slice( $albums['items'], 0, 12 ), $page );
		}
		if ( $artists['items'] ) {
			$html .= '<h3 class="riff-app-section">' . esc_html__( 'Artists', 'riff' ) . '</h3>' . self::artist_list( array_slice( $artists['items'], 0, 12 ), $page );
		}
		if ( $tracks['items'] ) {
			$html .= '<h3 class="riff-app-section">' . esc_html__( 'Tracks', 'riff' ) . '</h3>' . self::rows( $tracks['items'] );
		}
		return $html;
	}

	/**
	 * A heading beside Play and Shuffle, then the tracks as rows.
	 *
	 * @param string $title Heading.
	 * @param string $meta  The line under it.
	 * @param array  $data  A /tracks response.
	 * @return string
	 * @param string $kind  What it is, above the title, or empty.
	 * @param bool   $album Whether it is an album: its cover leads, and its tracks are numbered.
	 * @param int    $id    The album's term ID, for its heart, or 0.
	 */
	private static function list_view( string $title, string $meta, array $data, string $kind = '', bool $album = false, int $id = 0 ): string {
		if ( ! $data['items'] ) {
			return Ui::title( $title ) . self::empty_note();
		}
		// An album leads with its cover and numbers its tracks; other lists show each track's art.
		$art  = $album && ! empty( $data['items'][0]['art'] ) ? (string) end( $data['items'][0]['art'] )['src'] : '';
		$tint = $album ? Art::tint( (array) ( $data['items'][0]['art'] ?? array() ) ) : '';
		return App::header( $title, $meta, $kind, $art, $tint, false, $id ? 'album' : '', $id ) . self::rows( $data['items'], $album );
	}

	/**
	 * Tracks as the rows a post shows: core audio blocks, which Riff marks and the script turns
	 * into rows, inside the holder Play and Shuffle read.
	 *
	 * @param array $tracks Tracks from the route.
	 * @return string
	 * @param bool  $numbered Whether to number the tracks, as an album does.
	 */
	public static function rows( array $tracks, bool $numbered = false ): string {
		// Each row is rendered as part of the post its track belongs to, so it takes that post's
		// artwork and names it as where it plays from, as it would in the post itself.
		global $post;
		$listen = $post;
		$rows   = '';
		foreach ( $tracks as $track ) {
			$parent = (int) ( $track['post']['id'] ?? 0 );
			$post   = $parent ? get_post( $parent ) : $listen; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- restored below.
			$rows  .= do_blocks(
				sprintf(
					'<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio -->',
					(int) $track['id'],
					esc_url( (string) $track['src'] )
				)
			);
		}
		$post = $listen; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- the Listen page again.
		return sprintf(
			'<div class="riff-album-tracks"%s data-riff-tracks="%s">%s</div>',
			$numbered ? ' data-riff-numbered' : '',
			esc_attr( (string) wp_json_encode( $tracks ) ),
			$rows
		);
	}

	/**
	 * "12 tracks".
	 *
	 * @param int $count Tracks.
	 * @return string
	 */
	public static function count( int $count ): string {
		/* translators: %s: number of tracks. */
		return sprintf( _n( '%s track', '%s tracks', $count, 'riff' ), number_format_i18n( $count ) );
	}

	/**
	 * What an empty list says. How to fill it is for someone who can upload, with a link to add the
	 * first album while the site has no music; a visitor, who can do neither, is told only that
	 * there is nothing yet.
	 *
	 * @return string
	 */
	private static function empty_note(): string {
		if ( ! current_user_can( 'upload_files' ) ) {
			return Ui::empty_note( __( 'Nothing here yet.', 'riff' ) );
		}
		$text = __( 'Nothing here yet. Upload music to the Media Library, or import a folder with wp riff import.', 'riff' );
		if ( ! First_Run::has_music() ) {
			return Ui::empty_note( $text, admin_url( 'media-new.php' ), __( 'Add your first album', 'riff' ) );
		}
		return Ui::empty_note( $text );
	}
}
