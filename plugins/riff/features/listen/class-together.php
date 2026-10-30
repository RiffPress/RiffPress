<?php
/**
 * Listening together: who on the site is playing what, kept in the Presence API's rooms.
 *
 * @since 5.6.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Library;
use Riff\Likes_Rest;
use Riff\Tracks;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_User;

defined( 'ABSPATH' ) || exit;

/**
 * The listening room, riff/listening, and riff/v1/together over it. Each signed-in listener who is
 * playing has one row, `riff-{user ID}`, holding their queue as track IDs, where they are in it and
 * whether they are playing, and the server's time when that was so; a reader works out where the
 * music is now from that and the clock. Tracks are turned back into tracks for each reader, so a
 * listener's track from a post the reader can't read is never shown to them.
 *
 * Only when the Presence API is active and recording. The route is Riff's own, for its player, and
 * not public: it may change with the player.
 */
final class Together {

	/**
	 * The room everyone playing on the site is in. The Presence API keeps it per site.
	 */
	public const ROOM = 'riff/listening';

	/**
	 * Before each of Riff's client IDs, as the Presence API asks of plugins.
	 */
	public const PREFIX = 'riff-';

	/**
	 * The most of a queue that is kept, as many as the tracks route returns at once.
	 */
	public const QUEUE_MAX = 100;

	/**
	 * How far, in seconds, a listener's position may be from where it was said to be heading
	 * before it counts as a seek: about a beat, which a listener along with them won't notice.
	 */
	public const DRIFT = 1.0;

	/**
	 * Hooks the routes.
	 *
	 * @since 5.6.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Whether the Presence API is active and recording on this site.
	 *
	 * @since 5.6.0
	 */
	public static function available(): bool {
		return function_exists( 'wp_presence_is_available' ) && wp_presence_is_available();
	}

