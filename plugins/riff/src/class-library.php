<?php
/**
 * The library: every post with something to play, and a REST route the app reads it from.
 *
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
	 */
	public const REST = 'riff/v1';

	/**
	 * Posts per page in the list.
	 */
	public const PER_PAGE = 24;

	/**
	 * Hooks the REST routes.
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers /library and /library/{id}.
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
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_list( WP_REST_Request $request ): WP_REST_Response {
		$page  = max( 1, (int) $request['page'] );
		$query = self::query( array( 'paged' => $page ) );
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
	 * @param array $args WP_Query arguments to merge in.
	 * @return WP_Query
	 */
	public static function query( array $args = array() ): WP_Query {
		$args = wp_parse_args(
			$args,
			array(
				'post_type'           => 'post',
				'post_status'         => 'publish',
				'posts_per_page'      => self::PER_PAGE,
				'ignore_sticky_posts' => true,
				'no_found_rows'       => false,
			)
		);
		/**
		 * Filters the query behind the library: which posts the app lists.
		 *
		 * @param array $args WP_Query arguments.
		 */
		$args = (array) apply_filters( 'riff_library_query', $args );

		$where = static function ( string $sql ): string {
			global $wpdb;
			return $sql . $wpdb->prepare(
				" AND ({$wpdb->posts}.post_content LIKE %s OR {$wpdb->posts}.post_content LIKE %s)", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the posts table name.
				'%' . $wpdb->esc_like( '<!-- wp:audio' ) . '%',
				'%' . $wpdb->esc_like( '<!-- wp:video' ) . '%'
			);
		};
		add_filter( 'posts_where', $where );
		$query = new WP_Query( $args );
		remove_filter( 'posts_where', $where );
		return $query;
	}

	/**
	 * A post as the list shows it: title, artwork, how many tracks and how long.
	 *
	 * @param WP_Post $post Post.
	 * @return array
	 */
	public static function item( WP_Post $post ): array {
		$tracks   = self::tracks( $post );
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
		/**
		 * Filters a post as the library lists it.
		 *
		 * @param array   $item Item: id, title, url, artist, art, count, duration.
		 * @param WP_Post $post Post.
		 */
		return (array) apply_filters( 'riff_library_item', $item, $post );
	}

	/**
	 * A post opened in the app: the item, its tracks, and the media blocks rendered.
	 *
	 * @param WP_Post $post Post.
	 * @return array
	 */
	public static function post( WP_Post $post ): array {
		$item           = self::item( $post );
		$item['tracks'] = self::tracks( $post );
		$item['html']   = self::html( $post );
		return $item;
	}

	/**
	 * The tracks in a post's content, in order.
	 *
	 * @param WP_Post $post Post.
	 * @return array[]
	 */
	public static function tracks( WP_Post $post ): array {
		$tracks = array();
		foreach ( self::media_blocks( parse_blocks( $post->post_content ) ) as $block ) {
			$track = Tracks::from_block( $block, $post->ID );
			if ( $track ) {
				$tracks[] = $track;
			}
		}
		return $tracks;
	}

	/**
	 * The post's media blocks rendered as they are on the post, figures marked with their tracks.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	public static function html( WP_Post $post ): string {
		// The block renderer reads the post from the loop, the way it does on the post's own page.
		$previous        = $GLOBALS['post'] ?? null;
		$GLOBALS['post'] = $post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- put back below.
		setup_postdata( $post );
		$html = '';
		foreach ( self::media_blocks( parse_blocks( $post->post_content ) ) as $block ) {
			$html .= render_block( $block );
		}
		wp_reset_postdata();
		$GLOBALS['post'] = $previous; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- as it was.
		return $html;
	}

	/**
	 * Core audio and video blocks, found at any depth.
	 *
	 * @param array $blocks Parsed blocks.
	 * @return array[]
	 */
	private static function media_blocks( array $blocks ): array {
		$found = array();
		foreach ( $blocks as $block ) {
			$name = $block['blockName'] ?? '';
			if ( 'core/audio' === $name || 'core/video' === $name ) {
				$found[] = $block;
			} elseif ( ! empty( $block['innerBlocks'] ) ) {
				$found = array_merge( $found, self::media_blocks( $block['innerBlocks'] ) );
			}
		}
		return $found;
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
