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
	 * Every query argument a browse view uses, for the script to recognise its own addresses.
	 *
	 * @since 4.16.0
	 * @since 4.20.0 Your Library's filter and sort.
	 */
	public const ARGS = array( self::VIEW, self::ALBUM, self::ARTIST, self::SEARCH, self::FILTER, self::SORT );

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
		// phpcs:enable
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
		$here  = array( 'album' => 'albums', 'artist' => 'artists' )[ $here ] ?? $here; // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
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
		return $html;
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
	 * A heading, focusable so the script can move focus to a new view.
	 *
	 * @param string $text Heading.
	 * @return string
	 */
	public static function title( string $text ): string {
		return '<h2 class="riff-app-title" tabindex="-1">' . esc_html( $text ) . '</h2>';
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
			return self::title( __( 'Albums', 'riff' ) ) . self::empty_note();
		}
		return self::title( __( 'Albums', 'riff' ) ) . self::album_grid( $data['items'], $page ) . self::next( add_query_arg( self::VIEW, 'albums', $page ), $data );
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
			$art    = $album['art'] ? end( $album['art'] )['src'] : '';
			$sub    = array_filter( array( $album['artist'] ?? '', self::count( (int) $album['count'] ) ) );
			$cards .= sprintf(
				'<div class="riff-card" data-riff-album="%1$d"><span class="riff-card-art">%2$s<button type="button" class="riff-card-play" data-riff-app-action="play-album" data-riff-album="%1$d" aria-label="%3$s"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></span><a class="riff-card-link" href="%4$s"><span class="riff-card-title">%5$s</span></a><span class="riff-card-sub">%6$s</span></div>',
				(int) $album['id'],
				$art ? '<img src="' . esc_url( $art ) . '" alt="" loading="lazy" decoding="async">' : '',
				/* translators: %s: album name. */
				esc_attr( sprintf( __( 'Play %s', 'riff' ), $album['name'] ) ),
				esc_url( add_query_arg( self::ALBUM, (int) $album['id'], $page ) ),
				esc_html( $album['name'] ),
				esc_html( implode( ' · ', $sub ) )
			);
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
			return self::title( __( 'Artists', 'riff' ) ) . self::empty_note();
		}
		return self::title( __( 'Artists', 'riff' ) ) . self::artist_list( $data['items'], $page ) . self::next( add_query_arg( self::VIEW, 'artists', $page ), $data );
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
	 * Home: rows that scroll sideways, as the apps open. What was played comes from this device,
	 * so those two rows are left for the script to fill; the rest renders here.
	 *
	 * @since 4.18.0
	 *
	 * @param string $page Listen page.
	 * @return string
	 */
	public static function home_view( string $page ): string {
		$albums  = self::get( '/albums', array( 'orderby' => 'added' ) );
		$artists = self::get( '/artists' );
		$posts   = App::post_cards( $page );
		if ( ! $albums['items'] && ! $artists['items'] && '' === $posts ) {
			return self::title( __( 'Home', 'riff' ) ) . self::empty_note();
		}
		$html  = self::title( __( 'Home', 'riff' ) );
		$html .= self::shelf( 'jump', __( 'Jump back in', 'riff' ), '', '', true );
		$html .= self::shelf( 'recent', __( 'Recently played', 'riff' ), '', '', true );
		if ( $albums['items'] ) {
			$html .= self::shelf( 'added', __( 'Recently added', 'riff' ), add_query_arg( self::VIEW, 'albums', $page ), self::album_cards( $albums['items'], $page ) );
		}
		if ( $artists['items'] ) {
			$html .= self::shelf( 'artists', __( 'Artists', 'riff' ), add_query_arg( self::VIEW, 'artists', $page ), self::artist_items( $artists['items'], $page ), false, 'ul' );
		}
		if ( '' !== $posts ) {
			$html .= self::shelf( 'posts', __( 'New posts', 'riff' ), add_query_arg( self::VIEW, 'posts', $page ), $posts );
		}
		return $html;
	}

	/**
	 * One row of Home: a heading, a Show all link, and items that scroll sideways.
	 *
	 * @param string $slug   The row's name, for the script and the styles.
	 * @param string $title  Heading.
	 * @param string $all    Show all's address, or empty for none.
	 * @param string $items  The row's items.
	 * @param bool   $device Whether the script fills it from this device; hidden until it does.
	 * @param string $tag    The row's element: div for cards, ul for list items.
	 * @return string
	 */
	public static function shelf( string $slug, string $title, string $all, string $items, bool $device = false, string $tag = 'div' ): string {
		$id = 'riff-shelf-' . $slug;
		return sprintf(
			'<section class="riff-shelf" data-riff-shelf="%1$s" aria-labelledby="%2$s"%3$s><div class="riff-shelf-head"><h3 class="riff-shelf-title" id="%2$s">%4$s</h3>%5$s</div><%6$s class="riff-shelf-row" tabindex="0" aria-labelledby="%2$s">%7$s</%6$s></section>',
			esc_attr( $slug ),
			esc_attr( $id ),
			$device ? ' hidden' : '',
			esc_html( $title ),
			'' !== $all ? '<a class="riff-shelf-all" href="' . esc_url( $all ) . '">' . esc_html__( 'Show all', 'riff' ) . '</a>' : '',
			'ul' === $tag ? 'ul' : 'div',
			$items
		);
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
		$data = self::get(
			'/tracks',
			array(
				'album'    => $id,
				'per_page' => 100,
			)
		);
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
		$html = self::title( sprintf( __( 'Results for “%s”', 'riff' ), $search ) );
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
			return self::title( $title ) . self::empty_note();
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
	 * What an empty list says.
	 *
	 * @return string
	 */
	private static function empty_note(): string {
		return '<p class="riff-app-empty">' . esc_html__( 'Nothing here yet. Upload music to the Media Library, or import a folder with wp riff import.', 'riff' ) . '</p>';
	}
}
