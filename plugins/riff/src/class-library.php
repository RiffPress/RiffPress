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
				'schema' => array( self::class, 'list_schema' ),
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
		$schema                         = self::item_schema();
		$schema['$schema']              = 'http://json-schema.org/draft-04/schema#';
		$schema['title']                = 'riff-library-post';
		$schema['properties']['tracks'] = array(
			'type'        => 'array',
			'description' => __( 'The tracks, in order, as the player reads them.', 'riff' ),
			'items'       => array( 'type' => 'object' ),
		);
		$schema['properties']['html']   = array(
			'type'        => 'string',
			'description' => __( 'The media blocks rendered as the post renders them.', 'riff' ),
		);
		return $schema;
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
		return self::listed( $post, self::tracks( $post ) );
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
	 * A post as the list shows it, from its tracks.
	 *
	 * @param WP_Post $post   Post.
	 * @param array[] $tracks Its tracks.
	 * @return array
	 */
	private static function listed( WP_Post $post, array $tracks ): array {
		$duration = 0.0;
		foreach ( $tracks as $t ) {
			$duration += (float) $t['duration'];
		}
		$art  = Tracks::art( (int) get_post_thumbnail_id( $post ) );
		$item = array(
			'id'       => $post->ID,
			'title'    => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
			'url'      => (string) get_permalink( $post ),
			'artist'   => self::artist( $tracks ),
			'art'      => $art,
			'count'    => count( $tracks ),
			'duration' => $duration,
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
		$tracks         = self::tracks( $post );
		$item           = self::listed( $post, $tracks );
		$item['tracks'] = $tracks;
		$item['html']   = self::html( $post );
		return $item;
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
