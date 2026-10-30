<?php
/**
 * The catalogue over REST: tracks, albums and artists from the Media Library, each searchable.
 *
 * @since 4.16.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * GET /riff/v1/tracks, /albums and /artists.
 *
 * A visitor sees a track unless the post it was uploaded to is unpublished or behind a password,
 * the rule WordPress's own media route follows; someone who can upload files sees the whole Media
 * Library.
 * Albums and artists are listed, and counted, by the tracks the requester can see, so nothing
 * private shows through a name or a count.
 */
final class Catalog_Rest {

	/**
	 * Tracks per page unless asked for fewer or more.
	 *
	 * @since 4.16.0
	 */
	public const PER_PAGE = 50;

	/**
	 * Albums or artists per page.
	 *
	 * @since 4.16.0
	 */
	public const TERMS_PER_PAGE = 48;

	/**
	 * The fewest characters a search looks for: one matches nearly every title and name, and would
	 * read them all to say so.
	 *
	 * @since 5.7.0
	 */
	private const SEARCH_MIN = 2;

	/**
	 * Hooks the routes.
	 *
	 * @since 4.16.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers the three routes.
	 *
	 * @since 4.16.0
	 */
	public static function routes(): void {
		$search  = array(
			'description' => __( 'Words to look for, at least two characters: a track matches on its title, artist or album; an album or artist on its name.', 'riff' ),
			'type'        => 'string',
			'default'     => '',
		);
		$page    = array(
			'description' => __( 'Page of results.', 'riff' ),
			'type'        => 'integer',
			'default'     => 1,
			'minimum'     => 1,
		);
		$include = array(
			'description' => __( 'Only these, by ID; what the requester cannot see is still left out.', 'riff' ),
			'type'        => 'array',
			'items'       => array(
				'type'    => 'integer',
				'minimum' => 1,
			),
			'default'     => array(),
		);
		/**
		 * GET /riff/v1/tracks: tracks from the Media Library by title, one album in its order, or
		 * one artist, searchable by title, artist and album, a page at a time.
		 *
		 * @since 4.16.0
		 * @since 4.20.0 Takes include, for a list of tracks by ID such as a listener's likes.
		 * @since 5.7.0 Takes after, and answers with next, to go on from where a page ended.
		 */
		register_rest_route(
			Library::REST,
			'/tracks',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_tracks' ),
					'permission_callback' => '__return_true',
					'args'                => array(
						'search'   => $search,
						'album'    => array(
							'description' => __( 'Only the tracks on this album, by term ID, in album order.', 'riff' ),
							'type'        => 'integer',
							'default'     => 0,
							'minimum'     => 0,
						),
						'artist'   => array(
							'description' => __( 'Only the tracks by this artist, by term ID.', 'riff' ),
							'type'        => 'integer',
							'default'     => 0,
							'minimum'     => 0,
						),
						'include'  => $include,
						'orderby'  => array(
							'description' => __( 'By title, the most recently added first, or in the order include names them. An album is always in album order.', 'riff' ),
							'type'        => 'string',
							'enum'        => array( 'title', 'added', 'include' ),
							'default'     => 'title',
						),
						'page'     => $page,
						'after'    => array(
							'description'       => __( 'Where the last page ended, as its next said: the page after it, which stays fast however deep into the library it is. By title or newest first, and not with album or include.', 'riff' ),
							'type'              => 'string',
							'default'           => '',
							'validate_callback' => static fn( $value ) => '' === $value || null !== self::cursor( (string) $value ) ? true : new WP_Error( 'rest_invalid_param', __( 'That is not where a page ended.', 'riff' ), array( 'status' => 400 ) ),
						),
						'per_page' => array(
							'description' => __( 'Tracks per page.', 'riff' ),
							'type'        => 'integer',
							'default'     => self::PER_PAGE,
							'minimum'     => 1,
							'maximum'     => 100,
						),
					),
				),
				'schema' => array( self::class, 'tracks_schema' ),
			)
		);
		/**
		 * GET /riff/v1/albums: albums with at least one track the requester can see, by name, each
		 * with its artist, artwork and track count, searchable by name.
		 *
		 * @since 4.16.0
		 * @since 4.20.0 Takes include.
		 */
		register_rest_route(
			Library::REST,
			'/albums',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => static fn( WP_REST_Request $request ) => self::rest_terms( $request, Catalog::ALBUM ),
					'permission_callback' => '__return_true',
					'args'                => array(
						'search'  => $search,
						'artist'  => array(
							'description' => __( 'Only the albums with a track by this artist, by term ID.', 'riff' ),
							'type'        => 'integer',
							'default'     => 0,
							'minimum'     => 0,
						),
						'include' => $include,
						'orderby' => array(
							'description' => __( 'By name, or the most recently added first.', 'riff' ),
							'type'        => 'string',
							'enum'        => array( 'name', 'added' ),
							'default'     => 'name',
						),
						'page'    => $page,
					),
				),
				'schema' => static fn() => self::terms_schema( Catalog::ALBUM ),
			)
		);
		/**
		 * GET /riff/v1/artists: artists with at least one track the requester can see, by name,
		 * each with a track count, searchable by name.
		 *
		 * @since 4.16.0
		 * @since 4.20.0 Takes include.
		 */
		register_rest_route(
			Library::REST,
			'/artists',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => static fn( WP_REST_Request $request ) => self::rest_terms( $request, Catalog::ARTIST ),
					'permission_callback' => '__return_true',
					'args'                => array(
						'search'  => $search,
						'include' => $include,
						'page'    => $page,
					),
				),
				'schema' => static fn() => self::terms_schema( Catalog::ARTIST ),
			)
		);
	}

	/**
	 * GET /tracks.
	 *
	 * @since 4.16.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_tracks( WP_REST_Request $request ): WP_REST_Response {
		$page     = max( 1, (int) $request['page'] );
		$per_page = min( 100, max( 1, (int) $request['per_page'] ) );
		$album    = (int) $request['album'];
		$artist   = (int) $request['artist'];
		$search   = trim( (string) $request['search'] );
		$added    = 'added' === $request['orderby'];
		if ( self::too_short( $search ) ) {
			return self::nothing( $page );
		}

		$args = array(
			'post_type'        => 'attachment',
			'post_mime_type'   => 'audio',
			'post_status'      => 'inherit',
			'posts_per_page'   => $per_page,
			'paged'            => $page,
			'orderby'          => array(
				'title' => 'ASC',
				'ID'    => 'ASC',
			),
			'suppress_filters' => false,
			'riff_catalog'     => true,
		);
		if ( $added ) {
			$args['orderby'] = array(
				'date' => 'DESC',
				'ID'   => 'DESC',
			);
		}
		$include = array_values( array_filter( array_map( 'intval', (array) $request['include'] ) ) );
		if ( $include ) {
			$args['post__in'] = $include;
			if ( 'include' === $request['orderby'] ) {
				$args['orderby'] = 'post__in';
			}
		}
		if ( $album ) {
			// An album's order is its track numbers', which live in each file's metadata, not in a
			// column SQL can sort by. So the whole album is read and sorted, and the page cut from
			// that: paging first would sort each page alone, and a box set of more than one page
			// would run 1, 10, 100. Only the IDs are read for that, in upload order, and the posts
			// only for the page that is returned.
			$args['posts_per_page']         = -1;
			$args['fields']                 = 'ids';
			$args['orderby']                = 'ID';
			$args['order']                  = 'ASC';
			$args['no_found_rows']          = true;
			$args['update_post_meta_cache'] = false;
			$args['update_post_term_cache'] = false;
			unset( $args['paged'] );
		}
		$tax = array();
		if ( $album ) {
			$tax[] = array(
				'taxonomy' => Catalog::ALBUM,
				'terms'    => $album,
			);
		}
		if ( $artist ) {
			$tax[] = array(
				'taxonomy' => Catalog::ARTIST,
				'terms'    => $artist,
			);
		}
		if ( $tax ) {
			$args['tax_query'] = $tax; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- the point of the route.
		}
		// By title or newest first, a page goes on from the last one's final track, by title or date
		// and then ID, rather than counting its way past every track before it; and one more than
		// the page is read, to know whether another follows. The total is counted on its own, and
		// kept.
		$keyset = ! $album && ! $include;
		$after  = $keyset ? self::cursor( (string) $request['after'] ) : null;
		if ( $keyset ) {
			$args['posts_per_page'] = $per_page + 1;
			$args['offset']         = $after ? 0 : ( $page - 1 ) * $per_page;
			$args['no_found_rows']  = true;
			unset( $args['paged'] );
		}

		$named = array();
		if ( '' !== $search ) {
			// Through WordPress's own search, on the title and as one phrase, as the route has always
			// matched; so a search plugin that answers WP_Query from an index of its own answers this.
			$args['s']              = $search;
			$args['sentence']       = true;
			$args['search_columns'] = array( 'post_title' );
			$named                  = self::names_holding( $search );
		}

		$where = self::visible_where();
		$from  = $after ? self::after_where( $after, $added ) : '';
		$scope = static function ( string $sql, \WP_Query $query ) use ( $where, $from ): string {
			if ( ! $query->get( 'riff_catalog' ) ) {
				return $sql;
			}
			return $sql . $where . ( $query->get( 'riff_count' ) ? '' : $from );
		};
		// Where WordPress searches its own tables, a track also matches by its album's or artist's
		// name: core's search, which starts " AND (", stands beside the tracks filed under them.
		$also = static function ( string $sql, \WP_Query $query ) use ( $named ): string {
			global $wpdb;
			if ( ! $query->get( 'riff_catalog' ) || '' === $sql || ! $named ) {
				return $sql;
			}
			$in = implode( ',', array_map( 'intval', $named ) );
			return " AND ( ( 1=1{$sql} ) OR {$wpdb->posts}.ID IN ( SELECT object_id FROM {$wpdb->term_relationships} WHERE term_taxonomy_id IN ( {$in} ) ) )";
		};
		add_filter( 'posts_where', $scope, 10, 2 );
		add_filter( 'posts_search', $also, 10, 2 );
		$query = new \WP_Query( $args );
		$total = $keyset ? self::total( $args, $where ) : (int) $query->found_posts;
		remove_filter( 'posts_where', $scope, 10 );
		remove_filter( 'posts_search', $also, 10 );

		$pages = $keyset ? (int) ceil( $total / $per_page ) : (int) $query->max_num_pages;
		$next  = '';
		if ( $album ) {
			// Upload order before title order: a file without a track number keeps its place in
			// the album as it was added, as an album's files usually are.
			$ids   = array_map( 'intval', $query->posts );
			$total = count( $ids );
			$pages = (int) ceil( $total / $per_page );
			update_meta_cache( 'post', $ids );
			$ids = array_slice( self::in_album_order( $ids ), ( $page - 1 ) * $per_page, $per_page );
		} else {
			$posts = array_slice( $query->posts, 0, $per_page );
			$ids   = wp_list_pluck( $posts, 'ID' );
			if ( $keyset && count( $query->posts ) > $per_page ) {
				$last = end( $posts );
				$next = self::cursor_for( $added ? (string) $last->post_date : (string) $last->post_title, (int) $last->ID );
			}
		}
		// The page's files, their posts and their artwork in a few queries, not a few for each.
		Tracks::prime( $ids );
		$items = array();
		foreach ( $ids as $id ) {
			$track = Tracks::from_attachment( (int) $id, (int) get_post_field( 'post_parent', $id ) );
			if ( $track ) {
				$items[] = $track;
			}
		}
		return new WP_REST_Response(
			array(
				'items' => $items,
				'page'  => $page,
				'pages' => $pages,
				'total' => $total,
				'next'  => $next,
			)
		);
	}

	/**
	 * How many tracks a list holds, counted without sorting it, and kept until a post or a term
	 * next changes.
	 *
	 * @param array  $args  The list's query.
	 * @param string $where What limits it, as appended to its WHERE: the requester's and the search's.
	 * @return int
	 */
	private static function total( array $args, string $where ): int {
		unset( $args['posts_per_page'], $args['offset'], $args['paged'], $args['orderby'], $args['order'] );
		$key   = 'tracks-total:' . md5( wp_json_encode( $args ) . $where ) . ':' . wp_cache_get_last_changed( 'posts' ) . ':' . wp_cache_get_last_changed( 'terms' );
		$total = wp_cache_get( $key, 'riff' );
		if ( false === $total ) {
			$count = new \WP_Query(
				array(
					'fields'                 => 'ids',
					'posts_per_page'         => 1,
					'orderby'                => 'none',
					'no_found_rows'          => false,
					'update_post_meta_cache' => false,
					'update_post_term_cache' => false,
					'riff_count'             => true,
				) + $args
			);
			$total = (int) $count->found_posts;
			wp_cache_set( $key, $total, 'riff', DAY_IN_SECONDS );
		}
		return (int) $total;
	}

	/**
	 * Where a page ended, as next gives it: the final track's title, or its date when newest come
	 * first, and its ID.
	 *
	 * @param string $value Title or date.
	 * @param int    $id    Attachment ID.
	 * @return string
	 */
	private static function cursor_for( string $value, int $id ): string {
		return rtrim( strtr( base64_encode( (string) wp_json_encode( array( $value, $id ) ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- an address-safe cursor, not hiding anything.
	}

	/**
	 * A cursor read back, or null for one this route didn't give.
	 *
	 * @param string $cursor Cursor.
	 * @return array|null `[ title or date, ID ]`.
	 */
	private static function cursor( string $cursor ): ?array {
		if ( '' === $cursor ) {
			return null;
		}
		$value = json_decode( (string) base64_decode( strtr( $cursor, '-_', '+/' ), true ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- the cursor above.
		if ( ! is_array( $value ) || 2 !== count( $value ) || ! is_string( $value[0] ?? null ) || ! is_int( $value[1] ?? null ) || $value[1] < 1 ) {
			return null;
		}
		return $value;
	}

	/**
	 * SQL for the tracks after a cursor, in the list's order.
	 *
	 * @param array $after `[ title or date, ID ]`.
	 * @param bool  $added Whether newest come first, by date.
	 * @return string
	 */
	private static function after_where( array $after, bool $added ): string {
		global $wpdb;
		[ $value, $id ] = $after;
		return $added
			? $wpdb->prepare( " AND ( {$wpdb->posts}.post_date < %s OR ( {$wpdb->posts}.post_date = %s AND {$wpdb->posts}.ID < %d ) )", $value, $value, $id )
			: $wpdb->prepare( " AND ( {$wpdb->posts}.post_title > %s OR ( {$wpdb->posts}.post_title = %s AND {$wpdb->posts}.ID > %d ) )", $value, $value, $id );
	}

	/**
	 * GET /albums and /artists: the terms with at least one track the requester can see, by name,
	 * each counted by those tracks.
	 *
	 * @since 4.16.0
	 *
	 * @param WP_REST_Request $request  Request.
	 * @param string          $taxonomy Catalog::ALBUM or Catalog::ARTIST.
	 * @return WP_REST_Response
	 */
	public static function rest_terms( WP_REST_Request $request, string $taxonomy ): WP_REST_Response {
		$page   = max( 1, (int) $request['page'] );
		$search = trim( (string) $request['search'] );
		if ( self::too_short( $search ) ) {
			return self::nothing( $page );
		}

		// WordPress keeps each term's count of files; only the few tracks a visitor may not see are
		// subtracted, so a page of albums never has to group the whole library.
		$hidden = self::hidden_by_term( $taxonomy );
		$gone   = array_keys( array_filter( $hidden, static fn( $h ) => $h['hidden'] >= $h['count'] ) );
		$query  = array(
			'taxonomy'   => $taxonomy,
			'hide_empty' => true,
			'orderby'    => 'name',
			'order'      => 'ASC',
			'exclude'    => $gone, // phpcs:ignore WordPressVIPMinimum.Performance.WPQueryParams.PostNotIn_exclude -- the few terms whose every track is hidden, from a list already in hand.
		);
		// An album's term is made when its first file is filed, so the newest terms are the albums
		// added most recently.
		if ( Catalog::ALBUM === $taxonomy && 'added' === $request['orderby'] ) {
			$query['orderby'] = 'term_id';
			$query['order']   = 'DESC';
		}
		if ( '' !== $search ) {
			$query['name__like'] = $search;
		}
		$include = array_values( array_filter( array_map( 'intval', (array) $request['include'] ) ) );
		if ( Catalog::ALBUM === $taxonomy && (int) $request['artist'] ) {
			$by      = self::albums_by( (int) $request['artist'] );
			$include = $include ? array_values( array_intersect( $include, $by ) ) : $by;
			$include = $include ? $include : array( 0 );
		}
		if ( $include ) {
			// WordPress drops exclude once include is given, so the terms whose every track is hidden
			// are taken out of include too; none left is none at all, not every term.
			$include          = array_values( array_diff( $include, $gone ) );
			$query['include'] = $include ? $include : array( 0 );
		}
		$total = (int) wp_count_terms( $query );
		$terms = get_terms(
			$query + array(
				'number' => self::TERMS_PER_PAGE,
				'offset' => ( $page - 1 ) * self::TERMS_PER_PAGE,
			)
		);
		return new WP_REST_Response(
			array(
				'items' => self::items( $taxonomy, is_array( $terms ) ? $terms : array(), $hidden ),
				'page'  => $page,
				'pages' => (int) ceil( $total / self::TERMS_PER_PAGE ),
				'total' => $total,
			)
		);
	}

	/**
	 * The albums or artists named, each as /albums or /artists lists it, all at once rather than a
	 * page at a time: those with no track the requester can see are left out, the rest in no order.
	 *
	 * @since 5.7.0
	 *
	 * @param string $taxonomy Catalog::ALBUM or Catalog::ARTIST.
	 * @param int[]  $ids      Term IDs.
	 * @return array[]
	 */
	public static function named( string $taxonomy, array $ids ): array {
		$ids = array_values( array_filter( array_map( 'intval', $ids ) ) );
		if ( ! $ids ) {
			return array();
		}
		$hidden = self::hidden_by_term( $taxonomy );
		// Without the terms whose every track is hidden, in include itself, as WordPress drops
		// exclude once include is given.
		$ids = array_values( array_diff( $ids, array_keys( array_filter( $hidden, static fn( $h ) => $h['hidden'] >= $h['count'] ) ) ) );
		if ( ! $ids ) {
			return array();
		}
		$terms = get_terms(
			array(
				'taxonomy'   => $taxonomy,
				'hide_empty' => true,
				'include'    => $ids,
			)
		);
		return self::items( $taxonomy, is_array( $terms ) ? $terms : array(), $hidden );
	}

	/**
	 * Albums or artists as the routes give them: each counted by the tracks the requester can see,
	 * and an album with its artist and the cover of its first track the requester can see.
	 *
	 * @param string  $taxonomy Catalog::ALBUM or Catalog::ARTIST.
	 * @param array   $terms    Terms.
	 * @param array[] $hidden   Hidden tracks by term, from hidden_by_term().
	 * @return array[]
	 */
	private static function items( string $taxonomy, array $terms, array $hidden ): array {
		global $wpdb;
		$rows = array();
		foreach ( $terms as $term ) {
			$rows[] = (object) array(
				'term_id' => $term->term_id,
				'name'    => Catalog::name( (string) $term->name ),
				'tracks'  => (int) $term->count - ( $hidden[ $term->term_id ]['hidden'] ?? 0 ),
				'first'   => 0,
			);
		}
		if ( Catalog::ALBUM === $taxonomy && $rows ) {
			// Each cover on the page comes from the album's first visible track, found in one query.
			$ids = array_map( static fn( $row ) => (int) $row->term_id, $rows );
			// No post has ID 0, so with nothing hidden NOT IN (0) leaves every track in.
			$skip = self::hidden_tracks();
			$skip = $skip ? $skip : array( 0 );
			$in   = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
			$not  = implode( ',', array_fill( 0, count( $skip ), '%d' ) );
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.DirectDatabaseQuery -- a placeholder for each ID.
			$first = $wpdb->get_results( $wpdb->prepare( "SELECT tt.term_id, MIN(tr.object_id) AS first FROM {$wpdb->term_relationships} tr INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id WHERE tt.taxonomy = %s AND tt.term_id IN ({$in}) AND tr.object_id NOT IN ({$not}) GROUP BY tt.term_id", array_merge( array( $taxonomy ), $ids, $skip ) ), OBJECT_K );
			foreach ( $rows as $row ) {
				$row->first = isset( $first[ $row->term_id ] ) ? (int) $first[ $row->term_id ]->first : 0;
			}
			// Load those tracks, their posts and their meta in a few queries rather than a few per album.
			Tracks::prime( array_map( static fn( $row ) => (int) $row->first, $rows ) );
			update_termmeta_cache( array_map( static fn( $row ) => (int) $row->term_id, $rows ) );
		}
		$items = array();
		foreach ( $rows as $row ) {
			$item = array(
				'id'    => (int) $row->term_id,
				'name'  => (string) $row->name,
				'count' => (int) $row->tracks,
			);
			if ( Catalog::ALBUM === $taxonomy ) {
				$item['artist'] = (string) get_term_meta( (int) $row->term_id, Catalog::ALBUM_ARTIST, true );
				// The first track's own artwork, or its post's; with neither, the cover Riff draws for
				// the album.
				$first       = Tracks::from_attachment( (int) $row->first, (int) get_post_field( 'post_parent', (int) $row->first ) );
				$item['art'] = Listen\Art::album_art( (int) $row->term_id, (array) ( $first['art'] ?? array() ) );
			}
			$items[] = $item;
		}
		return $items;
	}

	/**
	 * The albums with at least one track by an artist that the requester can see, in one query.
	 *
	 * @since 4.18.0
	 *
	 * @param int $artist Artist term ID.
	 * @return int[] Album term IDs.
	 */
	private static function albums_by( int $artist ): array {
		global $wpdb;
		$skip = self::hidden_tracks();
		$not  = count( $skip ) ? ' AND a.object_id NOT IN (' . implode( ',', array_fill( 0, count( $skip ), '%d' ) ) . ')' : '';
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber, WordPress.DB.DirectDatabaseQuery -- a placeholder for each ID, the hidden ones spread in.
		return array_map( 'intval', $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT tb.term_id FROM {$wpdb->term_relationships} a INNER JOIN {$wpdb->term_taxonomy} ta ON ta.term_taxonomy_id = a.term_taxonomy_id INNER JOIN {$wpdb->term_relationships} b ON b.object_id = a.object_id INNER JOIN {$wpdb->term_taxonomy} tb ON tb.term_taxonomy_id = b.term_taxonomy_id WHERE ta.taxonomy = %s AND ta.term_id = %d AND tb.taxonomy = %s{$not}", Catalog::ARTIST, $artist, Catalog::ALBUM, ...$skip ) ) );
	}

	/**
	 * The audio files the requester may not see: those uploaded to a post that is unpublished or
	 * behind a password. Usually a handful; none for someone who can upload files. The same for
	 * every visitor, so kept in the object cache until a post next changes.
	 *
	 * @return int[]
	 */
	private static function hidden_tracks(): array {
		global $wpdb;
		if ( current_user_can( 'upload_files' ) ) {
			return array();
		}
		$key    = 'hidden:' . wp_cache_get_last_changed( 'posts' );
		$hidden = wp_cache_get( $key, 'riff' );
		if ( ! is_array( $hidden ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a narrow lookup with no API, cached above.
			$hidden = array_map( 'intval', $wpdb->get_col( "SELECT a.ID FROM {$wpdb->posts} a INNER JOIN {$wpdb->posts} par ON par.ID = a.post_parent WHERE a.post_type = 'attachment' AND a.post_mime_type LIKE 'audio/%' AND ( par.post_status <> 'publish' OR par.post_password <> '' )" ) );
			wp_cache_set( $key, $hidden, 'riff', DAY_IN_SECONDS );
		}
		return $hidden;
	}

	/**
	 * How many hidden tracks each term holds, and its count of all its files, by term ID.
	 *
	 * @param string $taxonomy Taxonomy.
	 * @return array<int, array{hidden: int, count: int}>
	 */
	private static function hidden_by_term( string $taxonomy ): array {
		global $wpdb;
		$hidden = self::hidden_tracks();
		if ( ! $hidden ) {
			return array();
		}
		// Kept until a post or a term next changes, as the hidden files and the terms they are filed
		// under both come into it.
		$key  = 'hidden-by-term:' . $taxonomy . ':' . wp_cache_get_last_changed( 'posts' ) . ':' . wp_cache_get_last_changed( 'terms' );
		$kept = wp_cache_get( $key, 'riff' );
		if ( is_array( $kept ) ) {
			return $kept;
		}
		$in = implode( ',', array_fill( 0, count( $hidden ), '%d' ) );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.DirectDatabaseQuery -- a placeholder for each ID.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT tt.term_id, tt.count, COUNT(*) AS n FROM {$wpdb->term_relationships} tr INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id WHERE tt.taxonomy = %s AND tr.object_id IN ({$in}) GROUP BY tt.term_id, tt.count", array_merge( array( $taxonomy ), $hidden ) ) );
		$out  = array();
		foreach ( (array) $rows as $row ) {
			$out[ (int) $row->term_id ] = array(
				'hidden' => (int) $row->n,
				'count'  => (int) $row->count,
			);
		}
		wp_cache_set( $key, $out, 'riff', DAY_IN_SECONDS );
		return $out;
	}

	/**
	 * SQL limiting attachments to those the requester may see, appended to a WHERE clause that
	 * names the posts table plainly.
	 *
	 * @return string
	 */
	private static function visible_where(): string {
		global $wpdb;
		if ( current_user_can( 'upload_files' ) ) {
			return '';
		}
		// WordPress's own rule for media (WP_REST_Attachments_Controller): a file is public unless the
		// post it was uploaded to is not, so an unattached file is public. Riff also hides a file on a
		// post behind a password.
		// Each file's own post, by its key, rather than every public post gathered for each file.
		return " AND ( {$wpdb->posts}.post_parent = 0 OR EXISTS ( SELECT 1 FROM {$wpdb->posts} pp WHERE pp.ID = {$wpdb->posts}.post_parent AND pp.post_status = 'publish' AND pp.post_password = '' ) )";
	}

	/**
	 * Whether a user may see a track, by the rule GET /tracks follows: someone who can upload files
	 * sees every one, and anyone else those not uploaded to an unpublished or password-protected post.
	 *
	 * @since 4.20.1
	 *
	 * @param int      $id      Attachment ID.
	 * @param int|null $user_id User ID, or null for the current user.
	 * @return bool
	 */
	public static function visible( int $id, ?int $user_id = null ): bool {
		if ( user_can( $user_id ?? get_current_user_id(), 'upload_files' ) ) {
			return true;
		}
		$parent = (int) get_post_field( 'post_parent', $id );
		return ! $parent || ( 'publish' === get_post_status( $parent ) && '' === (string) get_post_field( 'post_password', $parent ) );
	}

	/**
	 * The albums and artists whose names hold the search words, as term taxonomy IDs, through
	 * get_terms(), which WordPress caches until a term changes.
	 *
	 * @param string $search Words.
	 * @return int[]
	 */
	private static function names_holding( string $search ): array {
		$found = get_terms(
			array(
				'taxonomy'   => array( Catalog::ALBUM, Catalog::ARTIST ),
				'name__like' => $search,
				'hide_empty' => false,
				'fields'     => 'tt_ids',
			)
		);
		return is_array( $found ) ? array_map( 'intval', $found ) : array();
	}

	/**
	 * Whether a search is too short to look for.
	 *
	 * @param string $search Words.
	 * @return bool
	 */
	private static function too_short( string $search ): bool {
		return '' !== $search && mb_strlen( $search ) < self::SEARCH_MIN;
	}

	/**
	 * A page with nothing on it, as a route answers a search too short to look for.
	 *
	 * @param int $page The page asked for.
	 * @return WP_REST_Response
	 */
	private static function nothing( int $page ): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'items' => array(),
				'page'  => $page,
				'pages' => 0,
				'total' => 0,
			)
		);
	}

	/**
	 * Tracks in album order: by track number when the tags have one, then by title as queried.
	 *
	 * @param int[] $ids Attachment IDs.
	 * @return int[]
	 */
	private static function in_album_order( array $ids ): array {
		$order = array_flip( $ids );
		$num   = array();
		foreach ( $ids as $id ) {
			$meta       = wp_get_attachment_metadata( (int) $id );
			$num[ $id ] = is_array( $meta ) && isset( $meta['track_number'] ) ? (int) $meta['track_number'] : PHP_INT_MAX;
		}
		usort( $ids, static fn( $a, $b ) => array( $num[ $a ], $order[ $a ] ) <=> array( $num[ $b ], $order[ $b ] ) );
		return $ids;
	}

	/**
	 * The shape of GET /tracks.
	 *
	 * @since 4.16.0
	 * @return array JSON Schema.
	 */
	public static function tracks_schema(): array {
		return array(
			'$schema'     => 'http://json-schema.org/draft-04/schema#',
			'title'       => 'riff-tracks',
			'description' => __( 'Tracks from the Media Library, by title, or one album in its order, or one artist; searchable by title, artist and album. A visitor sees every track except those uploaded to an unpublished or password-protected post; someone who can upload files sees them all.', 'riff' ),
			'type'        => 'object',
			'properties'  => array(
				'items' => array(
					'description' => __( 'Tracks, in the shape of the track schema.', 'riff' ),
					'type'        => 'array',
					'items'       => Tracks::schema(),
				),
				'page'  => array( 'type' => 'integer' ),
				'pages' => array( 'type' => 'integer' ),
				'total' => array( 'type' => 'integer' ),
				'next'  => array(
					'description' => __( 'Where this page ended, to pass as after for the next; empty when this is the last, or for an album or include.', 'riff' ),
					'type'        => 'string',
				),
			),
		);
	}

	/**
	 * The shape of GET /albums or /artists.
	 *
	 * @since 4.16.0
	 *
	 * @param string $taxonomy Catalog::ALBUM or Catalog::ARTIST.
	 * @return array JSON Schema.
	 */
	public static function terms_schema( string $taxonomy ): array {
		$item = array(
			'id'    => array(
				'description' => __( 'Term ID.', 'riff' ),
				'type'        => 'integer',
			),
			'name'  => array( 'type' => 'string' ),
			'count' => array(
				'description' => __( 'Tracks the requester can see.', 'riff' ),
				'type'        => 'integer',
			),
		);
		if ( Catalog::ALBUM === $taxonomy ) {
			$item['artist'] = array(
				'description' => __( 'The album\'s artist, or empty.', 'riff' ),
				'type'        => 'string',
			);
			$item['art']    = array(
				'description' => __( 'The album\'s first track\'s artwork as the player shows it, as { src, sizes }.', 'riff' ),
				'type'        => 'array',
			);
		}
		return array(
			'$schema'     => 'http://json-schema.org/draft-04/schema#',
			'title'       => Catalog::ALBUM === $taxonomy ? 'riff-albums' : 'riff-artists',
			'description' => Catalog::ALBUM === $taxonomy
				? __( 'Albums with at least one track the requester can see, by name, each with its artist, artwork and track count.', 'riff' )
				: __( 'Artists with at least one track the requester can see, by name, each with a track count.', 'riff' ),
			'type'        => 'object',
			'properties'  => array(
				'items' => array(
					'type'  => 'array',
					'items' => array(
						'type'       => 'object',
						'properties' => $item,
					),
				),
				'page'  => array( 'type' => 'integer' ),
				'pages' => array( 'type' => 'integer' ),
				'total' => array( 'type' => 'integer' ),
			),
		);
	}
}
