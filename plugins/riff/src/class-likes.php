<?php
/**
 * Likes and what was played, for a signed-in user: kept as their user options, read and written
 * over REST.
 *
 * @since 4.20.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * A listener's likes and recently played.
 *
 * A signed-in user's likes and recently played are two user options, `riff_likes` and
 * `riff_history`, so they need no table of their own, and on a multisite network each site keeps
 * its own, since a track's ID means a different file on each. A visitor's stay in their browser;
 * the player sends them to the account the first time it loads after they sign in, and forgets
 * them on the device. A like is a track (an audio attachment), an album or an artist (a
 * `riff_album` or `riff_artist` term), by ID, with when it was liked; a play is a track by ID,
 * with when it was played.
 */
final class Likes {

	/**
	 * The user option holding a user's likes, newest first: `{ kind, id, at }`, `at` in
	 * milliseconds since the epoch.
	 *
	 * @since 4.20.0
	 */
	public const OPTION = 'riff_likes';

	/**
	 * The user option holding the tracks a user played, newest first: `{ id, played, post }`, the post being where it was played from.
	 *
	 * @since 4.20.0
	 */
	public const HISTORY_OPTION = 'riff_history';

	/**
	 * What can be liked.
	 *
	 * @since 4.20.0
	 */
	public const KINDS = array( 'track', 'album', 'artist' );

	/**
	 * Likes kept per user. The oldest go first.
	 *
	 * @since 4.20.0
	 */
	public const MAX = 2000;

	/**
	 * Tracks kept in recently played, the same number the player keeps on a device.
	 *
	 * @since 4.20.0
	 */
	public const HISTORY_MAX = 30;

	/**
	 * Hooks the routes, the player's data and the privacy tools.
	 *
	 * @since 4.20.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
		add_filter( 'wp_privacy_personal_data_exporters', array( self::class, 'exporters' ) );
		add_filter( 'wp_privacy_personal_data_erasers', array( self::class, 'erasers' ) );
		add_action( 'admin_init', array( self::class, 'privacy_policy' ) );
	}

	/**
	 * Suggests text for the site's privacy policy, under Settings > Privacy: what Riff keeps about
	 * a listener, and where.
	 *
	 * @since 4.21.0
	 */
	public static function privacy_policy(): void {
		if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
			return;
		}
		$text = '<p>' . __( 'When you are signed in, the tracks, albums and artists you like and the tracks you recently played are saved to your account on this site, so they follow you between devices, as are the playlists you make. You can ask for them to be exported or erased like the rest of your personal data.', 'riff' ) . '</p>'
			. '<p>' . __( 'When you are not signed in, your likes, recently played tracks and the queue are kept in your own browser&#8217;s storage, and are never sent to this site.', 'riff' ) . '</p>'
			. '<p>' . __( 'While your browser keeps a listening history, the player also sets a cookie named riff_history. Its value is only 1 or 2, saying whether there is a history to show, so the Listen page can make room for it before the page appears. It holds nothing about what you played, is used only by this site, and is strictly necessary for the page to work as designed. It lasts a year, and is removed when the history is gone or you sign in.', 'riff' ) . '</p>';
		wp_add_privacy_policy_content( 'Riff', wp_kses_post( $text ) );
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
					'enum'        => self::KINDS,
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
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array( 'user' => $user ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_like' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user'  => $user,
						'items' => array(
							'description' => __( 'Likes to add: a kind and an ID each, and when it was liked.', 'riff' ),
							'type'        => 'array',
							'items'       => $item,
							'maxItems'    => self::MAX,
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
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user' => $user,
						'kind' => array(
							'description' => __( 'What was liked: track, album or artist.', 'riff' ),
							'type'        => 'string',
							'enum'        => self::KINDS,
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
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array( 'user' => $user ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_played' ),
					'permission_callback' => array( self::class, 'allowed' ),
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
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array( 'user' => $user ),
				),
				'schema' => array( self::class, 'history_schema' ),
			)
		);
	}

