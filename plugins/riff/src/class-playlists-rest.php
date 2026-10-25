<?php
/**
 * The REST routes over a listener's playlists.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * The controller for Playlists: riff/v1/users/{user}/playlists and what is under it, who may
 * see and change a playlist, the handlers, the schemas, and the signed-in listener's playlists
 * handed to the player. The model, a playlist as a post holding a Playlist block, is Playlists.
 */
final class Playlists_Rest {
	/**
	 * Hooks the routes.
	 *
	 * @since 4.33.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers the routes.
	 *
	 * @since 4.20.0
	 */
	public static function routes(): void {
		$user   = array(
			'description' => __( 'Whose: me for the signed-in user, or a user ID, for someone who may edit that user.', 'riff' ),
			'type'        => 'string',
			'pattern'     => '^(me|\\d+)$',
		);
		$id     = array(
			'description' => __( 'The playlist\'s post ID.', 'riff' ),
			'type'        => 'integer',
			'minimum'     => 1,
		);
		$tracks = array(
			'description' => __( 'Tracks, by their audio attachments\' IDs, in order.', 'riff' ),
			'type'        => 'array',
			'items'       => array(
				'type'    => 'integer',
				'minimum' => 1,
			),
			'maxItems'    => Playlists::MAX_TRACKS,
		);
		$title  = array(
			'description' => __( 'The playlist\'s name.', 'riff' ),
			'type'        => 'string',
			'minLength'   => 1,
			'maxLength'   => 200,
		);
		$base   = '/users/(?P<user>me|\d+)/playlists';
		/**
		 * GET and POST /riff/v1/users/me/playlists: the signed-in user's playlists, the most recently
		 * changed first, and making one, empty or with tracks.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			$base,
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_list' ),
					'permission_callback' => array( Likes_Rest::class, 'allowed' ),
					'args'                => array( 'user' => $user ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_create' ),
					'permission_callback' => array( Likes_Rest::class, 'allowed' ),
					'args'                => array(
						'user'   => $user,
						'title'  => $title + array( 'required' => true ),
						'tracks' => $tracks,
					),
				),
				'schema' => array( self::class, 'list_schema' ),
			)
		);
		/**
		 * GET, POST and DELETE /riff/v1/users/me/playlists/{id}: one playlist with its tracks;
		 * renaming it or setting its tracks in a new order; and deleting it, to the trash.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			$base . '/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_get' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user' => $user,
						'id'   => $id,
					),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_update' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user'   => $user,
						'id'     => $id,
						'title'  => $title,
						'tracks' => $tracks,
					),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_delete' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user' => $user,
						'id'   => $id,
					),
				),
				'schema' => array( self::class, 'playlist_schema' ),
			)
		);
		/**
		 * POST /riff/v1/users/me/playlists/{id}/tracks: adds tracks to the end of a playlist.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			$base . '/(?P<id>\d+)/tracks',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_add' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user'   => $user,
						'id'     => $id,
						'tracks' => $tracks + array( 'required' => true ),
					),
				),
				'schema' => array( self::class, 'playlist_schema' ),
			)
		);
		/**
		 * DELETE /riff/v1/users/me/playlists/{id}/tracks/{index}: takes the track at a place in a
		 * playlist out, counting from 0, so one of two copies of a track can go.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			$base . '/(?P<id>\d+)/tracks/(?P<index>\d+)',
			array(
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_remove' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user'  => $user,
						'id'    => $id,
						'index' => array(
							'description' => __( 'The track\'s place in the playlist, from 0.', 'riff' ),
							'type'        => 'integer',
							'minimum'     => 0,
						),
					),
				),
				'schema' => array( self::class, 'playlist_schema' ),
			)
		);
	}

	/**
	 * Whether the request may see and change this playlist: as for likes, and the playlist must be
	 * one of that user's.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	public static function allowed( WP_REST_Request $request ) {
		$allowed = Likes_Rest::allowed( $request );
		if ( true !== $allowed ) {
			return $allowed;
		}
		if ( ! Playlists::owned( (int) $request['id'], self::user( $request ) ) ) {
			return new WP_Error( 'rest_post_invalid_id', __( 'Invalid playlist ID.', 'riff' ), array( 'status' => 404 ) );
		}
		return true;
	}

	/**
	 * The user a request names: the signed-in user for me, or the ID given.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return int User ID.
	 */
	private static function user( WP_REST_Request $request ): int {
		$user = (string) $request['user'];
		return 'me' === $user || '' === $user ? get_current_user_id() : (int) $user;
	}

	/**
	 * GET a user's playlists.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_list( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( array( 'items' => Playlists::all( self::user( $request ) ) ) );
	}

	/**
	 * POST a new playlist.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_create( WP_REST_Request $request ) {
		$id = Playlists::create( self::user( $request ), (string) $request['title'], (array) $request['tracks'] );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$response = new WP_REST_Response( Playlists::detail( get_post( $id ) ) );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * GET one playlist.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_get( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( Playlists::detail( get_post( (int) $request['id'] ) ) );
	}

	/**
	 * POST a new name or a new order.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_update( WP_REST_Request $request ): WP_REST_Response {
		$id = (int) $request['id'];
		if ( null !== $request['title'] ) {
			Playlists::rename( $id, (string) $request['title'] );
		}
		if ( null !== $request['tracks'] ) {
			Playlists::set_tracks( $id, (array) $request['tracks'] );
		}
		return self::rest_get( $request );
	}

	/**
	 * DELETE a playlist, to the trash, where someone who can edit it may restore it.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_delete( WP_REST_Request $request ): WP_REST_Response {
		$id   = (int) $request['id'];
		$gone = Playlists::summary( get_post( $id ) );
		wp_trash_post( $id );
		return new WP_REST_Response(
			array(
				'deleted'  => true,
				'previous' => $gone,
			)
		);
	}

	/**
	 * POST tracks onto the end of a playlist.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_add( WP_REST_Request $request ): WP_REST_Response {
		$id = (int) $request['id'];
		Playlists::set_tracks( $id, array_merge( Playlists::ids( get_post( $id ) ), (array) $request['tracks'] ) );
		return self::rest_get( $request );
	}

	/**
	 * DELETE the track at a place.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_remove( WP_REST_Request $request ) {
		$id    = (int) $request['id'];
		$ids   = Playlists::ids( get_post( $id ) );
		$index = (int) $request['index'];
		if ( ! isset( $ids[ $index ] ) ) {
			return new WP_Error( 'rest_invalid_param', __( 'There is no track at that place.', 'riff' ), array( 'status' => 400 ) );
		}
		array_splice( $ids, $index, 1 );
		Playlists::set_tracks( $id, $ids );
		return self::rest_get( $request );
	}

	/**
	 * The signed-in user's playlists for the player, for Add to playlist, with where to send them.
	 *
	 * @since 4.20.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}
		if ( true !== Likes_Rest::allowed() ) {
			// A visitor is offered a way to sign in instead.
			$data['signIn'] = wp_login_url( (string) ( is_singular() ? get_permalink() : home_url( add_query_arg( array() ) ) ) );
			return $data;
		}
		$data['me']['playlists']         = array_map(
			static fn( array $p ): array => array(
				'id'    => $p['id'],
				'title' => $p['title'],
				'count' => $p['count'],
			),
			Playlists::all( get_current_user_id() )
		);
		$data['me']['rest']['playlists'] = rest_url( Library::REST . '/users/me/playlists' );
		return $data;
	}

	/**
	 * The shape of the list of playlists.
	 *
	 * @since 4.20.0
	 * @return array JSON Schema.
	 */
	public static function list_schema(): array {
		return array(
			'$schema'     => 'http://json-schema.org/draft-04/schema#',
			'title'       => 'riff-playlists',
			'description' => __( 'A user\'s playlists, the most recently changed first. Each is a private riff_playlist post holding a core Playlist block.', 'riff' ),
			'type'        => 'object',
			'properties'  => array(
				'items' => array(
					'type'  => 'array',
					'items' => self::summary_schema(),
				),
			),
		);
	}

	/**
	 * The shape of one playlist.
	 *
	 * @since 4.20.0
	 * @return array JSON Schema.
	 */
	public static function playlist_schema(): array {
		$schema                         = self::summary_schema();
		$schema['$schema']              = 'http://json-schema.org/draft-04/schema#';
		$schema['title']                = 'riff-playlist';
		$schema['properties']['ids']    = array(
			'description' => __( 'Every track\'s ID, in order, including any the requester cannot see.', 'riff' ),
			'type'        => 'array',
			'items'       => array( 'type' => 'integer' ),
		);
		$track                          = Tracks::schema();
		$track['properties']['index']   = array(
			'description' => __( 'The track\'s place in the playlist, from 0.', 'riff' ),
			'type'        => 'integer',
		);
		$schema['properties']['tracks'] = array(
			'description' => __( 'The tracks the requester can see, in the track shape, in order.', 'riff' ),
			'type'        => 'array',
			'items'       => array_diff_key( $track, array_flip( array( '$schema', 'title' ) ) ),
		);
		return $schema;
	}

	/**
	 * The shape of a playlist in brief.
	 *
	 * @return array
	 */
	private static function summary_schema(): array {
		return array(
			'type'       => 'object',
			'properties' => array(
				'id'       => array( 'type' => 'integer' ),
				'title'    => array( 'type' => 'string' ),
				'count'    => array(
					'description' => __( 'How many tracks it holds.', 'riff' ),
					'type'        => 'integer',
				),
				'covers'   => array(
					'description' => __( 'Up to four covers from its first tracks, for a mosaic.', 'riff' ),
					'type'        => 'array',
					'items'       => array( 'type' => 'string' ),
				),
				'modified' => array(
					'description' => __( 'When it last changed.', 'riff' ),
					'type'        => 'string',
					'format'      => 'date-time',
				),
			),
		);
	}
}