	/**
	 * Registers /together and /together/{user}, when there is somewhere to keep the room.
	 *
	 * @since 5.6.0
	 */
	public static function routes(): void {
		if ( ! self::available() ) {
			return;
		}
		/**
		 * GET /riff/v1/together: everyone else playing on the site, by name, with the room's
		 * version. Given the version it last had, while no one has arrived, left, changed what they
		 * share or dropped out, it answers `{ version, changed: false }` without looking up anyone's
		 * track. POST shares what the listener is playing and answers the same; DELETE stops
		 * sharing.
		 *
		 * @since 5.6.0
		 */
		register_rest_route(
			Library::REST,
			'/together',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_room' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'version' => array(
							'description' => __( 'The room\'s version the player last had, as this route gave it.', 'riff' ),
							'type'        => 'string',
						),
					),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_share' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'queue'   => array(
							'description' => __( 'The queue in play order, each track as its audio attachment and the post it plays from.', 'riff' ),
							'type'        => 'array',
							'required'    => true,
							'minItems'    => 1,
							'maxItems'    => self::QUEUE_MAX,
							'items'       => array(
								'type'                 => 'object',
								'additionalProperties' => false,
								'properties'           => array(
									'id'   => array(
										'type'     => 'integer',
										'minimum'  => 1,
										'required' => true,
									),
									'post' => array(
										'type'    => 'integer',
										'minimum' => 0,
									),
								),
							),
						),
						'index'   => array(
							'description' => __( 'Which track of the queue is playing.', 'riff' ),
							'type'        => 'integer',
							'minimum'     => 0,
							'required'    => true,
						),
						'at'      => array(
							'description' => __( 'Where the track is, in seconds.', 'riff' ),
							'type'        => 'number',
							'minimum'     => 0,
							'required'    => true,
						),
						'playing' => array(
							'description' => __( 'Whether it is playing, or paused.', 'riff' ),
							'type'        => 'boolean',
							'required'    => true,
						),
					),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_leave' ),
					'permission_callback' => array( self::class, 'allowed' ),
				),
			)
		);
		/**
		 * GET /riff/v1/together/{user}: what one listener is playing, with their whole queue, to
		 * listen along with them.
		 *
		 * @since 5.6.0
		 */
		register_rest_route(
			Library::REST,
			'/together/(?P<user>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( self::class, 'rest_listener' ),
				'permission_callback' => array( self::class, 'allowed' ),
				'args'                => array(
					'user' => array(
						'description' => __( 'The listener\'s user ID.', 'riff' ),
						'type'        => 'integer',
					),
				),
			)
		);
	}

	/**
	 * Where the player shares what it plays, for a listener who may join the room.
	 *
	 * @since 5.7.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( is_array( $data ) && isset( $data['me'] ) && self::available() ) {
			$data['me']['rest']['together'] = rest_url( Library::REST . '/together' );
		}
		return $data;
	}

	/**
	 * Whether the request may see and join the room: anyone signed in who can read this site, as
	 * for likes.
	 *
	 * @since 5.6.0
	 *
	 * @return true|WP_Error
	 */
	public static function allowed() {
		return Likes_Rest::allowed();
	}

	/**
	 * GET /together.
	 *
	 * @since 5.6.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_room( WP_REST_Request $request ): WP_REST_Response {
		$entries = wp_get_presence( self::ROOM, array( 'client_prefix' => self::PREFIX ) );
		$version = self::version( $entries );
		if ( null !== $request['version'] && (string) $request['version'] === $version ) {
			return new WP_REST_Response(
				array(
					'version' => $version,
					'changed' => false,
				)
			);
		}
		return new WP_REST_Response( self::room( $entries, $version ) );
	}

	/**
	 * POST /together.
	 *
	 * @since 5.6.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_share( WP_REST_Request $request ) {
		$queue = array_map(
			static fn( $item ) => array(
				'id'   => (int) $item['id'],
				'post' => (int) ( $item['post'] ?? 0 ),
			),
			array_values( (array) $request['queue'] )
		);
		$index = (int) $request['index'];
		if ( $index >= count( $queue ) ) {
			return new WP_Error( 'rest_invalid_param', __( 'The index is past the end of the queue.', 'riff' ), array( 'status' => 400 ) );
		}
		$user  = get_current_user_id();
		$state = array(
			'queue'   => $queue,
			'index'   => $index,
			'at'      => (float) $request['at'],
			'since'   => self::now(),
			'playing' => (bool) $request['playing'],
		);
		// Sharing again to stay in the room, with nothing new, keeps what was shared, so the room's
		// version stays where it was and no one along with them corrects for nothing.
		$was = self::shared( $user );
		if ( $was && self::same( $was, $state ) ) {
			$state['at']    = (float) $was['at'];
			$state['since'] = (int) $was['since'];
		}
		$entries = wp_presence_exchange(
			self::ROOM,
			self::PREFIX . $user,
			$state,
			array(
				'user_id'       => $user,
				'client_prefix' => self::PREFIX,
				'wp_error'      => true,
			)
		);
		if ( is_wp_error( $entries ) ) {
			return new WP_Error( 'riff_together_unavailable', __( 'Listening together is not available right now.', 'riff' ), array( 'status' => 503 ) );
		}
		return new WP_REST_Response( self::room( $entries, self::version( $entries ) ) );
	}

	/**
	 * What a listener last shared, or null when they aren't in the room.
	 *
	 * @param int $user User ID.
	 * @return array|null
	 */
	private static function shared( int $user ): ?array {
		foreach ( wp_get_presence( self::ROOM, array( 'client_prefix' => self::PREFIX . $user ) ) as $entry ) {
			$row = self::row( $entry );
			if ( $row && $user === $row['user']->ID ) {
				return $row['state'];
			}
		}
		return null;
	}

	/**
	 * Whether two shares say the same: the same queue, track and playing, and the position where
	 * the first said it would be by the time of the second.
	 *
	 * @param array $was The share before.
	 * @param array $now The share now.
	 * @return bool
	 */
	private static function same( array $was, array $now ): bool {
		if ( ( $was['queue'] ?? null ) !== $now['queue'] || ( $was['index'] ?? null ) !== $now['index'] || ( $was['playing'] ?? null ) !== $now['playing'] ) {
			return false;
		}
		$heading = (float) ( $was['at'] ?? 0 ) + ( $now['playing'] ? ( $now['since'] - (int) ( $was['since'] ?? 0 ) ) / 1000 : 0 );
		return abs( $heading - $now['at'] ) <= self::DRIFT;
	}

	/**
	 * DELETE /together.
	 *
	 * @since 5.6.0
	 *
	 * @return WP_REST_Response
	 */
	public static function rest_leave(): WP_REST_Response {
		$entries = (array) wp_presence_leave( self::ROOM, self::PREFIX . get_current_user_id(), array( 'client_prefix' => self::PREFIX ) );
		return new WP_REST_Response( self::room( $entries, self::version( $entries ) ) );
	}

	/**
	 * GET /together/{user}.
	 *
	 * @since 5.6.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_listener( WP_REST_Request $request ) {
		foreach ( wp_get_presence( self::ROOM, array( 'client_prefix' => self::PREFIX . (int) $request['user'] ) ) as $entry ) {
			$row = self::row( $entry );
			if ( ! $row || (int) $request['user'] !== $row['user']->ID ) {
				continue;
			}
			$tracks = Tracks::readable( $row['queue'] );
			if ( empty( $tracks[ $row['index'] ] ) ) {
				break;
			}
			// With their queue: the tracks the current user can't see are left out, and the index
			// follows its track.
			$listener          = self::listener( $row, $tracks[ $row['index'] ] );
			$listener['index'] = count( array_filter( array_slice( $tracks, 0, $row['index'] ) ) );
			$listener['queue'] = array_values( array_filter( $tracks ) );
			// The server's clock, so the player works out where they are now without trusting its own.
			$listener['now'] = self::now();
			return new WP_REST_Response( $listener );
		}
		return new WP_Error( 'riff_together_not_listening', __( 'They aren\'t listening to anything you can hear.', 'riff' ), array( 'status' => 404 ) );
	}

	/**
	 * The room as the current user sees it: everyone else, each with the track they are on, by name,
	 * so the order stays put while they listen.
	 *
	 * @param object[]    $entries The room's rows, from the Presence API.
	 * @param string|null $version The room's version.
	 * @return array `{ version, changed, listeners }`.
	 */
	private static function room( array $entries, ?string $version ): array {
		$rows = array();
		foreach ( $entries as $entry ) {
			$row = self::row( $entry );
			if ( $row && get_current_user_id() !== $row['user']->ID ) {
				$rows[] = $row;
			}
		}
		// Everyone's track, looked up at once.
		$tracks    = Tracks::readable( array_map( static fn( $row ) => $row['queue'][ $row['index'] ], $rows ) );
		$listeners = array();
		foreach ( $rows as $i => $row ) {
			if ( $tracks[ $i ] ) {
				$listeners[] = self::listener( $row, $tracks[ $i ] );
			}
		}
		usort( $listeners, static fn( $a, $b ) => array( strtolower( $a['user']['name'] ), $a['user']['id'] ) <=> array( strtolower( $b['user']['name'] ), $b['user']['id'] ) );
		return array(
			'version'   => $version,
			'changed'   => true,
			'listeners' => $listeners,
		);
	}

	/**
	 * A row of the room as a listener and what they shared, or null for a row this class didn't
	 * write: one for each listener, `riff-{user ID}`, naming a track in their queue.
	 *
	 * @param object $entry A row of the room.
	 * @return array|null `{ user, state, queue, index }`.
	 */
	private static function row( object $entry ): ?array {
		$user  = get_userdata( (int) $entry->user_id );
		$state = (array) $entry->data;
		$queue = array_values( array_filter( (array) ( $state['queue'] ?? array() ), 'is_array' ) );
		$index = (int) ( $state['index'] ?? 0 );
		if ( ! $user instanceof WP_User || self::PREFIX . $user->ID !== $entry->client_id || ! isset( $queue[ $index ] ) ) {
			return null;
		}
		return compact( 'user', 'state', 'queue', 'index' );
	}

	/**
	 * One listener, as the current user sees them: who they are, the track they are on, and where
	 * it was and when.
	 *
	 * @param array $row   The listener's row, from row().
	 * @param array $track Their track, as the current user may see it.
	 * @return array
	 */
	private static function listener( array $row, array $track ): array {
		return array(
			'user'    => array(
				'id'   => $row['user']->ID,
				'name' => $row['user']->display_name,
				'face' => Browse::face( $row['user'] ),
			),
			'track'   => $track,
			'at'      => (float) ( $row['state']['at'] ?? 0 ),
			'since'   => (int) ( $row['state']['since'] ?? 0 ),
			'playing' => ! empty( $row['state']['playing'] ),
		);
	}

	/**
	 * The room's version: the Presence API's, which moves when someone arrives, leaves or changes
	 * what they share, with who is in the room now, which changes when someone drops out, as the
	 * Presence API's version doesn't. The player keeps it as it is given.
	 *
	 * @param object[] $entries The room's rows, read with the version.
	 * @return string|null Null for an empty room.
	 */
	private static function version( array $entries ): ?string {
		if ( ! $entries ) {
			return null;
		}
		$clients = wp_list_pluck( $entries, 'client_id' );
		sort( $clients );
		return ( wp_get_presence_room_versions( array( self::ROOM ) )[ self::ROOM ] ?? '' ) . '-' . substr( md5( implode( ' ', $clients ) ), 0, 8 );
	}

	/**
	 * The server's time, in milliseconds since the epoch.
	 *
	 * @return int
	 */
	private static function now(): int {
		return (int) round( microtime( true ) * 1000 );
	}
}
