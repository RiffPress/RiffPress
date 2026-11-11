<?php
/**
 * The library: every post with something to play, and a REST route the app reads it from.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_Post;
use WP_Query;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Library data.
 *
 * A post is in the library when its content holds a core audio or video block. The app lists
 * those posts, and opens one as a set of tracks with the blocks rendered the way the post itself
 * renders them, so the same rows and the same player serve both.
 */
final class Library {

	/**
	 * The most an LP side holds, in seconds, before its grooves crowd.
	 *
	 * @since 6.3.0
	 */
	private const SIDE = 1440;

	/**
	 * REST namespace.
	 *
	 * @since 4.0.0
	 */
	public const REST = 'riff/v1';

	/**
	 * Posts per page in the list.
	 *
	 * @since 4.0.0
	 */
	public const PER_PAGE = 24;

	/**
	 * Hooks the REST routes.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers /library and /library/{id}.
	 *
	 * @since 4.0.0
	 */
	public static function routes(): void {
		register_rest_route(
			self::REST,
			'/library',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_list' ),
					'permission_callback' => '__return_true',
					'args'                => array(
						'page' => array(
							'description' => __( 'Page of the library.', 'riff' ),
							'type'        => 'integer',
							'default'     => 1,
							'minimum'     => 1,
						),
					),
				),
				/**
				 * POST /riff/v1/library: a new album, a post with one audio block for each track
				 * already in the Media Library, in the order given.
				 *
				 * @since 6.5.0
				 */
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_create' ),
					'permission_callback' => array( self::class, 'may_create' ),
					'args'                => array(
						'title'   => array(
							'description' => __( 'The album\'s title.', 'riff' ),
							'type'        => 'string',
							'minLength'   => 1,
							'maxLength'   => 200,
							'required'    => true,
						),
						'tracks'  => array(
							'description' => __( 'Audio attachment IDs, in play order.', 'riff' ),
							'type'        => 'array',
							'items'       => array(
								'type'    => 'integer',
								'minimum' => 1,
							),
							'minItems'    => 1,
							'maxItems'    => 200,
							'required'    => true,
						),
						'status'  => array(
							'description' => __( 'Draft, for its author to look over first; published; or private.', 'riff' ),
							'type'        => 'string',
							'enum'        => array( 'draft', 'publish', 'private' ),
							'default'     => 'draft',
						),
						'artwork' => array(
							'description' => __( 'An image attachment ID for the cover; the first track\'s artwork when not given.', 'riff' ),
							'type'        => 'integer',
							'default'     => 0,
							'minimum'     => 0,
						),
					),
				),
				'schema' => array( self::class, 'list_schema' ),
			)
		);
		/**
		 * GET /riff/v1/library/summary: what the library holds and the space it takes, for whoever
		 * can upload to it.
		 *
		 * @since 6.5.0
		 */
		register_rest_route(
			self::REST,
			'/library/summary',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_summary' ),
					'permission_callback' => static fn() => current_user_can( 'upload_files' ) ? true : new WP_Error( 'rest_forbidden', __( 'Sorry, you are not allowed to see what the library holds.', 'riff' ), array( 'status' => rest_authorization_required_code() ) ),
				),
				'schema' => array( self::class, 'summary_schema' ),
			)
		);
		register_rest_route(
			self::REST,
			'/library/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_post' ),
					'permission_callback' => '__return_true',
					'args'                => array(
						'id' => array(
							'description' => __( 'Post ID.', 'riff' ),
							'type'        => 'integer',
							'required'    => true,
						),
					),
				),
				'schema' => array( self::class, 'post_schema' ),
			)
		);
	}

	/**
	 * The shape of a library item.
	 *
	 * @since 4.0.0
	 * @return array JSON Schema.
	 */
	public static function item_schema(): array {
		return array(
			'type'       => 'object',
			'properties' => array(
				'id'       => array(
					'type'        => 'integer',
					'description' => __( 'Post ID.', 'riff' ),
				),
				'title'    => array(
					'type'        => 'string',
					'description' => __( 'Post title.', 'riff' ),
				),
				'url'      => array(
					'type'        => 'string',
					'format'      => 'uri',
					'description' => __( 'Permalink.', 'riff' ),
				),
				'artist'   => array(
					'type'        => 'string',
					'description' => __( 'The artist every track shares, or empty.', 'riff' ),
				),
				'art'      => array(
					'type'        => 'array',
					'description' => __( 'Artwork, smallest first.', 'riff' ),
					'items'       => array(
						'type'       => 'object',
						'properties' => array(
							'src'   => array( 'type' => 'string' ),
							'sizes' => array( 'type' => 'string' ),
						),
					),
				),
				'count'    => array(
					'type'        => 'integer',
					'description' => __( 'Number of tracks.', 'riff' ),
				),
				'meta'     => array(
					'description' => __( 'A one-line byline for the post, written by a feature that knows how to say it in the language.', 'riff' ),
					'type'        => 'string',
				),
				'duration' => array(
					'type'        => 'number',
					'description' => __( 'Total length in seconds, 0 when unknown.', 'riff' ),
				),
			),
		);
	}

	/**
	 * The schema of GET /library.
	 *
	 * @since 4.0.0
	 * @return array JSON Schema.
	 */
	public static function list_schema(): array {
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'riff-library',
			'type'       => 'object',
			'properties' => array(
				'items' => array(
					'type'  => 'array',
					'items' => self::item_schema(),
				),
				'page'  => array( 'type' => 'integer' ),
				'pages' => array( 'type' => 'integer' ),
				'total' => array( 'type' => 'integer' ),
			),
		);
	}

	/**
	 * The schema of GET /library/{id}.
	 *
	 * @since 4.0.0
	 * @return array JSON Schema.
	 */
	public static function post_schema(): array {
		$schema                           = self::item_schema();
		$schema['$schema']                = 'http://json-schema.org/draft-04/schema#';
		$schema['title']                  = 'riff-library-post';
		$schema['properties']['tracks']   = array(
			'type'        => 'array',
			'description' => __( 'The tracks, in order, as the player reads them.', 'riff' ),
			'items'       => Tracks::schema(),
		);
		$schema['properties']['pressing'] = array(
			'type'        => 'object',
			'description' => __( 'How the tracks are pressed: the format, 12 or 7, and its sides, each with the tracks it holds.', 'riff' ),
		);
		$schema['properties']['html']     = array(
			'type'        => 'string',
			'description' => __( 'The media blocks rendered as the post renders them.', 'riff' ),
		);
		return $schema;
	}

	/**
	 * The schema of POST /library: the new post as GET /library/{id} has it, with its status.
	 *
	 * @since 6.5.0
	 * @return array JSON Schema.
	 */
	public static function created_schema(): array {
		$schema                         = self::post_schema();
		$schema['title']                = 'riff-library-created';
		$schema['properties']['status'] = array(
			'type'        => 'string',
			'description' => __( 'The post\'s status: draft, publish or private.', 'riff' ),
		);
		$schema['properties']['edit']   = array(
			'type'        => 'string',
			'description' => __( 'Where its author edits it.', 'riff' ),
		);
		return $schema;
	}

	/**
	 * The schema of GET /library/summary.
	 *
	 * @since 6.5.0
	 * @return array JSON Schema.
	 */
	public static function summary_schema(): array {
		$count = static fn( string $what ): array => array(
			'type'        => 'integer',
			'description' => $what,
		);
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'riff-library-summary',
			'type'       => 'object',
			'properties' => array(
				'tracks'  => $count( __( 'Audio files in the Media Library.', 'riff' ) ),
				'albums'  => $count( __( 'Albums, by the files\' tags.', 'riff' ) ),
				'artists' => $count( __( 'Artists, by the files\' tags.', 'riff' ) ),
				'posts'   => $count( __( 'Published posts with music.', 'riff' ) ),
				'bytes'   => array(
					'type'        => 'object',
					'description' => __( 'Space taken, in bytes: by the audio files, and by every upload.', 'riff' ),
					'properties'  => array(
						'audio'   => array( 'type' => 'integer' ),
						'uploads' => array( 'type' => 'integer' ),
					),
				),
				'quota'   => array(
					'type'        => array( 'integer', 'null' ),
					'description' => __( 'The most the site may upload, in bytes, where its network sets a limit; null for none.', 'riff' ),
				),
			),
		);
	}

	/**
	 * Whether the current user may make an album of these tracks: write posts, publish them when
	 * it is to be published, edit each track, and see the artwork.
	 *
	 * @since 6.5.0
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	public static function may_create( WP_REST_Request $request ) {
		$type    = get_post_type_object( 'post' );
		$publish = in_array( $request['status'], array( 'publish', 'private' ), true );
		$allowed = $type && current_user_can( $type->cap->create_posts ) && ( ! $publish || current_user_can( $type->cap->publish_posts ) );
		foreach ( array_map( 'intval', (array) $request['tracks'] ) as $id ) {
			$allowed = $allowed && ( ! get_post( $id ) || current_user_can( 'edit_post', $id ) );
		}
		$art = (int) $request['artwork'];
		if ( $art && get_post( $art ) ) {
			$allowed = $allowed && current_user_can( 'read_post', $art );
		}
		return $allowed ? true : new WP_Error( 'rest_cannot_create', __( 'Sorry, you are not allowed to make an album of these tracks.', 'riff' ), array( 'status' => rest_authorization_required_code() ) );
	}

	/**
	 * POST /library: makes the album and answers with it.
	 *
	 * @since 6.5.0
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_create( WP_REST_Request $request ) {
		$ids = array_values( array_unique( array_map( 'intval', (array) $request['tracks'] ) ) );
		foreach ( $ids as $id ) {
			if ( ! str_starts_with( (string) get_post_mime_type( $id ), 'audio/' ) ) {
				return new WP_Error(
					'rest_invalid_param',
					/* translators: %d: An attachment ID. */
					sprintf( __( '%d is not an audio file in the Media Library.', 'riff' ), $id ),
					array( 'status' => 400 )
				);
			}
		}
		$art = (int) $request['artwork'];
		if ( $art && ! wp_attachment_is_image( $art ) ) {
			return new WP_Error( 'rest_invalid_param', __( 'The artwork is not an image in the Media Library.', 'riff' ), array( 'status' => 400 ) );
		}
		$id = self::create( (string) $request['title'], $ids, (string) $request['status'], $art );
		if ( is_wp_error( $id ) ) {
			$id->add_data( array( 'status' => 500 ) );
			return $id;
		}
		$post             = get_post( $id );
		$detail           = self::post( $post );
		$detail['status'] = $post->post_status;
		$detail['edit']   = (string) get_edit_post_link( $id, 'raw' );
		return new WP_REST_Response( $detail, 201 );
	}

	/**
	 * Makes an album: a post with one core audio block for each track, in the order given, with
	 * the artwork as its featured image, or the first track's. Each track attached to no post is
	 * attached to this one, as uploading it to the post would have.
	 *
	 * @since 6.5.0
	 * @param string $title  Title.
	 * @param int[]  $ids    Audio attachment IDs, in order.
	 * @param string $status Status: draft, publish or private.
	 * @param int    $art    Image attachment ID, or 0.
	 * @return int|WP_Error The post's ID.
	 */
	public static function create( string $title, array $ids, string $status = 'draft', int $art = 0 ) {
		$post_id = wp_insert_post(
			array(
				'post_title'   => $title,
				'post_status'  => $status,
				'post_content' => self::blocks( $ids ),
			),
			true
		);
		if ( is_wp_error( $post_id ) ) {
			return $post_id;
		}
		$art = $art ? $art : ( $ids ? (int) get_post_thumbnail_id( $ids[0] ) : 0 );
		if ( $art ) {
			set_post_thumbnail( $post_id, $art );
		}
		foreach ( $ids as $id ) {
			if ( 0 === (int) get_post_field( 'post_parent', $id ) ) {
				wp_update_post(
					array(
						'ID'          => $id,
						'post_parent' => $post_id,
					)
				);
			}
		}
		return (int) $post_id;
	}

	/**
	 * Core audio blocks for tracks, as the editor saves them.
	 *
	 * @since 6.5.0
	 * @param int[] $ids Audio attachment IDs.
	 * @return string
	 */
	public static function blocks( array $ids ): string {
		return implode(
			'',
			array_map(
				static fn( int $id ): string => sprintf(
					'<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio -->',
					$id,
					esc_url( (string) wp_get_attachment_url( $id ) )
				),
				$ids
			)
		);
	}

	/**
	 * GET /library/summary.
	 *
	 * @since 6.5.0
	 * @return WP_REST_Response
	 */
	public static function rest_summary(): WP_REST_Response {
		$tracks = 0;
		foreach ( (array) wp_count_attachments( 'audio' ) as $count ) {
			$tracks += (int) $count;
		}
		$terms = static function ( string $taxonomy ): int {
			$count = wp_count_terms(
				array(
					'taxonomy'   => $taxonomy,
					'hide_empty' => true,
				)
			);
			return is_wp_error( $count ) ? 0 : (int) $count;
		};
		$quota = null;
		if ( is_multisite() && ! get_site_option( 'upload_space_check_disabled' ) ) {
			$quota = (int) ( get_space_allowed() * MB_IN_BYTES );
		}
		return new WP_REST_Response(
			array(
				'tracks'  => $tracks,
				'albums'  => $terms( Catalog::ALBUM ),
				'artists' => $terms( Catalog::ARTIST ),
				'posts'   => (int) self::query(
					array(
						'posts_per_page' => 1,
						'fields'         => 'ids',
					)
				)->found_posts,
				'bytes'   => array(
					'audio'   => self::audio_bytes(),
					'uploads' => is_multisite() ? (int) ( get_space_used() * MB_IN_BYTES ) : (int) get_dirsize( wp_upload_dir()['basedir'] ),
				),
				'quota'   => $quota,
			)
		);
	}

	/**
	 * What the audio files take, in bytes: each file's size as WordPress noted it on upload, or as
	 * the disk says for a file uploaded before it noted sizes.
	 *
	 * @return int
	 */
	private static function audio_bytes(): int {
		$bytes = 0;
		$page  = 1;
		do {
			$ids = get_posts(
				array(
					'post_type'              => 'attachment',
					'post_mime_type'         => 'audio',
					'post_status'            => 'inherit',
					'fields'                 => 'ids',
					'posts_per_page'         => 100,
					'paged'                  => $page++,
					'orderby'                => 'ID',
					'order'                  => 'ASC',
					'no_found_rows'          => true,
					'update_post_term_cache' => false,
				)
			);
			update_postmeta_cache( $ids );
			foreach ( $ids as $id ) {
				$meta = wp_get_attachment_metadata( $id );
				$size = is_array( $meta ) ? (int) ( $meta['filesize'] ?? 0 ) : 0;
				if ( ! $size ) {
					$file = get_attached_file( $id );
					$size = $file && is_file( $file ) ? (int) filesize( $file ) : 0;
				}
				$bytes += $size;
			}
			$more = 100 === count( $ids );
		} while ( $more );
		return $bytes;
	}

	/**
	 * GET /library: a page of posts with tracks.
	 *
	 * @since 4.0.0
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_list( WP_REST_Request $request ): WP_REST_Response {
		$page  = max( 1, (int) $request['page'] );
		$query = self::query( array( 'paged' => $page ) );
		self::prime( $query->posts );
		$items = array();
		foreach ( $query->posts as $post ) {
			$items[] = self::item( $post );
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
	 * GET /library/{id}: one post, with its tracks and the rendered media blocks.
	 *
	 * @since 4.0.0
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_post( WP_REST_Request $request ) {
		$post = get_post( (int) $request['id'] );
		if ( ! $post instanceof WP_Post || ! is_post_publicly_viewable( $post ) || post_password_required( $post ) ) {
			return new WP_Error( 'riff_not_found', __( 'There is nothing to play here.', 'riff' ), array( 'status' => 404 ) );
		}
		$detail = self::post( $post );
		if ( ! $detail['tracks'] ) {
			return new WP_Error( 'riff_not_found', __( 'There is nothing to play here.', 'riff' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( $detail );
	}

	/**
	 * Whether the Listen app marks a post as private for the person looking at it: the post is one
	 * a visitor can't see, unpublished or behind a password, by the rule that keeps its files out of
	 * a visitor's Tracks, Albums and Artists (Catalog_Rest::visible()). Only someone signed in is
	 * ever told, so nothing a page cache keeps for visitors changes, and only someone who may read
	 * the post, by the same check that lets them see it.
	 *
	 * @since 6.8.0
	 *
	 * @param WP_Post|int|null $post Post or its ID.
	 * @return bool
	 */
	public static function is_private( $post ): bool {
		$post = get_post( $post );
		if ( ! $post instanceof WP_Post || ! is_user_logged_in() ) {
			return false;
		}
		return ( 'publish' !== $post->post_status || '' !== $post->post_password ) && current_user_can( 'read_post', $post->ID );
	}

	/**
	 * The posts with tracks, newest first.
	 *
	 * @since 4.0.0
	 * @param array $args WP_Query arguments to merge in.
	 * @return WP_Query
	 */
	public static function query( array $args = array() ): WP_Query {
		$args = wp_parse_args(
			$args,
			array(
				'post_type'           => 'post',
				'post_status'         => 'publish',
				'has_password'        => false,
				'posts_per_page'      => self::PER_PAGE,
				'ignore_sticky_posts' => true,
				'no_found_rows'       => false,
			)
		);

		// Each source says in SQL which posts it can read; a source that cannot say contributes nothing
		// here and is asked post by post instead.
		$clauses = array_filter( array_map( static fn( Source $source ) => $source->where(), Sources::all() ) );
		$where   = static fn( string $sql ): string => $clauses ? $sql . ' AND (' . implode( ' OR ', $clauses ) . ')' : $sql;
		add_filter( 'posts_where', $where );
		$query   = new WP_Query( $args );
		remove_filter( 'posts_where', $where );
		return $query;
	}

	/**
	 * A post as the list shows it: title, artwork, how many tracks and how long.
	 *
	 * @since 4.0.0
	 * @param WP_Post $post Post.
	 * @return array
	 */
	public static function item( WP_Post $post ): array {
		return self::listed( $post, self::summary( $post ) );
	}

	/**
	 * How many tracks a post holds, how long they last and who they are by, kept in the object
	 * cache until a post or its meta next changes, so a card doesn't build every track it counts.
	 * Only for the core blocks, whose tracks are the same whoever asks; another source may list
	 * tracks by who is asking.
	 *
	 * @param WP_Post $post Post.
	 * @return array `{ count, duration, artist }`.
	 */
	private static function summary( WP_Post $post ): array {
		if ( ! Sources::for_post( $post ) instanceof Blocks_Source ) {
			return self::summarize( self::tracks( $post ) );
		}
		$key  = $post->ID . ':' . md5( $post->post_content ) . ':' . wp_cache_get_last_changed( 'posts' );
		$kept = wp_cache_get( $key, 'riff' );
		if ( is_array( $kept ) ) {
			return $kept;
		}
		$summary = self::summarize( self::tracks( $post ) );
		wp_cache_set( $key, $summary, 'riff', DAY_IN_SECONDS );
		return $summary;
	}

	/**
	 * What a card says of a post's tracks.
	 *
	 * @param array[] $tracks Tracks.
	 * @return array `{ count, duration, artist }`.
	 */
	private static function summarize( array $tracks ): array {
		return array(
			'count'    => count( $tracks ),
			'duration' => array_sum( array_map( static fn( $t ) => (float) $t['duration'], $tracks ) ),
			'artist'   => self::artist( $tracks ),
		);
	}

	/**
	 * Loads what listing these posts reads, their tracks' files and artwork among it, in a few
	 * queries for the whole list rather than a few for each track.
	 *
	 * @since 5.7.0
	 *
	 * @param WP_Post[] $posts Posts.
	 */
	public static function prime( array $posts ): void {
		$posts       = array_filter( $posts, static fn( $post ) => $post instanceof WP_Post );
		$attachments = array();
		foreach ( $posts as $post ) {
			// Only the core blocks say which files they hold before their tracks are built.
			if ( Sources::for_post( $post ) instanceof Blocks_Source ) {
				$attachments = array_merge( $attachments, Blocks_Source::attachments( $post ) );
			}
		}
		Tracks::prime( $attachments, wp_list_pluck( $posts, 'ID' ) );
	}

	/**
	 * A post's name as Riff shows it: its title through the theme's filters, as get_the_title()
	 * gives it, without the "Private:" or "Protected:" WordPress puts before it. Whether a post is
	 * only its author's is for the post's own page to say; a card, a row or a cover names it.
	 *
	 * @since 6.7.2
	 *
	 * @param int|WP_Post $post Post or post ID.
	 * @return string The name, entities decoded.
	 */
	public static function title( $post ): string {
		$name = static fn() => '%s';
		add_filter( 'private_title_format', $name, PHP_INT_MAX );
		add_filter( 'protected_title_format', $name, PHP_INT_MAX );
		try {
			$title = get_the_title( $post );
		} finally {
			remove_filter( 'private_title_format', $name, PHP_INT_MAX );
			remove_filter( 'protected_title_format', $name, PHP_INT_MAX );
		}
		return html_entity_decode( (string) $title, ENT_QUOTES, 'UTF-8' );
	}

	/**
	 * A post as the list shows it, from what its tracks add up to.
	 *
	 * @param WP_Post $post    Post.
	 * @param array   $summary Its tracks' `{ count, duration, artist }`.
	 * @return array
	 */
	private static function listed( WP_Post $post, array $summary ): array {
		$art  = Tracks::art( (int) get_post_thumbnail_id( $post ) );
		$item = array(
			'id'       => $post->ID,
			'title'    => self::title( $post ),
			'url'      => (string) get_permalink( $post ),
			'artist'   => (string) $summary['artist'],
			'art'      => $art,
			'count'    => (int) $summary['count'],
			'duration' => (float) $summary['duration'],
		);
		return Listen\App::item_meta( Listen\Art::item_art( $item, $post ), $post );
	}

	/**
	 * A post opened in the app: the item, its tracks, and the media blocks rendered.
	 *
	 * @since 4.0.0
	 * @param WP_Post $post Post.
	 * @return array
	 */
	public static function post( WP_Post $post ): array {
		$tracks           = self::tracks( $post );
		$item             = self::listed( $post, self::summarize( $tracks ) );
		$item['tracks']   = $tracks;
		$item['pressing'] = self::pressing( $tracks );
		$item['html']     = self::html( $post );
		return $item;
	}

	/**
	 * How an album is pressed, as the turntable plays it and the cover Riff draws shows it. A release
	 * of one or two tracks and ten minutes at most is a 7-inch single at 45, a track a side. Anything
	 * longer is LPs at 33⅓: sides of 24 minutes at most, as an LP side holds before its grooves crowd,
	 * each as near the same length as the album's order allows, two to a record, A and B on the first,
	 * C and D on the second. Where the files' tags say which disc of a set each track is on, and name
	 * more than one, each disc is a record of its own (or more, should it run longer than two sides
	 * hold), its sides worked out from its own tracks, so no side runs from one disc onto the next.
	 *
	 * @since 6.3.0
	 *
	 * @param array[] $tracks Tracks, in order.
	 * @return array{format: string, sides: array<int, array{from: int, to: int, start: float, length: float, record: int, name: string}>}
	 */
	public static function pressing( array $tracks ): array {
		$tracks  = array_values( $tracks );
		$lengths = array_map( static fn( $track ) => (float) ( $track['duration'] ?? 0 ), $tracks );
		$discs   = array_map( static fn( $track ) => (int) ( $track['disc'] ?? 0 ), $tracks );
		$length  = array_sum( $lengths );
		$count   = count( $lengths );
		$single  = $count <= 2 && $length <= 600;
		$named   = $count && min( $discs ) > 0 && count( array_unique( $discs ) ) > 1;
		// The runs of tracks on one disc, in the album's order; the whole album as one, where the
		// tags don't say.
		$runs = array();
		for ( $k = 0; $k < $count; $k++ ) {
			if ( $k && $named && $discs[ $k ] === $discs[ $k - 1 ] ) {
				$runs[ count( $runs ) - 1 ][1] = $k + 1;
			} elseif ( ! $k || $named ) {
				$runs[] = array( $k, $k + 1 );
			} else {
				$runs[0][1] = $k + 1;
			}
		}
		$sides  = array();
		$start  = 0.0;
		$record = 0;
		foreach ( $runs as [ $from, $to ] ) {
			$part    = array_slice( $lengths, $from, $to - $from );
			$span    = array_sum( $part );
			$pressed = self::split( $part, $from, $start, $single ? count( $part ) : max( 1, (int) ceil( $span / self::SIDE ) ) );
			foreach ( $pressed as $k => $side ) {
				$sides[] = $side + array( 'record' => $record + (int) floor( $k / 2 ) );
			}
			$record += (int) ceil( count( $pressed ) / 2 );
			$start  += $span;
		}
		foreach ( $sides as $k => $side ) {
			$sides[ $k ]['name'] = chr( 65 + $k );
		}
		return array(
			'format' => $single ? '7' : '12',
			'sides'  => $sides,
		);
	}

	/**
	 * Lays tracks onto so many sides. A track joins a side while the side, with half of it, is within
	 * the side's share, and enough tracks are left for the sides still to come.
	 *
	 * @param float[] $lengths Each track's length, in seconds.
	 * @param int     $at      The first track's place in the album.
	 * @param float   $start   How far into the album it starts, in seconds.
	 * @param int     $count   How many sides.
	 * @return array<int, array{from: int, to: int, start: float, length: float}>
	 */
	private static function split( array $lengths, int $at, float $start, int $count ): array {
		$length = array_sum( $lengths );
		$total  = count( $lengths );
		$sides  = array();
		$from   = 0;
		$into   = 0.0;
		for ( $k = 0; $k < $count; $k++ ) {
			$target = ( $length - $into ) / ( $count - $k );
			$to     = $from;
			$side   = 0.0;
			while ( $to < $total && ( $to === $from || $k === $count - 1 || ( $side + $lengths[ $to ] / 2 <= $target && $total - $to > $count - $k - 1 ) ) ) {
				$side += $lengths[ $to++ ];
			}
			if ( $to > $from ) {
				$sides[] = array(
					'from'   => $at + $from,
					'to'     => $at + $to,
					'start'  => $start + $into,
					'length' => $side,
				);
			}
			$from  = $to;
			$into += $side;
		}
		return $sides;
	}

	/**
	 * The tracks in a post, in order, from the first source that claims it.
	 *
	 * @since 4.0.0
	 * @param WP_Post $post Post.
	 * @return array[]
	 */
	public static function tracks( WP_Post $post ): array {
		$source = Sources::for_post( $post );
		return $source ? $source->tracks( $post ) : array();
	}

	/**
	 * The tracks rendered as blocks the player takes over, from the source that read them.
	 *
	 * @since 4.0.0
	 * @param WP_Post $post Post.
	 * @return string
	 */
	public static function html( WP_Post $post ): string {
		$source = Sources::for_post( $post );
		return $source ? $source->html( $post ) : '';
	}

	/**
	 * The artist the tracks share, or an empty string when they do not share one.
	 *
	 * @param array[] $tracks Tracks.
	 * @return string
	 */
	private static function artist( array $tracks ): string {
		$artists = array_unique( array_filter( array_column( $tracks, 'artist' ) ) );
		return 1 === count( $artists ) ? (string) reset( $artists ) : '';
	}
}