	/**
	 * Whether the request may read and change these likes: a signed-in user who can read this site,
	 * for their own (me, or their own ID); for anyone else's, a user who can edit that user, as
	 * core's application passwords route asks. Over cookies that means a valid REST nonce too,
	 * since without one WordPress treats the request as a visitor's.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request|null $request Request.
	 * @return true|WP_Error
	 */
	public static function allowed( $request = null ) {
		if ( ! is_user_logged_in() ) {
			return new WP_Error( 'rest_not_logged_in', __( 'Sign in to keep likes in your account.', 'riff' ), array( 'status' => 401 ) );
		}
		if ( ! current_user_can( 'read' ) ) {
			return new WP_Error( 'rest_forbidden', __( 'Sorry, you are not allowed to keep likes on this site.', 'riff' ), array( 'status' => 403 ) );
		}
		$user = $request instanceof WP_REST_Request ? self::user( $request ) : get_current_user_id();
		if ( get_current_user_id() !== $user ) {
			if ( ! $user || ! get_userdata( $user ) ) {
				return new WP_Error( 'rest_user_invalid_id', __( 'Invalid user ID.', 'riff' ), array( 'status' => 404 ) );
			}
			if ( ! current_user_can( 'edit_user', $user ) ) {
				return new WP_Error( 'rest_forbidden', __( 'Sorry, you are not allowed to see that user\'s likes.', 'riff' ), array( 'status' => 403 ) );
			}
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
	 * GET /users/{user}/likes.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_likes( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( array( 'items' => self::get( self::user( $request ) ) ) );
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
		return new WP_REST_Response( array( 'items' => self::add( self::user( $request ), (array) $request['items'] ) ) );
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
		return new WP_REST_Response( array( 'items' => self::remove( self::user( $request ), (string) $request['kind'], (int) $request['id'] ) ) );
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
		return new WP_REST_Response( array( 'items' => self::history_tracks( self::user( $request ) ) ) );
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
		self::played( self::user( $request ), (array) $request['items'] );
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
		delete_user_option( self::user( $request ), self::HISTORY_OPTION );
		return new WP_REST_Response( array( 'items' => array() ) );
	}

	/**
	 * A user's likes, newest first.
	 *
	 * @since 4.20.0
	 *
	 * @param int $user_id User ID.
	 * @return array[] Likes: kind, id, at.
	 */
	public static function get( int $user_id ): array {
		return self::clean( get_user_option( self::OPTION, $user_id ) );
	}

	/**
	 * Adds likes to a user's. One that names nothing on this site is left out; one already liked
	 * keeps its place.
	 *
	 * @since 4.20.0
	 *
	 * @param int   $user_id User ID.
	 * @param array $items   Likes: kind, id, and at when known.
	 * @return array[] The user's likes after.
	 */
	public static function add( int $user_id, array $items ): array {
		$now   = self::now();
		$likes = self::get( $user_id );
		$added = array();
		$have  = array();
		foreach ( $likes as $like ) {
			$have[ $like['kind'] . ':' . $like['id'] ] = true;
		}
		foreach ( $items as $item ) {
			$kind = is_array( $item ) ? (string) ( $item['kind'] ?? '' ) : '';
			$id   = is_array( $item ) ? (int) ( $item['id'] ?? 0 ) : 0;
			$key  = $kind . ':' . $id;
			if ( isset( $have[ $key ] ) || ! self::exists( $kind, $id ) ) {
				continue;
			}
			$at           = (int) ( $item['at'] ?? 0 );
			$added[]      = array(
				'kind' => $kind,
				'id'   => $id,
				'at'   => $at > 0 && $at <= $now ? $at : $now,
			);
			$have[ $key ] = true;
		}
		// New likes first, so one made in the same millisecond as an older one still leads.
		$likes = self::clean( array_merge( array_reverse( $added ), $likes ) );
		update_user_option( $user_id, self::OPTION, $likes );
		return $likes;
	}

	/**
	 * Takes one like away.
	 *
	 * @since 4.20.0
	 *
	 * @param int    $user_id User ID.
	 * @param string $kind    track, album or artist.
	 * @param int    $id      ID.
	 * @return array[] The user's likes after.
	 */
	public static function remove( int $user_id, string $kind, int $id ): array {
		$likes = array_values( array_filter( self::get( $user_id ), static fn( $like ) => ! ( $like['kind'] === $kind && $like['id'] === $id ) ) );
		update_user_option( $user_id, self::OPTION, $likes );
		return $likes;
	}

	/**
	 * What a user played, newest first, by track ID.
	 *
	 * @since 4.20.0
	 *
	 * @param int $user_id User ID.
	 * @return array[] Plays: id, played, and the post it was played from.
	 */
	public static function history( int $user_id ): array {
		return self::clean_history( get_user_option( self::HISTORY_OPTION, $user_id ) );
	}

	/**
	 * Adds plays to a user's history. A track played again moves to the front.
	 *
	 * @since 4.20.0
	 *
	 * @param int   $user_id User ID.
	 * @param array $items   Plays: id, and played and post when known.
	 * @return array[] The user's history after.
	 */
	public static function played( int $user_id, array $items ): array {
		$now  = self::now();
		$list = self::history( $user_id );
		foreach ( $items as $item ) {
			$id = is_array( $item ) ? (int) ( $item['id'] ?? 0 ) : 0;
			if ( ! self::exists( 'track', $id ) ) {
				continue;
			}
			$at     = (int) ( $item['played'] ?? 0 );
			$list[] = array(
				'id'     => $id,
				'played' => $at > 0 && $at <= $now ? $at : $now,
				'post'   => (int) ( $item['post'] ?? 0 ),
			);
		}
		// The latest play of each track counts.
		usort( $list, static fn( $a, $b ) => $b['played'] <=> $a['played'] );
		$list = self::clean_history( $list );
		update_user_option( $user_id, self::HISTORY_OPTION, $list );
		return $list;
	}

	/**
	 * A user's history as tracks, in the shape the player keeps, each with `played`. A track the
	 * user can no longer see, such as one whose post went private, is left out.
	 *
	 * @since 4.20.0
	 *
	 * @param int $user_id User ID.
	 * @return array[] Tracks.
	 */
	public static function history_tracks( int $user_id ): array {
		$plays = self::history( $user_id );
		if ( ! $plays ) {
			return array();
		}
		$request = new WP_REST_Request( 'GET', '/' . Library::REST . '/tracks' );
		$request->set_query_params(
			array(
				'include'  => wp_list_pluck( $plays, 'id' ),
				'orderby'  => 'include',
				'per_page' => self::HISTORY_MAX,
			)
		);
		$response = rest_do_request( $request );
		if ( $response->is_error() ) {
			return array();
		}
		$when   = array_column( $plays, 'played', 'id' );
		$from   = array_column( $plays, 'post', 'id' );
		$tracks = array();
		foreach ( (array) ( $response->get_data()['items'] ?? array() ) as $track ) {
			// As it was played: from its post, which names where it plays from and lends its art,
			// while the user can still read that post.
			$post = get_post( (int) ( $from[ (int) $track['id'] ] ?? 0 ) );
			if ( $post && ( is_post_publicly_viewable( $post ) || current_user_can( 'read_post', $post->ID ) ) && ! post_password_required( $post ) ) {
				$track = Tracks::from_attachment( (int) $track['id'], $post->ID ) ?? $track;
			}
			// Without the level envelope, as the player keeps it on a device.
			unset( $track['levels'] );
			$track['played'] = (int) ( $when[ (int) $track['id'] ] ?? 0 );
			$tracks[]        = $track;
		}
		return $tracks;
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
		if ( ! is_array( $data ) || true !== self::allowed() ) {
			return $data;
		}
		$user       = get_current_user_id();
		$data['me'] = array(
			'likes'   => self::get( $user ),
			'history' => self::history_tracks( $user ),
			'rest'    => array(
				'likes'   => rest_url( Library::REST . '/users/me/likes' ),
				'history' => rest_url( Library::REST . '/users/me/history' ),
			),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
		);
		return $data;
	}

	/**
	 * Whether a like or a play names something on this site: an audio attachment for a track, a
	 * term for an album or artist.
	 *
	 * @param string $kind track, album or artist.
	 * @param int    $id   ID.
	 * @return bool
	 */
	private static function exists( string $kind, int $id ): bool {
		if ( $id <= 0 ) {
			return false;
		}
		if ( 'track' === $kind ) {
			return 'attachment' === get_post_type( $id ) && str_starts_with( (string) get_post_mime_type( $id ), 'audio/' );
		}
		$taxonomy = array(
			'album'  => Catalog::ALBUM,
			'artist' => Catalog::ARTIST,
		)[ $kind ] ?? '';
		return '' !== $taxonomy && null !== term_exists( $id, $taxonomy );
	}

	/**
	 * Likes as stored: well formed, each once, newest first, no more than MAX.
	 *
	 * @param mixed $likes What was stored.
	 * @return array[]
	 */
	private static function clean( $likes ): array {
		$out  = array();
		$seen = array();
		foreach ( is_array( $likes ) ? $likes : array() as $like ) {
			if ( ! is_array( $like ) || ! in_array( $like['kind'] ?? '', self::KINDS, true ) || (int) ( $like['id'] ?? 0 ) <= 0 ) {
				continue;
			}
			$key = $like['kind'] . ':' . (int) $like['id'];
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = array(
				'kind' => (string) $like['kind'],
				'id'   => (int) $like['id'],
				'at'   => max( 0, (int) ( $like['at'] ?? 0 ) ),
			);
		}
		usort( $out, static fn( $a, $b ) => $b['at'] <=> $a['at'] );
		return array_slice( $out, 0, self::MAX );
	}

	/**
	 * History as stored: well formed, each track once at its latest play, no more than HISTORY_MAX.
	 *
	 * @param mixed $stored What was stored.
	 * @return array[]
	 */
	private static function clean_history( $stored ): array {
		$out  = array();
		$seen = array();
		foreach ( is_array( $stored ) ? $stored : array() as $play ) {
			$id = is_array( $play ) ? (int) ( $play['id'] ?? 0 ) : 0;
			if ( $id <= 0 || isset( $seen[ $id ] ) ) {
				continue;
			}
			$seen[ $id ] = true;
			$out[]       = array(
				'id'     => $id,
				'played' => max( 0, (int) ( $play['played'] ?? 0 ) ),
				'post'   => max( 0, (int) ( $play['post'] ?? 0 ) ),
			);
		}
		return array_slice( $out, 0, self::HISTORY_MAX );
	}

	/**
	 * Now, in milliseconds since the epoch, as the browser counts.
	 *
	 * @return int
	 */
	private static function now(): int {
		return (int) floor( microtime( true ) * 1000 );
	}

	/**
	 * Adds Riff's exporter to Tools > Export Personal Data.
	 *
	 * @since 4.20.0
	 *
	 * @param array $exporters Exporters.
	 * @return array
	 */
	public static function exporters( $exporters ) {
		$exporters         = (array) $exporters;
		$exporters['riff'] = array(
			'exporter_friendly_name' => __( 'Riff likes and listening', 'riff' ),
			'callback'               => array( self::class, 'export' ),
		);
		return $exporters;
	}

	/**
	 * Adds Riff's eraser to Tools > Erase Personal Data.
	 *
	 * @since 4.20.0
	 *
	 * @param array $erasers Erasers.
	 * @return array
	 */
	public static function erasers( $erasers ) {
		$erasers         = (array) $erasers;
		$erasers['riff'] = array(
			'eraser_friendly_name' => __( 'Riff likes and listening', 'riff' ),
			'callback'             => array( self::class, 'erase' ),
		);
		return $erasers;
	}

	/**
	 * A user's likes and recently played, for their personal data export.
	 *
	 * @since 4.20.0
	 *
	 * @param string $email The user's email address.
	 * @return array
	 */
	public static function export( $email ): array {
		$user = get_user_by( 'email', (string) $email );
		$data = array();
		if ( $user ) {
			foreach ( self::get( $user->ID ) as $like ) {
				$data[] = array(
					'name'  => array(
						'track'  => __( 'Liked song', 'riff' ),
						'album'  => __( 'Liked album', 'riff' ),
						'artist' => __( 'Liked artist', 'riff' ),
					)[ $like['kind'] ],
					'value' => self::name( $like['kind'], $like['id'], $user->ID ),
				);
			}
			foreach ( self::history( $user->ID ) as $play ) {
				$data[] = array(
					'name'  => __( 'Played', 'riff' ),
					'value' => self::name( 'track', $play['id'], $user->ID ) . ' (' . wp_date( 'Y-m-d H:i', (int) floor( $play['played'] / 1000 ) ) . ')',
				);
			}
		}
		return array(
			'data' => $data ? array(
				array(
					'group_id'    => 'riff',
					'group_label' => __( 'Riff', 'riff' ),
					'item_id'     => 'riff-' . (int) $user->ID,
					'data'        => $data,
				),
			) : array(),
			'done' => true,
		);
	}

	/**
	 * Erases a user's likes and recently played.
	 *
	 * @since 4.20.0
	 *
	 * @param string $email The user's email address.
	 * @return array
	 */
	public static function erase( $email ): array {
		$user    = get_user_by( 'email', (string) $email );
		$removed = false;
		if ( $user ) {
			$removed = ( self::get( $user->ID ) || self::history( $user->ID ) );
			delete_user_option( $user->ID, self::OPTION );
			delete_user_option( $user->ID, self::HISTORY_OPTION );
		}
		return array(
			'items_removed'  => $removed,
			'items_retained' => false,
			'messages'       => array(),
			'done'           => true,
		);
	}

	/**
	 * A like's name for the export: a track's title, an album's or artist's name, or its ID once
	 * it is gone. A track the user cannot see, by the rule GET /tracks follows, is named by its ID
	 * too, since the export is sent to them.
	 *
	 * @param string $kind    track, album or artist.
	 * @param int    $id      ID.
	 * @param int    $user_id Whose export it is.
	 * @return string
	 */
	private static function name( string $kind, int $id, int $user_id ): string {
		if ( 'track' === $kind ) {
			$title = Catalog_Rest::visible( $id, $user_id ) ? get_the_title( $id ) : '';
			return '' !== $title ? $title : '#' . $id;
		}
		$term = get_term( $id );
		return $term instanceof \WP_Term ? $term->name : '#' . $id;
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
			'description' => __( 'The signed-in user\'s likes, newest first. Kept as the riff_likes user option, one list per site.', 'riff' ),
			'type'        => 'object',
			'properties'  => array(
				'items' => array(
					'type'  => 'array',
					'items' => array(
						'type'       => 'object',
						'properties' => array(
							'kind' => array(
								'type' => 'string',
								'enum' => self::KINDS,
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
			'description' => __( 'The tracks the signed-in user played, newest first, at most 30. Kept as the riff_history user option, one list per site.', 'riff' ),
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
