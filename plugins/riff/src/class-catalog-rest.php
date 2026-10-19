<?php
/**
 * The catalogue over REST: tracks, albums and artists from the Media Library, each searchable.
 *
 * @since 4.16.0
 * @package Riff
 */

namespace Riff;

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
			'description' => __( 'Words to look for: a track matches on its title, artist or album; an album or artist on its name.', 'riff' ),
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
		if ( 'added' === $request['orderby'] ) {
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

		$where = self::visible_where();
		$match = '' !== $search ? self::search_where( $search ) : '';
		$scope = static function ( string $sql, \WP_Query $query ) use ( $where, $match ): string {
			return $query->get( 'riff_catalog' ) ? $sql . $where . $match : $sql;
		};
		add_filter( 'posts_where', $scope, 10, 2 );
		$query = new \WP_Query( $args );
		remove_filter( 'posts_where', $scope, 10 );

		$ids = wp_list_pluck( $query->posts, 'ID' );
		if ( $album ) {
			// Upload order before title order: a file without a track number keeps its place in
			// the album as it was added, as an album's files usually are.
			sort( $ids );
			$ids = self::in_album_order( $ids );
		}
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
				'pages' => (int) $query->max_num_pages,
				'total' => (int) $query->found_posts,
			)
		);
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
		global $wpdb;
		$page   = max( 1, (int) $request['page'] );
		$search = trim( (string) $request['search'] );

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
			$query['include'] = $include;
		}
		$total = (int) wp_count_terms( $query );
		$terms = get_terms(
			$query + array(
				'number' => self::TERMS_PER_PAGE,
				'offset' => ( $page - 1 ) * self::TERMS_PER_PAGE,
			)
		);
		$terms = is_array( $terms ) ? $terms : array();
		$rows  = array();
		foreach ( $terms as $term ) {
			$rows[] = (object) array(
				'term_id' => $term->term_id,
				'name'    => $term->name,
				'tracks'  => (int) $term->count - ( $hidden[ $term->term_id ]['hidden'] ?? 0 ),
				'first'   => 0,
			);
		}
		if ( Catalog::ALBUM === $taxonomy && $rows ) {
			// Each cover on the page comes from the album's first visible track, found in one query.
			$ids  = array_map( static fn( $row ) => (int) $row->term_id, $rows );
			$skip = self::hidden_tracks();
			$in   = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
			$not  = count( $skip ) ? ' AND tr.object_id NOT IN (' . implode( ',', array_fill( 0, count( $skip ), '%d' ) ) . ')' : '';
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.DirectDatabaseQuery -- a placeholder for each ID.
			$first = $wpdb->get_results( $wpdb->prepare( "SELECT tt.term_id, MIN(tr.object_id) AS first FROM {$wpdb->term_relationships} tr INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id WHERE tt.taxonomy = %s AND tt.term_id IN ({$in}){$not} GROUP BY tt.term_id", array_merge( array( $taxonomy ), $ids, $skip ) ), OBJECT_K );
			foreach ( $rows as $row ) {
				$row->first = isset( $first[ $row->term_id ] ) ? (int) $first[ $row->term_id ]->first : 0;
			}
			// Load those tracks, their posts and their meta in a few queries rather than a few per album.
			$firsts = array_filter( array_map( static fn( $row ) => (int) $row->first, $rows ) );
			_prime_post_caches( $firsts, false, true );
			$parents = array_filter( array_map( static fn( $id ) => (int) get_post_field( 'post_parent', $id ), $firsts ) );
			_prime_post_caches( $parents, false, true );
			$thumbs = array_filter( array_map( static fn( $id ) => (int) get_post_thumbnail_id( $id ), array_merge( $firsts, $parents ) ) );
			_prime_post_caches( $thumbs, false, true );
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
				// The first track's artwork as the player shows it: its own, else its post's, else the
				// cover Riff draws for the post.
				$first       = Tracks::from_attachment( (int) $row->first, (int) get_post_field( 'post_parent', (int) $row->first ) );
				$item['art'] = $first['art'] ?? array();
			}
			$items[] = $item;
		}
		return new WP_REST_Response(
			array(
				'items' => $items,
				'page'  => $page,
				'pages' => (int) ceil( $total / self::TERMS_PER_PAGE ),
				'total' => $total,
			)
		);
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
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.DirectDatabaseQuery -- a placeholder for each ID.
		return array_map( 'intval', $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT tb.term_id FROM {$wpdb->term_relationships} a INNER JOIN {$wpdb->term_taxonomy} ta ON ta.term_taxonomy_id = a.term_taxonomy_id INNER JOIN {$wpdb->term_relationships} b ON b.object_id = a.object_id INNER JOIN {$wpdb->term_taxonomy} tb ON tb.term_taxonomy_id = b.term_taxonomy_id WHERE ta.taxonomy = %s AND ta.term_id = %d AND tb.taxonomy = %s{$not}", Catalog::ARTIST, $artist, Catalog::ALBUM, ...$skip ) ) );
	}

	/**
	 * The audio files the requester may not see: those uploaded to a post that is unpublished or
	 * behind a password. Usually a handful; none for someone who can upload files.
	 *
	 * @return int[]
	 */
	private static function hidden_tracks(): array {
		global $wpdb;
		if ( current_user_can( 'upload_files' ) ) {
			return array();
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a narrow lookup with no API.
		return array_map( 'intval', $wpdb->get_col( "SELECT a.ID FROM {$wpdb->posts} a INNER JOIN {$wpdb->posts} par ON par.ID = a.post_parent WHERE a.post_type = 'attachment' AND a.post_mime_type LIKE 'audio/%' AND ( par.post_status <> 'publish' OR par.post_password <> '' )" ) );
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
		return " AND ( {$wpdb->posts}.post_parent = 0 OR {$wpdb->posts}.post_parent IN ( SELECT pp.ID FROM {$wpdb->posts} pp WHERE pp.post_status = 'publish' AND pp.post_password = '' ) )";
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
	 * SQL matching a track's title, artist or album against the search words.
	 *
	 * @param string $search Words.
	 * @return string
	 */
	private static function search_where( string $search ): string {
		global $wpdb;
		$like = '%' . $wpdb->esc_like( $search ) . '%';
		return $wpdb->prepare(
			" AND ( {$wpdb->posts}.post_title LIKE %s OR {$wpdb->posts}.ID IN (
				SELECT sr.object_id FROM {$wpdb->term_relationships} sr
				INNER JOIN {$wpdb->term_taxonomy} stt ON stt.term_taxonomy_id = sr.term_taxonomy_id AND stt.taxonomy IN ( %s, %s )
				INNER JOIN {$wpdb->terms} st ON st.term_id = stt.term_id
				WHERE st.name LIKE %s ) )",
			$like,
			Catalog::ALBUM,
			Catalog::ARTIST,
			$like
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
		$num   = static function ( int $id ): int {
			$meta = wp_get_attachment_metadata( $id );
			return is_array( $meta ) && isset( $meta['track_number'] ) ? (int) $meta['track_number'] : PHP_INT_MAX;
		};
		usort( $ids, static fn( $a, $b ) => array( $num( (int) $a ), $order[ $a ] ) <=> array( $num( (int) $b ), $order[ $b ] ) );
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
