<?php
/**
 * The REST routes over a listener's likes and recently played.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff;

use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * The controller for Likes: riff/v1/users/{user}/likes and /history, the handlers, the schemas,
 * and the signed-in listener's likes and history handed to the player. Who may read and change
 * them is Listener's check; the model, what is kept and how, is Likes.
 */
final class Likes_Rest {
	/**
	 * Hooks the routes.
	 *
	 * @since 4.33.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers /users/{user}/likes and /users/{user}/history.
	 *
	 * @since 4.20.0
	 */
	public static function routes(): void {
		$item = array(
			'type'                 => 'object',
			'additionalProperties' => false,
			'properties'           => array(
				'kind' => array(
					'description' => __( 'What is liked: track, album or artist.', 'riff' ),
					'type'        => 'string',
					'enum'        => Likes::KINDS,
					'required'    => true,
				),
				'id'   => array(
					'description' => __( 'The audio attachment\'s ID for a track, or the term ID for an album or artist.', 'riff' ),
					'type'        => 'integer',
					'minimum'     => 1,
					'required'    => true,
				),
				'at'   => array(
					'description' => __( 'When it was liked, in milliseconds since the epoch. Now when left out.', 'riff' ),
					'type'        => 'integer',
					'minimum'     => 0,
				),
			),
		);
		$user = array(
			'description' => __( 'Whose: me for the signed-in user, or a user ID, for someone who may edit that user.', 'riff' ),
			'type'        => 'string',
			'pattern'     => '^(me|\\d+)$',
		);
		/**
		 * GET and POST /riff/v1/users/me/likes: the signed-in user's likes, newest first, and
		 * adding to them, in the shape core's /wp/v2/users/me/application-passwords takes. A user
		 * ID in place of me reads or changes that user's, for someone who may edit them. POST takes
		 * a list, so a visitor's likes from their device join the account in one request; one
		 * already liked keeps its place.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			'/users/(?P<user>me|\d+)/likes',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_likes' ),
					'permission_callback' => array( Listener::class, 'allowed' ),
					'args'                => array( 'user' => $user ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_like' ),
					'permission_callback' => array( Listener::class, 'allowed' ),
					'args'                => array(
						'user'  => $user,
						'items' => array(
							'description' => __( 'Likes to add: a kind and an ID each, and when it was liked.', 'riff' ),
							'type'        => 'array',
							'items'       => $item,
							'maxItems'    => Likes::MAX,
							'required'    => true,
						),
					),
				),
				'schema' => array( self::class, 'likes_schema' ),
			)
		);
		/**
		 * DELETE /riff/v1/users/me/likes/{kind}/{id}: takes one like away.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			'/users/(?P<user>me|\d+)/likes/(?P<kind>track|album|artist)/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_unlike' ),
					'permission_callback' => array( Listener::class, 'allowed' ),
					'args'                => array(
						'user' => $user,
						'kind' => array(
							'description' => __( 'What was liked: track, album or artist.', 'riff' ),
							'type'        => 'string',
							'enum'        => Likes::KINDS,
						),
						'id'   => array(
							'description' => __( 'Its ID.', 'riff' ),
							'type'        => 'integer',
							'minimum'     => 1,
						),
					),
				),
				'schema' => array( self::class, 'likes_schema' ),
			)
		);
		/**
		 * GET, POST and DELETE /riff/v1/users/me/history: the tracks the signed-in user played, newest
		 * first, each in the track shape with `played`; adding plays, which a visitor's device
		 * history joins on sign-in; and clearing it.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			'/users/(?P<user>me|\d+)/history',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_history' ),
					'permission_callback' => array( Listener::class, 'allowed' ),
					'args'                => array( 'user' => $user ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_played' ),
					'permission_callback' => array( Listener::class, 'allowed' ),
					'args'                => array(
						'user'  => $user,
						'items' => array(
							'description' => __( 'Plays to add: a track\'s ID each, and when it was played.', 'riff' ),
							'type'        => 'array',
							'maxItems'    => 100,
							'required'    => true,
							'items'       => array(
								'type'                 => 'object',
								'additionalProperties' => false,
								'properties'           => array(
									'id'     => array(
										'description' => __( 'The audio attachment\'s ID.', 'riff' ),
										'type'        => 'integer',
										'minimum'     => 1,
										'required'    => true,
									),
									'played' => array(
										'description' => __( 'When it was played, in milliseconds since the epoch. Now when left out.', 'riff' ),
										'type'        => 'integer',
										'minimum'     => 0,
									),
									'post'   => array(
										'description' => __( 'The post it was played from, for Jump back in, or 0.', 'riff' ),
										'type'        => 'integer',
										'minimum'     => 0,
									),
								),
							),
						),
					),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_forget' ),
					'permission_callback' => array( Listener::class, 'allowed' ),
					'args'                => array( 'user' => $user ),
				),
				'schema' => array( self::class, 'history_schema' ),
			)
		);
	}

	/**
	 * GET /users/{user}/likes.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_likes( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( array( 'items' => Likes::get( Listener::user( $request ) ) ) );
	}

	/**
	 * POST /users/{user}/likes.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_like( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( array( 'items' => Likes::add( Listener::user( $request ), (array) $request['items'] ) ) );
	}

	/**
	 * DELETE /users/{user}/likes/{kind}/{id}.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_unlike( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( array( 'items' => Likes::remove( Listener::user( $request ), (string) $request['kind'], (int) $request['id'] ) ) );
	}

	/**
	 * GET /users/{user}/history.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_history( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( array( 'items' => Likes::history_tracks( Listener::user( $request ) ) ) );
	}

	/**
	 * POST /users/{user}/history.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_played( WP_REST_Request $request ): WP_REST_Response {
		Likes::played( Listener::user( $request ), (array) $request['items'] );
		return self::rest_history( $request );
	}

	/**
	 * DELETE /users/{user}/history.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_forget( WP_REST_Request $request ): WP_REST_Response {
		delete_user_option( Listener::user( $request ), Likes::HISTORY_OPTION );
		return new WP_REST_Response( array( 'items' => array() ) );
	}

	/**
	 * The signed-in user's likes and recently played, for the player, with where to send changes.
	 * A visitor gets nothing here; their player keeps both on the device.
	 *
	 * @since 4.20.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( ! is_array( $data ) || true !== Listener::signed_in() ) {
			return $data;
		}
		$user       = get_current_user_id();
		$data['me'] = array(
			'likes'   => Likes::get( $user ),
			'history' => Likes::history_tracks( $user ),
			'rest'    => array(
				'likes'   => rest_url( Library::REST . '/users/me/likes' ),
				'history' => rest_url( Library::REST . '/users/me/history' ),
			),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
		);
		return $data;
	}

	/**
	 * The shape of /users/{user}/likes.
	 *
	 * @since 4.20.0
	 * @return array JSON Schema.
	 */
	public static function likes_schema(): array {
		return array(
			'$schema'     => 'http://json-schema.org/draft-04/schema#',
			'title'       => 'riff-likes',
			'description' => __( 'The signed-in user\'s likes, newest first. Kept in the riff_likes user meta under the site\'s table prefix, a row each, so each site keeps its own.', 'riff' ),
			'type'        => 'object',
			'properties'  => array(
				'items' => array(
					'type'  => 'array',
					'items' => array(
						'type'       => 'object',
						'properties' => array(
							'kind' => array(
								'type' => 'string',
								'enum' => Likes::KINDS,
							),
							'id'   => array( 'type' => 'integer' ),
							'at'   => array(
								'description' => __( 'When it was liked, in milliseconds since the epoch.', 'riff' ),
								'type'        => 'integer',
							),
						),
					),
				),
			),
		);
	}

	/**
	 * The shape of /users/{user}/history.
	 *
	 * @since 4.20.0
	 * @return array JSON Schema.
	 */
	public static function history_schema(): array {
		$track                         = Tracks::schema();
		$track['properties']['played'] = array(
			'description' => __( 'When it was played, in milliseconds since the epoch.', 'riff' ),
			'type'        => 'integer',
		);
		unset( $track['$schema'], $track['title'] );
		return array(
			'$schema'     => 'http://json-schema.org/draft-04/schema#',
			'title'       => 'riff-history',
			'description' => __( 'The tracks the signed-in user played, newest first, at most 30. Kept in the riff_history user meta under the site\'s table prefix, a row each, so each site keeps its own.', 'riff' ),
			'type'        => 'object',
			'properties'  => array(
				'items' => array(
					'type'  => 'array',
					'items' => $track,
				),
			),
		);
	}
}
