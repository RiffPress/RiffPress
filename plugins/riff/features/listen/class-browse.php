<?php
/**
 * Browsing the Media Library inside the Listen block: albums, artists, tracks and search.
 *
 * @since 4.16.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_REST_Request;
use WP_User;

use Riff\Catalog;
use Riff\Catalog_Rest;
use Riff\Library;
use Riff\Player;
use Riff\Private_Site;
use Riff\Registry;
use Riff\Tracks;

defined( 'ABSPATH' ) || exit;

/**
 * The browse views: which one an address asks for, the navigation above every view, and what the
 * views share. Each view is a class of its own (Home_View, Albums_View, Album_View and the rest).
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
	 * Every query argument a browse view uses, for the script to recognise its own addresses.
	 *
	 * @since 4.16.0
	 * @since 4.20.0 Your Library's filter and sort, and a playlist.
	 */
	public const ARGS = array( self::VIEW, self::ALBUM, self::ARTIST, self::SEARCH, self::FILTER, self::SORT, self::PLAYLIST );

	/**
	 * The icon from Player::icon() beside each label in the sidebar.
	 */
	private const ICONS = array(
		'home'    => 'home',
		'search'  => 'search',
		'albums'  => 'record',
		'artists' => 'person',
		'tracks'  => 'queue',
		'posts'   => 'posts',
		'library' => 'albums',
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
			return array( 'view' => 'playlist', 'id' => (int) $list, 'search' => '', 'page' => $page ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		if ( ctype_digit( $album ) && (int) $album > 0 ) {
			return array( 'view' => 'album', 'id' => (int) $album, 'search' => '', 'page' => $page ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		if ( ctype_digit( $artist ) && (int) $artist > 0 ) {
			return array( 'view' => 'artist', 'id' => (int) $artist, 'search' => '', 'page' => $page ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		// Search with words is their results; without them, the Search tab's own view.
		if ( '' !== $search || 'search' === $view ) {
			return array( 'view' => 'search', 'id' => 0, 'search' => $search, 'page' => 1 ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		// Riff's own lists, and a plugin's views (Views), each while the visitor may see it.
		if ( '' !== $view && ! in_array( $view, array( 'home', 'search' ), true ) && Views::has( $view ) ) {
			return array( 'view' => $view, 'id' => 0, 'search' => '', 'page' => $page ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		}
		// The posts grid lived at the page's own address before Home did; a link to one of its
		// later pages still opens it.
		if ( $page > 1 && Views::has( 'posts' ) ) {
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
		$here = $current['view'] ?? 'home';
		$here = array( 'album' => 'albums', 'artist' => 'artists', 'playlist' => 'library' )[ $here ] ?? $here; // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		// Home, Search on a phone, the lists and a plugin's views, then Library (Views::all()). Search
		// is a tab of its own only on a phone, at the bottom with Home and Library, as the apps have
		// it; wider, the field is always in view.
		$links = array();
		foreach ( Views::all() as $slug => $listed ) {
			if ( in_array( 'sidebar', $listed['nav'], true ) || in_array( $slug, Views::KEPT, true ) ) {
				$links[ $slug ] = array( $listed['label'], 'home' === $slug ? $page : add_query_arg( self::VIEW, $slug, $page ), $listed );
			}
		}
		// The site's name heads the sidebar, and a phone's top row; as tabs it is hidden. The brand
		// carries the view showing, which the tabs alone cannot say (an album marks Albums), so a
		// phone can keep its chips to the lists.
		$name = wp_strip_all_tags( (string) get_bloginfo( 'name' ) );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- which view is showing; nothing changes.
		$view = $current['view'] ?? ( empty( $_GET[ App::QUERY ] ) ? 'home' : 'post' );
		$html = sprintf(
			'<span class="riff-app-brand" data-riff-view="%s"><button type="button" class="riff-app-collapse" data-riff-app-action="sidebar" aria-expanded="true" aria-label="%s">' . Player::icon( 'menu' ) . '</button><span class="riff-app-name">%s</span>%s</span>',
			esc_attr( $view ),
			esc_attr__( 'Sidebar', 'riff' ),
			esc_html( '' !== $name ? $name : riff_brand()['name'] ),
			self::private_site() // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in Ui::private_mark().
		);
		foreach ( $links as $slug => list( $label, $href, $listed ) ) {
			$html .= sprintf(
				'<a class="riff-app-tab%s" href="%s"%s>%s<span>%s</span></a>',
				array( 'home' => ' riff-app-home', 'search' => ' riff-app-tab-search', 'library' => ' riff-app-tab-library' )[ $slug ] ?? '', // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
				esc_url( $href ),
				$slug === $here ? ' aria-current="page"' : '',
				$listed['own'] && isset( self::ICONS[ $slug ] ) ? Player::icon( self::ICONS[ $slug ] ) : Views::icon( $listed ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Riff's own markup, or the plugin's SVG through wp_kses().
				esc_html( $label )
			);
		}
		// Your Library under the views, in the sidebar, and at its foot the dock for the player's
		// views that live there (Registry::dock()). Only standalone mode's sidebar shows them; as
		// tabs there is no room, and the player opens those views as panels instead.
		if ( Standalone::active() ) {
			$html .= Collection::sidebar( $page, $current ) . Standalone::install_card() . Registry::dock();
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
	 * picture, which opens their name, Your Library, their profile and Log out; a visitor gets
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
		// The listener's face, when the site shows avatars and they have one; otherwise the name's
		// first letter, as an artist's, rather than Gravatar's grey silhouette.
		$src  = get_option( 'show_avatars' ) ? self::face( $user ) : '';
		$face = $src
			? sprintf( '<img class="riff-app-avatar" src="%s" alt="" width="32" height="32" decoding="async">', esc_url( (string) $src ) )
			: sprintf( '<span class="riff-app-avatar riff-app-initial" aria-hidden="true">%s</span>', esc_html( mb_strtoupper( mb_substr( $name, 0, 1 ) ) ) );
		// A plugin's views listed in the account menu, after Your Library. One the sidebar lists
		// too is marked, so the menu leaves it out while the sidebar shows (standalone.css).
		$more = '';
		foreach ( Views::all() as $slug => $listed ) {
			if ( ! $listed['own'] && in_array( 'account', $listed['nav'], true ) ) {
				$more .= sprintf(
					'<a href="%s"%s>%s</a>',
					esc_url( add_query_arg( self::VIEW, $slug, $page ) ),
					in_array( 'sidebar', $listed['nav'], true ) ? ' data-riff-in-sidebar' : '',
					esc_html( $listed['label'] )
				);
			}
		}
		$add = self::add_music_url( $page );
		// Edit profile, unless the host has no profile page: an empty riff_profile_url hides it.
		$profile = self::profile_url( $user );
		return sprintf(
			'<details class="riff-app-account"><summary aria-label="%1$s">%2$s</summary><div class="riff-app-account-menu"><p class="riff-app-account-name">%3$s</p><a href="%4$s" data-riff-in-sidebar>%5$s</a>%9$s%8$s%6$s<a href="%7$s">%10$s</a></div></details>',
			/* translators: %s: the signed-in listener's name. */
			esc_attr( sprintf( __( 'Account: %s', 'riff' ), $name ) ),
			$face,
			esc_html( $name ),
			esc_url( add_query_arg( self::VIEW, 'library', $page ) ),
			esc_html__( 'Your Library', 'riff' ),
			'' !== $profile ? sprintf( '<a href="%s">%s</a>', esc_url( $profile ), esc_html__( 'Edit profile', 'riff' ) ) : '',
			esc_url( wp_logout_url( $back ) ),
			// Add music, unless it leads to a view the menu already lists.
			current_user_can( 'upload_files' ) && ! str_contains( $more, 'href="' . esc_url( $add ) . '"' ) ? sprintf( '<a href="%s">%s</a>', esc_url( $add ), esc_html__( 'Add music', 'riff' ) ) : '',
			$more,
			esc_html__( 'Log out', 'riff' )
		);
	}

	/**
	 * Where the account menu's Edit profile goes; empty when the menu should not show it.
	 *
	 * @since 6.4.0
	 *
	 * @param \WP_User $user The signed-in listener.
	 * @return string
	 */
	public static function profile_url( \WP_User $user ): string {
		/**
		 * Filters where the Listen app's account menu sends a listener to edit their profile, for a
		 * host or a membership plugin with a profile page of its own. An empty string hides Edit
		 * profile, for a host with no profile page.
		 *
		 * @since 6.4.0
		 * @since 6.5.1 An empty string hides the link.
		 *
		 * @param string   $url  The address, or '' to leave Edit profile out of the menu. Default get_edit_profile_url(), their profile in wp-admin.
		 * @param \WP_User $user The signed-in listener.
		 */
		return (string) apply_filters( 'riff_profile_url', get_edit_profile_url( $user->ID ), $user );
	}

	/**
	 * Where the Listen app's Add music links go: the account menu's, and an empty library's.
	 *
	 * @since 6.4.0
	 *
	 * @param string $page The app's address; the one showing by default.
	 * @return string
	 */
	public static function add_music_url( string $page = '' ): string {
		/**
		 * Filters where the Listen app sends someone who may upload to add music: the account
		 * menu's Add music, and Add your first album in an empty library.
		 *
		 * The slug of one of the app's views (riff_app_views) leads to that view, inside the app.
		 * At the default address the app opens its own file picker in place of following the link,
		 * and uploads what is chosen to the Media Library; at any other address the link is
		 * followed, and the empty library no longer names the Media Library.
		 *
		 * @since 6.4.0
		 *
		 * @param string $url The address, or a view's slug. Default admin_url( 'media-new.php' ).
		 */
		$url = (string) apply_filters( 'riff_add_music_url', admin_url( 'media-new.php' ) );
		if ( preg_match( '/^[a-z0-9-]+$/', $url ) && Views::has( $url ) ) {
			if ( '' === $page ) {
				$page = Standalone::active() ? Standalone::url() : (string) get_permalink();
			}
			return add_query_arg( self::VIEW, $url, $page );
		}
		return $url;
	}

	/**
	 * The listener's own avatar, or '' when they have none. An avatar plugin's answer is taken as
	 * it is; a Gravatar address is asked once, with d=404, whether a face is there, and the answer
	 * kept for a day. Keyed by the address, so a new email asks again.
	 *
	 * @since 4.23.0
	 *
	 * @param WP_User $user The listener.
	 * @return string
	 */
	public static function face( WP_User $user ): string {
		$data = get_avatar_data(
			$user->ID,
			array(
				'size'    => 64,
				'default' => '404',
			)
		);
		$url  = (string) ( $data['url'] ?? '' );
		if ( '' === $url || ! preg_match( '#^https?://([a-z0-9-]+\.)*gravatar\.com/#i', $url ) ) {
			return $url;
		}
		$key = 'riff_gravatar_' . md5( $url );
		$has = get_transient( $key );
		if ( false === $has ) {
			$response = wp_safe_remote_head( $url, array( 'timeout' => 2 ) );
			$code     = wp_remote_retrieve_response_code( $response );
			$has      = 200 === $code ? 'yes' : 'no';
			// A failed request is asked again within the hour, not taken as no face for a day.
			set_transient( $key, $has, is_wp_error( $response ) || ( 404 !== $code && 200 !== $code ) ? HOUR_IN_SECONDS : DAY_IN_SECONDS );
		}
		return 'yes' === $has ? $url : '';
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
				return Albums_View::view( $page, $current['page'] );
			case 'artists':
				return Artists_View::view( $page, $current['page'] );
			case 'tracks':
				return Tracks_View::view( $page, $current['page'] );
			case 'posts':
				return App::posts_view( $page );
			case 'library':
				return Collection::view( $page );
			case 'playlist':
				return Playlist_View::view( $page, $current['id'], $current['page'] );
			case 'album':
				return Album_View::view( $page, $current['id'], $current['page'] );
			case 'artist':
				return Artist_View::view( $page, $current['id'], $current['page'] );
			case 'search':
				return Search_View::view( $page, $current['search'] );
			default:
				return Views::render( (string) $current['view'], $page );
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
	 * Where a list one page of which is drawn goes on: its route with the arguments that drew it,
	 * the page drawn and how many there are. Play and Shuffle, and a row pressed, play on into
	 * the pages after it as the queue nears its end.
	 *
	 * @param string $route The route, as for get().
	 * @param array  $args  Its arguments, without the page.
	 * @param array  $data  The route's response for the page drawn.
	 * @return array `{ url, page, pages, per_page }`.
	 */
	public static function more( string $route, array $args, array $data ): array {
		unset( $args['page'] );
		return array(
			'url'      => add_query_arg( $args, rest_url( Library::REST . $route ) ),
			'page'     => max( 1, (int) $data['page'] ),
			'pages'    => max( 1, (int) $data['pages'] ),
			'per_page' => (int) ( $args['per_page'] ?? Catalog_Rest::PER_PAGE ),
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
	 * Album cards, each opening the album and playing it from its cover.
	 *
	 * @param array  $albums Albums from the route.
	 * @param string $page   Listen page.
	 * @return string
	 */
	public static function album_grid( array $albums, string $page ): string {
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
	 * Artists as a list of links with their track counts.
	 *
	 * @param array  $artists Artists from the route.
	 * @param string $page    Listen page.
	 * @return string
	 */
	public static function artist_list( array $artists, string $page ): string {
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
	 * A heading beside Play and Shuffle, then the tracks as rows.
	 *
	 * @param string       $title Heading.
	 * @param string|array $meta  The line under it, or its parts, as App::header() takes it.
	 * @param array        $data  A /tracks response.
	 * @return string
	 * @param string       $kind  What it is, above the title, or empty.
	 * @param bool         $album Whether it is an album: its cover leads, and its tracks are numbered.
	 * @param int          $id    The album's term ID, for its heart, or 0.
	 * @param array        $more  For one page of a longer list, where it goes on, from more().
	 * @param string       $extra More after Play and Shuffle, as App::header() takes it.
	 */
	public static function list_view( string $title, string|array $meta, array $data, string $kind = '', bool $album = false, int $id = 0, array $more = array(), string $extra = '' ): string {
		if ( ! $data['items'] ) {
			return Ui::title( $title ) . self::empty_note();
		}
		// An album leads with its cover and numbers its tracks; other lists show each track's art.
		$cover = $album ? (array) ( $data['items'][0]['art'] ?? array() ) : array();
		if ( $album && $id ) {
			$cover = Art::album_art( $id, $cover );
		}
		$tint = $album ? Art::tint( $cover ) : '';
		return App::header( $title, $meta, $kind, $cover, $tint, false, $id ? 'album' : '', $id, array(), $extra ) . self::rows( $data['items'], $album, false, $more );
	}

	/**
	 * Tracks as the rows a post shows: core audio blocks, which Riff marks and the script turns
	 * into rows, inside the holder Play and Shuffle read.
	 *
	 * @param array $tracks   Tracks from the route.
	 * @param bool  $numbered Whether to number the tracks, as an album does.
	 * @param bool  $heads    Whether to head the rows with the columns' names when they are not
	 *                        numbered, as Liked songs does: an empty head over the art.
	 * @param array $more     For one page of a longer list, where it goes on, from more(). Then
	 *                        Play and Shuffle read the list from there rather than from the page.
	 * @return string
	 */
	public static function rows( array $tracks, bool $numbered = false, bool $heads = false, array $more = array() ): string {
		// Each row is rendered as part of the post its track belongs to, so it takes that post's
		// artwork and names it as where it plays from, as it would in the post itself. A track in no
		// post is rendered in none, as the tracks route has it, not as part of the Listen page.
		global $post;
		$listen = $post;
		$rows   = '';
		foreach ( $tracks as $track ) {
			$parent = (int) ( $track['post']['id'] ?? 0 );
			$post   = $parent ? get_post( $parent ) : null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- restored below.
			$rows  .= do_blocks(
				sprintf(
					'<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio -->',
					(int) $track['id'],
					esc_url( (string) $track['src'] )
				)
			);
		}
		$post = $listen; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- the Listen page again.
		// Over an album's tracks, the usual column heads: #, Title and a clock. They only
		// label what each row already says, so a screen reader is not told them again.
		$head = $numbered || $heads ? sprintf(
			'<div class="riff-tracks-head" aria-hidden="true"><span>%s</span><span>%s</span>' . Player::icon( 'scheduled' ) . '</div>',
			$numbered ? '#' : '',
			esc_html__( 'Title', 'riff' )
		) : '';
		// A later page of an album numbers on from the pages before it.
		$start = $numbered && $more ? ( max( 1, (int) $more['page'] ) - 1 ) * (int) ( $more['per_page'] ?? 0 ) : 0;
		return $head . sprintf(
			'<div class="riff-album-tracks"%s%s %s="%s">%s</div>',
			$numbered ? ' data-riff-numbered' : '',
			$start > 0 ? sprintf( ' style="counter-reset:riff-track %d"', $start ) : '',
			$more ? 'data-riff-more' : 'data-riff-tracks',
			esc_attr( (string) wp_json_encode( $more ? $more : $tracks ) ),
			$rows
		);
	}

	/**
	 * A private site's one mark, beside its name, in place of a mark on everything in it: where
	 * only members reach the site, each item being private to the public says nothing. A post
	 * that is private as well is still marked, as it is hidden from the members too. Only those
	 * who reach the site see it, and only signed in, which a private site asks of everyone. For
	 * someone who may change it, it links to the setting.
	 *
	 * @return string
	 */
	private static function private_site(): string {
		if ( ! Private_Site::on() || ! is_user_logged_in() ) {
			return '';
		}
		return Ui::private_mark( true, current_user_can( 'manage_options' ) ? admin_url( 'options-reading.php' ) : '' );
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
	public static function empty_note(): string {
		if ( ! current_user_can( 'upload_files' ) ) {
			return Ui::empty_note( __( 'Nothing here yet.', 'riff' ) );
		}
		$url  = self::add_music_url();
		$text = admin_url( 'media-new.php' ) === $url
			? __( 'Nothing here yet. Upload music to the Media Library and it shows here.', 'riff' )
			: __( 'Nothing here yet. Add music and it shows here.', 'riff' );
		if ( ! First_Run::has_music() ) {
			return Ui::empty_note( $text, $url, __( 'Add your first album', 'riff' ) );
		}
		return Ui::empty_note( $text );
	}
}
