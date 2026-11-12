<?php
/**
 * Listening together: who on the site is playing what, kept in the Presence API's rooms.
 *
 * @since 5.6.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Catalog;
use Riff\Library;
use Riff\Listener;
use Riff\Registry;
use Riff\Tracks;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_User;

defined( 'ABSPATH' ) || exit;

/**
 * The listening room, riff/listening, and riff/v1/together over it. Each signed-in listener who is
 * playing has one row, `riff-{user ID}`, holding their queue as track IDs, which of them plays, and
 * a schedule: where the music is at a time on the server's clock, `since`, and whether it plays from
 * then. A reader works out where the music is at any moment from that and the clock. Tracks are
 * turned back into tracks for each reader, so a listener's track from a post the reader can't read
 * is never shown to them.
 *
 * Following is a light show's way of keeping time: a change by a listener someone follows is due a
 * moment ahead, LEAD, so it reaches every follower before it is due, and each of them, the host
 * too, makes it at that moment by the server's clock. Nothing is chased or corrected after.
 *
 * Whoever is signed in sees the session they are in in the Together panel beside the page: who they follow
 * and who else is with them, or who is with them, and the way out; and, on an album's page, the
 * faces of whoever is playing from it now.
 *
 * Sharing is each listener's choice, under Personal Options on their profile, where WordPress keeps
 * their other choices about how the site behaves for them. It is on unless they turn it off, or a
 * site says otherwise through the `riff_together_share` filter; turned off, nothing is sent, and they
 * leave the room at once.
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
	 * How far ahead, in milliseconds, a change by a listener someone follows is due: longer than a
	 * follower waits between asks (a second, in the player) and a round trip, so it reaches them
	 * before it is due, and short enough that the host's own press still feels taken.
	 *
	 * @since 5.8.0
	 */
	public const LEAD = 1500;

	/**
	 * The user option holding a listener's choice: `on` or `off`; absent for the site's default. A
	 * user option, so on a network each site keeps its own, as likes are kept.
	 *
	 * @since 5.8.0
	 */
	public const SHARE = 'riff_together_share';

	/**
	 * Before a host's user ID, the room of who is following them: each follower one row,
	 * `riff-{user ID}`, kept while they follow.
	 *
	 * @since 5.8.0
	 */
	public const SESSION = 'riff/session:';

	/**
	 * The query argument a link to listen along with someone carries: their user ID. The player
	 * reads it and takes it out of the address.
	 *
	 * @since 6.15.0
	 */
	public const ALONG = 'riff-along';

	/**
	 * The most listeners elsewhere (`riff_together_elsewhere`) the room shows.
	 *
	 * @since 6.15.0
	 */
	public const ELSEWHERE_MAX = 20;

	/**
	 * Hooks the routes, the profile field and the Together panel.
	 *
	 * @since 5.6.0
	 * @since 5.8.0 And the profile field and the Together panel.
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
		add_action( Registry::HOOK, array( self::class, 'view' ) );
		add_action( 'personal_options', array( self::class, 'field' ) );
		add_action( 'personal_options_update', array( self::class, 'save' ) );
		add_action( 'edit_user_profile_update', array( self::class, 'save' ) );
		Together_Scenes::register();
	}

	/**
	 * Whether a listener shares what they play: their choice, or the site's default for whoever
	 * hasn't made one.
	 *
	 * @since 5.8.0
	 *
	 * @param int $user_id User ID; 0 for a visitor, who never shares.
	 * @return bool
	 */
	public static function shares( int $user_id ): bool {
		if ( $user_id <= 0 ) {
			return false;
		}
		$choice = get_user_option( self::SHARE, $user_id );
		if ( 'on' === $choice || 'off' === $choice ) {
			return 'on' === $choice;
		}
		/**
		 * Filters whether a listener who hasn't chosen shares what they play with the site's other
		 * listeners. A site where listeners shouldn't see each other unless they ask, a class of
		 * children say, returns false.
		 *
		 * @since 5.8.0
		 *
		 * @param bool $share   Whether they share. Default true.
		 * @param int  $user_id The listener.
		 */
		return (bool) apply_filters( 'riff_together_share', true, $user_id );
	}

	/**
	 * The checkbox under Personal Options, where listening together is available.
	 *
	 * @since 5.8.0
	 *
	 * @param WP_User $user The user being edited.
	 */
	public static function field( $user ): void {
		if ( ! $user instanceof WP_User || ! self::available() ) {
			return;
		}
		?>
		<tr class="riff-together-share-wrap">
			<th scope="row"><?php esc_html_e( 'Listening together', 'riff' ); ?></th>
			<td>
				<label for="riff_together_share">
					<input name="riff_together_share" type="checkbox" id="riff_together_share" value="on" <?php checked( self::shares( $user->ID ) ); ?>>
					<?php esc_html_e( 'Share what I’m listening to with the site’s other listeners', 'riff' ); ?>
				</label>
				<?php wp_nonce_field( 'riff_together_share_' . $user->ID, 'riff_together_share_nonce' ); ?>
			</td>
		</tr>
		<?php
	}

	/**
	 * Saves the checkbox when the profile is saved. Turned off, the listener leaves the room at
	 * once, rather than when their row would have run out.
	 *
	 * @since 5.8.0
	 *
	 * @param int $user_id The user being saved.
	 */
	public static function save( $user_id ): void {
		$user_id = (int) $user_id;
		if (
			! current_user_can( 'edit_user', $user_id ) ||
			! isset( $_POST['riff_together_share_nonce'] ) ||
			! wp_verify_nonce( sanitize_key( wp_unslash( $_POST['riff_together_share_nonce'] ) ), 'riff_together_share_' . $user_id )
		) {
			return;
		}
		$on = isset( $_POST['riff_together_share'] );
		update_user_option( $user_id, self::SHARE, $on ? 'on' : 'off' );
		if ( ! $on && self::available() ) {
			self::leave( $user_id, 'stopped-sharing' );
		}
	}

	/**
	 * The Together panel beside the page, after Up next, registered as any plugin's view is, for a
	 * listener who may join the room: a visitor, or anyone where the Presence API isn't recording,
	 * has none. A panel rather than a screen of Now Playing, as it is about who is listening, not
	 * the track, and is opened while the page or the album goes on showing.
	 *
	 * @since 5.8.0
	 */
	public static function view(): void {
		if ( ! self::available() || true !== Listener::signed_in() ) {
			return;
		}
		Registry::register_view(
			'together',
			array(
				'label' => __( 'Together', 'riff' ),
				'icon'  => 'group',
				'order' => 45,
				'place' => 'side',
			)
		);
	}

	/**
	 * Where an album's page shows the faces of whoever is playing from it now: hidden until the
	 * Listen app has asked the room, and only for a listener who may.
	 *
	 * @since 5.8.0
	 *
	 * @param int $album Album term ID.
	 * @return string
	 */
	public static function faces( int $album ): string {
		if ( $album <= 0 || ! self::available() || true !== Listener::signed_in() ) {
			return '';
		}
		return sprintf(
			'<span class="riff-album-together" data-riff-together="%s" hidden><span class="riff-album-faces"></span><span class="riff-album-together-label">%s</span></span>',
			esc_url( add_query_arg( 'album', $album, rest_url( Library::REST . '/together' ) ) ),
			esc_html__( 'Listening now', 'riff' )
		);
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
		 * sharing. Given an album, it lists only those playing a track from it.
		 *
		 * @since 5.6.0
		 * @since 5.8.0 The album argument.
		 */
		register_rest_route(
			Library::REST,
			'/together',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_room' ),
					'permission_callback' => array( Listener::class, 'signed_in' ),
					'args'                => array(
						'version' => array(
							'description' => __( 'The room\'s version the player last had, as this route gave it.', 'riff' ),
							'type'        => 'string',
						),
						'album'   => array(
							'description' => __( 'Only listeners playing a track from this album, by its term ID.', 'riff' ),
							'type'        => 'integer',
							'minimum'     => 1,
						),
					),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_share' ),
					'permission_callback' => array( Listener::class, 'signed_in' ),
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
							'description' => __( 'Whether it plays from the change on, or is paused.', 'riff' ),
							'type'        => 'boolean',
							'required'    => true,
						),
						'running' => array(
							'description' => __( 'Whether the music plays until the change is due, as it does after a seek; not when it is held for its start, or was paused. Playing, unless said.', 'riff' ),
							'type'        => 'boolean',
						),
						'when'    => array(
							'description' => __( 'When at was read, in milliseconds on the server\'s clock, as the player knows it.', 'riff' ),
							'type'        => 'integer',
							'minimum'     => 0,
						),
					),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_leave' ),
					'permission_callback' => array( Listener::class, 'signed_in' ),
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
				'permission_callback' => array( Listener::class, 'signed_in' ),
				'args'                => array(
					'user' => array(
						'description' => __( 'The listener\'s user ID.', 'riff' ),
						'type'        => 'integer',
					),
				),
			)
		);
		/**
		 * POST /riff/v1/together/{user}/follow: follows a listener, and stays following while the
		 * player asks again each second. Answers with their schedule, as GET /together/{user}
		 * does, with their queue only when it isn't the version the player has, with when the
		 * server took the request and answered it, and with who else follows them and shares what
		 * they play. DELETE stops following.
		 *
		 * @since 5.8.0
		 */
		register_rest_route(
			Library::REST,
			'/together/(?P<user>\d+)/follow',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_follow' ),
					'permission_callback' => array( Listener::class, 'signed_in' ),
					'args'                => array(
						'user'    => array(
							'description' => __( 'The listener\'s user ID.', 'riff' ),
							'type'        => 'integer',
						),
						'version' => array(
							'description' => __( 'The version of their queue the player has, as this route gave it.', 'riff' ),
							'type'        => 'string',
						),
					),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_unfollow' ),
					'permission_callback' => array( Listener::class, 'signed_in' ),
					'args'                => array(
						'user' => array(
							'description' => __( 'The listener\'s user ID.', 'riff' ),
							'type'        => 'integer',
						),
					),
				),
			)
		);
		/**
		 * GET /riff/v1/together/following: who is following the current user, by name.
		 *
		 * @since 5.8.0
		 */
		register_rest_route(
			Library::REST,
			'/together/following',
			array(
				'methods'             => 'GET',
				'callback'            => array( self::class, 'rest_following' ),
				'permission_callback' => array( Listener::class, 'signed_in' ),
			)
		);
		/**
		 * GET /riff/v1/together/clock: when the server took the request and when it answered, in
		 * milliseconds since the epoch, for the player to learn how far its clock is from the
		 * server's.
		 *
		 * @since 5.8.0
		 */
		register_rest_route(
			Library::REST,
			'/together/clock',
			array(
				'methods'             => 'GET',
				'callback'            => array( self::class, 'rest_clock' ),
				'permission_callback' => array( Listener::class, 'signed_in' ),
			)
		);
	}

	/**
	 * Where the player shares what it plays, for a listener who may join the room, and whether they
	 * share.
	 *
	 * @since 5.7.0
	 * @since 5.8.0 And whether they share.
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( is_array( $data ) && isset( $data['me'] ) && self::available() ) {
			$data['me']['rest']['together'] = rest_url( Library::REST . '/together' );
			$data['me']['sharing']          = self::shares( get_current_user_id() );
		}
		return $data;
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
		$entries   = wp_get_presence( self::ROOM, array( 'client_prefix' => self::PREFIX ) );
		$version   = self::version( $entries );
		$album     = (int) $request['album'];
		$elsewhere = $album > 0 ? array() : self::elsewhere( get_current_user_id() );
		// Listeners elsewhere change without the room: the version moves with them too.
		if ( $elsewhere ) {
			$version = $version . '-' . substr( md5( (string) wp_json_encode( $elsewhere ) ), 0, 12 );
		}
		if ( null !== $request['version'] && (string) $request['version'] === $version ) {
			return new WP_REST_Response(
				array(
					'version' => $version,
					'changed' => false,
				)
			);
		}
		$room = self::room( $entries, $version, $album );
		if ( $album <= 0 ) {
			$room['elsewhere']       = $elsewhere;
			$room['elsewhere_label'] = $elsewhere ? self::elsewhere_label( get_current_user_id() ) : '';
		}
		return new WP_REST_Response( $room );
	}

	/**
	 * Listeners on other sites a host adds to the room as the viewer sees it, through
	 * `riff_together_elsewhere`, each made safe to show: shown under their own heading, apart from
	 * the room's own, as none of them can be followed here.
	 *
	 * @param int $viewer Who asks.
	 * @return array[]
	 */
	private static function elsewhere( int $viewer ): array {
		/**
		 * Filters the listeners on other sites the Together panel and Listening now show the
		 * viewer, under their own heading (`riff_together_elsewhere_label`), apart from this site's
		 * own: a host network's friends, say. None of them is followed here; each links to where
		 * they are, by `along`, as riff_together_along_url() gives it.
		 *
		 * Each is `{ id, name, avatar, track: { title, artist, art, url }, site: { name, url },
		 * playing, at, along }`. Riff keeps the first 20 with a name, each string as text and each
		 * address an http or https one, and asks again with the room, every fifteen seconds while
		 * one is shown: a host caches what it looks up elsewhere. Empty by default, when nothing
		 * changes.
		 *
		 * @since 6.15.0
		 *
		 * @param array[] $listeners Each: `id` (int, their user ID where they are), `name`,
		 *                           `avatar` (an address), `track` (`title`, `artist`, `art` and
		 *                           `url`, the cover's and the track's addresses), `site` (`name`
		 *                           and `url`), `playing` (bool), `at` (int, when they last
		 *                           shared, as a Unix time) and `along` (an address that listens
		 *                           along with them, or null for none).
		 * @param int     $viewer_id Who asks.
		 */
		$given = apply_filters( 'riff_together_elsewhere', array(), $viewer );
		if ( ! is_array( $given ) ) {
			return array();
		}
		$text = static fn( $value ): string => is_scalar( $value ) ? sanitize_text_field( (string) $value ) : '';
		$link = static fn( $value ): string => is_string( $value ) ? esc_url_raw( $value, array( 'http', 'https' ) ) : '';
		$out  = array();
		foreach ( $given as $listener ) {
			if ( count( $out ) >= self::ELSEWHERE_MAX ) {
				break;
			}
			$name = is_array( $listener ) ? $text( $listener['name'] ?? '' ) : '';
			if ( '' === $name ) {
				continue;
			}
			$track   = is_array( $listener['track'] ?? null ) ? $listener['track'] : array();
			$site    = is_array( $listener['site'] ?? null ) ? $listener['site'] : array();
			$at      = is_numeric( $listener['at'] ?? null ) ? max( 0, (int) $listener['at'] ) : 0;
			$along   = $link( $listener['along'] ?? '' );
			$playing = ! empty( $listener['playing'] );
			$item    = array(
				'id'      => is_numeric( $listener['id'] ?? null ) ? max( 0, (int) $listener['id'] ) : 0,
				'name'    => $name,
				'avatar'  => $link( $listener['avatar'] ?? '' ),
				'track'   => array(
					'title'  => $text( $track['title'] ?? '' ),
					'artist' => $text( $track['artist'] ?? '' ),
					'art'    => $link( $track['art'] ?? '' ),
					'url'    => $link( $track['url'] ?? '' ),
				),
				'site'    => array(
					'name' => $text( $site['name'] ?? '' ),
					'url'  => $link( $site['url'] ?? '' ),
				),
				'playing' => $playing,
				'at'      => $at,
				'along'   => '' !== $along ? $along : null,
				'when'    => $playing ? __( 'now', 'riff' ) : ( $at ? sprintf(
					/* translators: %s: how long ago, such as "5 mins". */
					__( '%s ago', 'riff' ),
					human_time_diff( $at )
				) : '' ),
			);
			$item['card'] = self::elsewhere_card( $item );
			$out[]        = $item;
		}
		return $out;
	}

	/**
	 * The heading listeners elsewhere are shown under.
	 *
	 * @since 6.15.0
	 *
	 * @param int $viewer Who asks.
	 * @return string
	 */
	public static function elsewhere_label( int $viewer ): string {
		/**
		 * Filters the heading the listeners `riff_together_elsewhere` adds are shown under, in the
		 * Together panel and on Home.
		 *
		 * @since 6.15.0
		 *
		 * @param string $label     The heading. Default "Elsewhere".
		 * @param int    $viewer_id Who asks.
		 */
		$label = sanitize_text_field( (string) apply_filters( 'riff_together_elsewhere_label', __( 'Elsewhere', 'riff' ), $viewer ) );
		return '' !== $label ? $label : __( 'Elsewhere', 'riff' );
	}

	/**
	 * A listener elsewhere's card on Home, as a listener's here: their name over their track's
	 * cover, or their face, with what they play, where and when; the name links to listen along.
	 *
	 * @param array $item The listener, from elsewhere().
	 * @return string
	 */
	private static function elsewhere_card( array $item ): string {
		return Ui::card(
			array(
				'title' => $item['name'],
				'href'  => (string) $item['along'],
				'sub'   => implode( ' · ', array_filter( array( $item['track']['title'], $item['track']['artist'], $item['site']['name'], $item['when'] ) ) ),
				'art'   => '' !== $item['track']['art'] ? $item['track']['art'] : $item['avatar'],
				'mark'  => mb_substr( $item['name'], 0, 1 ),
			)
		);
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
		$queue   = array_map(
			static fn( $item ) => array(
				'id'   => (int) $item['id'],
				'post' => (int) ( $item['post'] ?? 0 ),
			),
			array_values( (array) $request['queue'] )
		);
		$me      = get_current_user_id();
		$entries = self::share(
			$me,
			$queue,
			(int) $request['index'],
			(float) $request['at'],
			(bool) $request['playing'],
			null === $request['running'] ? null : (bool) $request['running'],
			(int) $request['when']
		);
		if ( is_wp_error( $entries ) ) {
			return $entries;
		}
		// With the change as it is due, which the host's own player makes then too, and how many
		// follow them, so it knows to.
		$room              = self::room( $entries, self::version( $entries ) );
		$room['scheduled'] = array_intersect_key( (array) self::shared( $me ), array_flip( array( 'at', 'since', 'playing' ) ) );
		$room['followers'] = count( self::followers( $me ) );
		return new WP_REST_Response( $room );
	}

	/**
	 * Shares what a listener plays, as POST /together does for the player: their queue as
	 * `{ id, post }` items, which of them plays, where it is, and whether it plays from now. For a
	 * listener someone follows the change is due LEAD from now, and the position kept is where the
	 * music will be then: further on, if it plays until then.
	 *
	 * @since 5.8.0
	 *
	 * @param int       $user    The listener.
	 * @param array[]   $queue   The queue, each `{ id, post }`.
	 * @param int       $index   Which plays.
	 * @param float     $at      Where it is, in seconds, at `$when`.
	 * @param bool      $playing Whether it plays from the change on.
	 * @param bool|null $running Whether it plays until the change is due; as `$playing` when null.
	 * @param int       $when    When `$at` was read, on the server's clock in milliseconds; 0 for now.
	 * @return object[]|WP_Error The room's rows after, or why not.
	 */
	public static function share( int $user, array $queue, int $index, float $at, bool $playing, ?bool $running = null, int $when = 0 ) {
		if ( $index < 0 || $index >= count( $queue ) ) {
			return new WP_Error( 'rest_invalid_param', __( 'The index is past the end of the queue.', 'riff' ), array( 'status' => 400 ) );
		}
		// A listener who turned sharing off in another tab is taken out, not shared.
		if ( ! self::shares( $user ) ) {
			self::leave( $user, 'stopped-sharing' );
			return new WP_Error( 'riff_together_not_sharing', __( 'You aren’t sharing what you listen to.', 'riff' ), array( 'status' => 403 ) );
		}
		$now = self::now();
		// A time the player read the position at, as far from now as a slow request takes, or now.
		$when  = $when > 0 && abs( $now - $when ) <= 10000 ? $when : $now;
		$since = $now + ( self::followers( $user ) ? self::LEAD : 0 );
		$state = array(
			'queue'   => array_values( $queue ),
			'index'   => $index,
			'at'      => max( 0.0, $at + ( ( $running ?? $playing ) ? ( $since - $when ) / 1000 : 0 ) ),
			'since'   => $since,
			'playing' => $playing,
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
		/**
		 * Fires after a listener shares what they play, from the player or a Presence Scenes step,
		 * once it is in the room.
		 *
		 * It fires on every share, the player's keep-alive too, which shares again about once a
		 * minute while the music plays with nothing new, so a plugin keeping what a listener plays
		 * knows it is still so. A keep-alive's `at` and `since` are those of the share before it,
		 * where the music was heading from: where it is now is `at`, and the time since `since` when
		 * it plays. It doesn't fire when nothing was shared: a queue the index is past, a listener
		 * who doesn't share, or a Presence API that couldn't write.
		 *
		 * @since 6.15.0
		 *
		 * @param int   $user_id The listener.
		 * @param array $state   What they share: `queue`, each `{ id, post }` (a track's attachment
		 *                       ID and the post it plays from, 0 for none); `index`, which plays;
		 *                       `at`, where it is in seconds at `since`, in milliseconds on the
		 *                       server's clock; and `playing`, whether it plays from then.
		 */
		do_action( 'riff_together_shared', $user, $state );
		return $entries;
	}

	/**
	 * A link that listens along with someone, as riff_together_along_url() gives it.
	 *
	 * @since 6.15.0
	 *
	 * @param int      $user    The listener.
	 * @param int|null $blog_id The site they listen on, on a network; null for this one.
	 * @return string
	 */
	public static function along_url( int $user, ?int $blog_id = null ): string {
		$switched = null !== $blog_id && is_multisite() && get_current_blog_id() !== $blog_id && switch_to_blog( $blog_id );
		$page     = riff_listen_page();
		$url      = add_query_arg( self::ALONG, max( 0, $user ), $page ? get_permalink( $page ) : home_url( '/' ) );
		if ( $switched ) {
			restore_current_blog();
		}
		return $url;
	}

	/**
	 * Takes a listener out of the room, and says so when they were in it: the one way out, for the
	 * routes, the profile and Riff's own Presence Scenes steps.
	 *
	 * @since 6.15.0
	 *
	 * @param int    $user The listener.
	 * @param string $why  `stopped` when they stopped, or `stopped-sharing` when they no longer share.
	 * @return object[] The room's rows after.
	 */
	public static function leave( int $user, string $why ): array {
		$client = self::PREFIX . $user;
		$left   = false;
		$heard  = static function ( $room, $client_id ) use ( $client, &$left ) {
			$left = $left || ( self::ROOM === $room && $client === $client_id );
		};
		// The Presence API says when a row went, and not when there was none to take.
		add_action( 'removed_presence', $heard, 10, 2 );
		$entries = (array) wp_presence_leave( self::ROOM, $client, array( 'client_prefix' => self::PREFIX ) );
		remove_action( 'removed_presence', $heard, 10 );
		if ( $left ) {
			/**
			 * Fires after a listener leaves the room: they stopped, or turned sharing off. Once a
			 * leave, and only when they were in the room; not when a row runs out because the tab
			 * closed, nor when a follower leaves the listener they follow.
			 *
			 * @since 6.15.0
			 *
			 * @param int    $user_id The listener.
			 * @param string $why     `stopped`: they stopped, from the player or the Presence
			 *                        Scenes step riffStop. `stopped-sharing`: they turned sharing
			 *                        off on their profile, or a site's `riff_together_share` turned
			 *                        it off for them.
			 */
			do_action( 'riff_together_left', $user, $why );
		}
		return $entries;
	}

	/**
	 * What a listener last shared, or null when they aren't in the room: their queue, which plays,
	 * and the schedule, where the music is at `since` and whether it plays from then.
	 *
	 * @since 5.8.0 Public.
	 *
	 * @param int $user User ID.
	 * @return array|null `{ queue, index, at, since, playing }`.
	 */
	public static function shared( int $user ): ?array {
		foreach ( wp_get_presence( self::ROOM, array( 'client_prefix' => self::PREFIX . $user ) ) as $entry ) {
			$row = self::row( $entry );
			if ( $row && $user === $row['user']->ID ) {
				// Kept as JSON, where a position of a whole second comes back a whole number.
				return array( 'at' => (float) ( $row['state']['at'] ?? 0 ) ) + $row['state'];
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
		$entries = self::leave( get_current_user_id(), 'stopped' );
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
		$listener = self::playing( (int) $request['user'] );
		if ( ! $listener ) {
			return self::not_listening();
		}
		// The server's clock, so the player works out where they are now without trusting its own.
		$listener['now'] = self::now();
		return new WP_REST_Response( $listener );
	}

	/**
	 * POST /together/{user}/follow.
	 *
	 * @since 5.8.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_follow( WP_REST_Request $request ) {
		$received = self::received();
		$host     = (int) $request['user'];
		$me       = get_current_user_id();
		if ( $host === $me ) {
			return new WP_Error( 'rest_invalid_param', __( 'You can’t follow yourself.', 'riff' ), array( 'status' => 400 ) );
		}
		$listener = self::playing( $host );
		if ( ! $listener ) {
			// Nothing to follow: out of their session, so they aren't shown a follower who isn't one.
			wp_presence_leave( self::SESSION . $host, self::PREFIX . $me, array( 'client_prefix' => self::PREFIX ) );
			return self::not_listening();
		}
		$followed = wp_presence_exchange(
			self::SESSION . $host,
			self::PREFIX . $me,
			array( 'following' => $host ),
			array(
				'user_id'       => $me,
				'client_prefix' => self::PREFIX,
				'wp_error'      => true,
			)
		);
		if ( is_wp_error( $followed ) ) {
			return new WP_Error( 'riff_together_unavailable', __( 'Listening together is not available right now.', 'riff' ), array( 'status' => 503 ) );
		}
		// The queue only when it changed, as the player asks every second or two.
		$listener['version'] = substr( md5( (string) wp_json_encode( array_column( $listener['queue'], 'id' ) ) ), 0, 8 );
		if ( (string) $request['version'] === $listener['version'] ) {
			unset( $listener['queue'] );
		}
		// Who else is with them, for the Together panel: only those who share what they play, as no
		// one who chose not to is shown to anyone but the listener they follow.
		$listener['with']     = array_values(
			array_filter(
				self::followers( $host ),
				static fn( $person ) => $me !== $person['id'] && self::shares( $person['id'] )
			)
		);
		$listener['received'] = $received;
		$listener['now']      = self::now();
		return new WP_REST_Response( $listener );
	}

	/**
	 * DELETE /together/{user}/follow.
	 *
	 * @since 5.8.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_unfollow( WP_REST_Request $request ): WP_REST_Response {
		wp_presence_leave( self::SESSION . (int) $request['user'], self::PREFIX . get_current_user_id(), array( 'client_prefix' => self::PREFIX ) );
		return new WP_REST_Response( array( 'following' => false ) );
	}

	/**
	 * GET /together/following.
	 *
	 * @since 5.8.0
	 *
	 * @return WP_REST_Response
	 */
	public static function rest_following(): WP_REST_Response {
		return new WP_REST_Response( array( 'following' => self::followers( get_current_user_id() ) ) );
	}

	/**
	 * GET /together/clock.
	 *
	 * @since 5.8.0
	 *
	 * @return WP_REST_Response
	 */
	public static function rest_clock(): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'received' => self::received(),
				'now'      => self::now(),
			)
		);
	}

	/**
	 * Who is following a listener, by name: anyone with a row in their session who is still a user.
	 *
	 * @since 5.8.0
	 *
	 * @param int $host The listener.
	 * @return array[] Each `{ id, name, face }`.
	 */
	public static function followers( int $host ): array {
		$people = array();
		foreach ( wp_get_presence( self::SESSION . $host, array( 'client_prefix' => self::PREFIX ) ) as $entry ) {
			$user = get_userdata( (int) $entry->user_id );
			if ( $user instanceof WP_User && self::PREFIX . $user->ID === $entry->client_id && $user->ID !== $host ) {
				$people[ $user->ID ] = array(
					'id'   => $user->ID,
					'name' => $user->display_name,
					'face' => Browse::face( $user ),
				);
			}
		}
		$people = array_values( $people );
		usort( $people, static fn( $a, $b ) => array( strtolower( $a['name'] ), $a['id'] ) <=> array( strtolower( $b['name'] ), $b['id'] ) );
		return $people;
	}

	/**
	 * What one listener is playing, as the current user may hear it: their track and their whole
	 * queue, without the tracks the current user can't see, the index following its track. Null
	 * when they aren't playing anything the current user can hear.
	 *
	 * @param int $user The listener.
	 * @return array|null
	 */
	private static function playing( int $user ): ?array {
		foreach ( wp_get_presence( self::ROOM, array( 'client_prefix' => self::PREFIX . $user ) ) as $entry ) {
			$row = self::row( $entry );
			if ( ! $row || $user !== $row['user']->ID ) {
				continue;
			}
			$tracks = Tracks::readable( $row['queue'] );
			if ( empty( $tracks[ $row['index'] ] ) ) {
				return null;
			}
			$listener          = self::listener( $row, $tracks[ $row['index'] ] );
			$listener['index'] = count( array_filter( array_slice( $tracks, 0, $row['index'] ) ) );
			$listener['queue'] = array_values( array_filter( $tracks ) );
			return $listener;
		}
		return null;
	}

	/**
	 * The answer for a listener who isn't playing anything the current user can hear.
	 *
	 * @return WP_Error
	 */
	private static function not_listening(): WP_Error {
		return new WP_Error( 'riff_together_not_listening', __( 'They aren\'t listening to anything you can hear.', 'riff' ), array( 'status' => 404 ) );
	}

	/**
	 * The room as the current user sees it: everyone else, each with the track they are on, by name,
	 * so the order stays put while they listen.
	 *
	 * @param object[]    $entries The room's rows, from the Presence API.
	 * @param string|null $version The room's version.
	 * @param int         $album   An album's term ID, for only those playing a track from it; 0 for all.
	 * @return array `{ version, changed, listeners }`.
	 */
	private static function room( array $entries, ?string $version, int $album = 0 ): array {
		$rows = array();
		foreach ( $entries as $entry ) {
			$row = self::row( $entry );
			if ( $row && get_current_user_id() !== $row['user']->ID ) {
				$rows[] = $row;
			}
		}
		if ( $album > 0 && $rows ) {
			$on = static fn( $row ) => (int) ( $row['queue'][ $row['index'] ]['id'] ?? 0 );
			// Everyone's album, looked up at once.
			update_object_term_cache( array_map( $on, $rows ), 'attachment' );
			$rows = array_values( array_filter( $rows, static fn( $row ) => is_object_in_term( $on( $row ), Catalog::ALBUM, $album ) ) );
		}
		// Everyone's track, looked up at once.
		$tracks    = Tracks::readable( array_map( static fn( $row ) => $row['queue'][ $row['index'] ], $rows ) );
		$listeners = array();
		foreach ( $rows as $i => $row ) {
			if ( $tracks[ $i ] ) {
				$listener         = self::listener( $row, $tracks[ $i ] );
				$listener['card'] = self::card( $listener );
				$listeners[]      = $listener;
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
	 * write: one for each listener, `riff-{user ID}`, naming a track in their queue. A listener
	 * who no longer shares is not one, whatever their row still says.
	 *
	 * @param object $entry A row of the room.
	 * @return array|null `{ user, state, queue, index }`.
	 */
	private static function row( object $entry ): ?array {
		$user  = get_userdata( (int) $entry->user_id );
		$state = (array) $entry->data;
		$queue = array_values( array_filter( (array) ( $state['queue'] ?? array() ), 'is_array' ) );
		$index = (int) ( $state['index'] ?? 0 );
		if ( ! $user instanceof WP_User || self::PREFIX . $user->ID !== $entry->client_id || ! isset( $queue[ $index ] ) || ! self::shares( $user->ID ) ) {
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
	 * A listener's card under Listening now, as Home draws every card: their name over their
	 * track's cover, and pressing it follows them.
	 *
	 * @param array $listener The listener, from listener().
	 * @return string
	 */
	private static function card( array $listener ): string {
		$name = (string) $listener['user']['name'];
		return Ui::card(
			array(
				'title' => $name,
				'sub'   => implode( ' · ', array_filter( array( (string) ( $listener['track']['title'] ?? '' ), (string) ( $listener['track']['artist'] ?? '' ) ) ) ),
				'art'   => (array) ( $listener['track']['art'] ?? array() ),
				'play'  => array(
					'action' => 'listen-along',
					'data'   => array( 'user' => (int) $listener['user']['id'] ),
					/* translators: %s: the listener's name. */
					'label'  => sprintf( __( 'Follow %s', 'riff' ), $name ),
				),
			)
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

	/**
	 * When the server took the request, in milliseconds since the epoch: with now(), the time it
	 * spent answering, which the player takes out of the round trip.
	 *
	 * @return int
	 */
	private static function received(): int {
		$at = isset( $_SERVER['REQUEST_TIME_FLOAT'] ) ? (float) $_SERVER['REQUEST_TIME_FLOAT'] : microtime( true ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotValidated -- PHP's own, a number.
		return min( (int) round( $at * 1000 ), self::now() );
	}
}
