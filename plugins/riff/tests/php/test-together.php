<?php
/**
 * Listening together: the listening room over riff/v1/together.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Listen\Together;

/**
 * Riff\Listen\Together.
 */
class Test_Riff_Together extends Riff_TestCase {

	/**
	 * Two tracks on a published post.
	 *
	 * @var int[]
	 */
	private array $tracks = array();

	/**
	 * The published post.
	 *
	 * @var int
	 */
	private int $post = 0;

	/**
	 * A track on a draft, and the draft.
	 *
	 * @var int[]
	 */
	private array $secret = array();

	/**
	 * The host, who plays.
	 *
	 * @var int
	 */
	private int $host = 0;

	/**
	 * A guest, who sees them.
	 *
	 * @var int
	 */
	private int $guest = 0;

	public function set_up(): void {
		parent::set_up();
		if ( ! Together::available() ) {
			$this->markTestSkipped( 'The Presence API is not installed.' );
		}
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		$this->post   = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->tracks = array(
			self::attach( '02 - Underground [underground].mp3', $this->post ),
			self::attach( '03 - Trombone Detritus [detritus].mp3', $this->post ),
		);
		// The host writes a draft, so its track is theirs to play and no one else's.
		$this->host   = self::factory()->user->create( array( 'role' => 'author' ) );
		$draft        = self::factory()->post->create(
			array(
				'post_status' => 'draft',
				'post_author' => $this->host,
			)
		);
		$this->secret = array(
			'id'   => self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $draft ),
			'post' => $draft,
		);
		$this->guest  = self::factory()->user->create(
			array(
				'role'         => 'subscriber',
				'display_name' => 'Guest',
			)
		);
	}

	public function tear_down(): void {
		$GLOBALS['wp_rest_auth_cookie'] = false;
		parent::tear_down();
	}

	/**
	 * A request's response.
	 *
	 * @param string $method Method.
	 * @param string $route  Route under /riff/v1.
	 * @param array  $body   JSON body, or the query for a GET.
	 * @return WP_REST_Response
	 */
	private function call( string $method, string $route, array $body = array() ): WP_REST_Response {
		$request = new WP_REST_Request( $method, '/riff/v1' . $route );
		if ( 'GET' === $method ) {
			$request->set_query_params( $body );
		} elseif ( $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}
		return rest_do_request( $request );
	}

	/**
	 * Shares a queue as the given user.
	 *
	 * @param int     $user  Who.
	 * @param array[] $queue Each `{ id, post }`.
	 * @param int     $index   Which is playing.
	 * @param float   $at      Where it is.
	 * @param bool    $playing Whether it plays.
	 * @return WP_REST_Response
	 */
	private function share( int $user, array $queue, int $index = 0, float $at = 12.5, bool $playing = true ): WP_REST_Response {
		wp_set_current_user( $user );
		return $this->call(
			'POST',
			'/together',
			array(
				'queue'   => $queue,
				'index'   => $index,
				'at'      => $at,
				'playing' => $playing,
			)
		);
	}

	/**
	 * Shares the post's first track with a schedule's own parts, as a host's player does.
	 *
	 * @param int   $user    Who.
	 * @param float $at      Where it is, at `$when`.
	 * @param bool  $playing Whether it plays from the change on.
	 * @param bool  $running Whether it plays until the change is due.
	 * @param int   $when    When `$at` was read, on the server's clock; 0 to leave it out.
	 * @return WP_REST_Response
	 */
	private function share_as( int $user, float $at, bool $playing, bool $running, int $when = 0 ): WP_REST_Response {
		wp_set_current_user( $user );
		return $this->call(
			'POST',
			'/together',
			array(
				'queue'   => $this->queue(),
				'index'   => 0,
				'at'      => $at,
				'playing' => $playing,
				'running' => $running,
			) + ( $when ? array( 'when' => $when ) : array() )
		);
	}

	/**
	 * The published post's tracks, as a queue.
	 *
	 * @return array[]
	 */
	private function queue(): array {
		return array_map(
			fn( $id ) => array(
				'id'   => $id,
				'post' => $this->post,
			),
			$this->tracks
		);
	}

	public function test_a_visitor_is_told_to_sign_in(): void {
		$this->assertSame( 401, $this->share( 0, $this->queue() )->get_status(), 'POST /together' );
		foreach ( array( array( 'GET', '/together' ), array( 'DELETE', '/together' ), array( 'GET', '/together/' . $this->host ) ) as list( $method, $route ) ) {
			$this->assertSame( 401, $this->call( $method, $route )->get_status(), "$method $route" );
		}
	}

	public function test_a_listener_is_seen_by_others_on_their_track_and_not_by_themself(): void {
		$own = $this->share( $this->host, $this->queue(), 1 );
		$this->assertSame( 200, $own->get_status() );
		$this->assertSame( array(), $own->get_data()['listeners'], 'the host is not listed to themself' );

		wp_set_current_user( $this->guest );
		$room = $this->call( 'GET', '/together' )->get_data();
		$this->assertCount( 1, $room['listeners'] );
		$listener = $room['listeners'][0];
		$this->assertSame( $this->host, $listener['user']['id'] );
		$this->assertSame( (string) $this->tracks[1], (string) $listener['track']['id'] );
		$this->assertSame( 12.5, $listener['at'] );
		$this->assertTrue( $listener['playing'] );
		$this->assertEqualsWithDelta( microtime( true ) * 1000, $listener['since'], 5000, 'stamped with the server\'s time' );
		$this->assertArrayNotHasKey( 'queue', $listener, 'the room lists tracks, not queues' );
		$this->assertArrayNotHasKey( 'levels', $listener['track'] );
	}

	public function test_listeners_are_listed_by_name_with_their_tracks_looked_up_at_once(): void {
		wp_update_user(
			array(
				'ID'           => $this->host,
				'display_name' => 'Zoë',
			)
		);
		$amy = self::factory()->user->create(
			array(
				'role'         => 'subscriber',
				'display_name' => 'Amy',
			)
		);
		$this->share( $this->host, $this->queue(), 1 );
		$this->share( $amy, $this->queue() );

		$lookups = 0;
		$count   = static function ( $result, $server, $request ) use ( &$lookups ) {
			$lookups += '/riff/v1/tracks' === $request->get_route() ? 1 : 0;
			return $result;
		};
		add_filter( 'rest_pre_dispatch', $count, 10, 3 );
		wp_set_current_user( $this->guest );
		$listeners = $this->call( 'GET', '/together' )->get_data()['listeners'];
		remove_filter( 'rest_pre_dispatch', $count );

		$this->assertSame( array( 'Amy', 'Zoë' ), array_map( fn( $l ) => $l['user']['name'], $listeners ) );
		$this->assertSame( array( (string) $this->tracks[0], (string) $this->tracks[1] ), array_map( fn( $l ) => (string) $l['track']['id'], $listeners ) );
		$this->assertSame( 1, $lookups, 'one lookup for everyone\'s track' );
	}

	public function test_a_track_the_reader_cannot_see_is_never_shown(): void {
		$this->share( $this->host, array( $this->secret ) );
		wp_set_current_user( $this->guest );
		$this->assertSame( array(), $this->call( 'GET', '/together' )->get_data()['listeners'], 'a listener on a draft\'s track is left out' );
		$this->assertSame( 404, $this->call( 'GET', '/together/' . $this->host )->get_status() );
	}

	public function test_listening_along_takes_the_queue_the_reader_can_see_with_the_index_on_its_track(): void {
		$queue = $this->queue();
		array_splice( $queue, 1, 0, array( $this->secret ) );
		$this->share( $this->host, $queue, 2 );

		wp_set_current_user( $this->guest );
		$listener = $this->call( 'GET', '/together/' . $this->host )->get_data();
		$this->assertSame( array_map( 'strval', $this->tracks ), array_map( fn( $t ) => (string) $t['id'], $listener['queue'] ), 'the draft\'s track is left out' );
		$this->assertSame( 1, $listener['index'], 'the index follows its track' );
		$this->assertSame( (string) $this->tracks[1], (string) $listener['track']['id'] );
		$this->assertGreaterThanOrEqual( $listener['since'], $listener['now'], 'with the server\'s clock, to work out where they are now' );
	}

	public function test_the_player_is_told_where_to_share_only_when_signed_in(): void {
		wp_set_current_user( $this->guest );
		$data = Together::player_data( array( 'me' => array( 'rest' => array() ) ) );
		$this->assertSame( rest_url( 'riff/v1/together' ), $data['me']['rest']['together'] );
		$this->assertSame( array(), Together::player_data( array() ), 'a visitor\'s player has no account to share from' );
	}

	public function test_a_listener_who_turns_sharing_off_leaves_the_room_and_sends_nothing(): void {
		$this->share( $this->host, $this->queue() );
		$this->assertTrue( Together::shares( $this->host ), 'on until they choose' );

		wp_set_current_user( $this->host );
		$_POST['riff_together_share_nonce'] = wp_create_nonce( 'riff_together_share_' . $this->host );
		Together::save( $this->host );
		unset( $_POST['riff_together_share_nonce'] );
		$this->assertFalse( Together::shares( $this->host ) );
		$this->assertSame( array(), wp_get_presence( Together::ROOM, array( 'client_prefix' => 'riff-' . $this->host ) ), 'out of the room at once' );

		$this->assertSame( 403, $this->share( $this->host, $this->queue() )->get_status(), 'a share from a tab opened before is refused' );
		$this->assertFalse( Together::player_data( array( 'me' => array( 'rest' => array() ) ) )['me']['sharing'], 'and the player is told' );
	}

	public function test_a_row_left_by_someone_who_no_longer_shares_is_not_shown(): void {
		$this->share( $this->host, $this->queue() );
		update_user_option( $this->host, Together::SHARE, 'off' );
		wp_set_current_user( $this->guest );
		$this->assertSame( array(), $this->call( 'GET', '/together' )->get_data()['listeners'] );
		$this->assertSame( 404, $this->call( 'GET', '/together/' . $this->host )->get_status() );
	}

	public function test_a_site_can_make_sharing_something_a_listener_turns_on(): void {
		add_filter( 'riff_together_share', '__return_false' );
		$this->assertFalse( Together::shares( $this->host ), 'off by the site\'s default' );
		update_user_option( $this->host, Together::SHARE, 'on' );
		$this->assertTrue( Together::shares( $this->host ), 'on by their own choice' );
		remove_filter( 'riff_together_share', '__return_false' );
		$this->assertFalse( Together::shares( 0 ), 'a visitor never shares' );
	}

	public function test_the_version_says_when_nothing_has_changed(): void {
		$this->share( $this->host, $this->queue() );
		wp_set_current_user( $this->guest );
		$version = $this->call( 'GET', '/together' )->get_data()['version'];
		$this->assertNotNull( $version );
		$this->assertSame(
			array(
				'version' => $version,
				'changed' => false,
			),
			$this->call( 'GET', '/together', array( 'version' => $version ) )->get_data()
		);

		$this->share( $this->host, $this->queue(), 1 );
		wp_set_current_user( $this->guest );
		$room = $this->call( 'GET', '/together', array( 'version' => $version ) )->get_data();
		$this->assertTrue( $room['changed'], 'a skip moves the version' );
		$this->assertSame( (string) $this->tracks[1], (string) $room['listeners'][0]['track']['id'] );
	}

	public function test_sharing_again_with_nothing_new_keeps_the_version_and_a_seek_or_pause_moves_it(): void {
		$this->share( $this->host, $this->queue() );
		wp_set_current_user( $this->guest );
		$room = $this->call( 'GET', '/together' )->get_data();

		$this->share( $this->host, $this->queue(), 0, 12.9 );
		wp_set_current_user( $this->guest );
		$again = $this->call( 'GET', '/together', array( 'version' => $room['version'] ) )->get_data();
		$this->assertFalse( $again['changed'], 'within a beat of where it was heading is not a seek' );

		$this->share( $this->host, $this->queue(), 0, 60 );
		wp_set_current_user( $this->guest );
		$seek = $this->call( 'GET', '/together', array( 'version' => $room['version'] ) )->get_data();
		$this->assertTrue( $seek['changed'], 'a seek moves the version' );
		$this->assertSame( 60.0, $seek['listeners'][0]['at'] );
		$this->assertGreaterThanOrEqual( $room['listeners'][0]['since'], $seek['listeners'][0]['since'] );

		$this->share( $this->host, $this->queue(), 0, 60, false );
		wp_set_current_user( $this->guest );
		$pause = $this->call( 'GET', '/together', array( 'version' => $seek['version'] ) )->get_data();
		$this->assertTrue( $pause['changed'], 'a pause moves the version' );
		$this->assertFalse( $pause['listeners'][0]['playing'] );
	}

	public function test_a_listener_who_drops_out_without_leaving_changes_the_version(): void {
		global $wpdb;
		$this->share( $this->host, $this->queue() );
		$this->share( $this->guest, $this->queue() );
		$version = $this->call( 'GET', '/together' )->get_data()['version'];

		// The host closed the tab: their row runs out, which doesn't move the Presence API's version.
		$wpdb->update( $wpdb->presence, array( 'expires_gmt' => gmdate( 'Y-m-d H:i:s', time() - 1 ) ), array( 'client_id' => 'riff-' . $this->host ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a test, ageing a row.
		// Its reads are cached for the second, which a real row's running out moves past.
		wp_cache_set_last_changed( 'presence' );
		$room = $this->call( 'GET', '/together', array( 'version' => $version ) )->get_data();
		$this->assertTrue( $room['changed'] );
		$this->assertSame( array(), $room['listeners'] );
	}

	public function test_leaving_takes_the_listener_out_of_the_room(): void {
		$this->share( $this->host, $this->queue() );
		$this->assertSame( 200, $this->call( 'DELETE', '/together' )->get_status() );
		wp_set_current_user( $this->guest );
		$this->assertSame( array(), $this->call( 'GET', '/together' )->get_data()['listeners'] );
	}

	public function test_following_answers_with_where_their_music_is_and_their_queue_only_when_it_changed(): void {
		$this->share( $this->host, $this->queue(), 1, 30.0 );
		wp_set_current_user( $this->guest );
		$first = $this->call( 'POST', '/together/' . $this->host . '/follow' );
		$this->assertSame( 200, $first->get_status() );
		$plan = $first->get_data();
		$this->assertSame( (string) $this->tracks[1], (string) $plan['track']['id'] );
		$this->assertSame( 1, $plan['index'] );
		$this->assertSame( 30.0, $plan['at'] );
		$this->assertCount( 2, $plan['queue'] );
		$this->assertLessThanOrEqual( $plan['now'], $plan['received'], 'taken before it was answered, for the player\'s clock' );
		$this->assertMatchesRegularExpression( '/^[0-9a-f]{8}$/', $plan['version'] );

		$again = $this->call( 'POST', '/together/' . $this->host . '/follow', array( 'version' => $plan['version'] ) )->get_data();
		$this->assertArrayNotHasKey( 'queue', $again, 'asked every second or two, the queue comes only when it changed' );
		$this->assertSame( $plan['version'], $again['version'] );
	}

	public function test_the_host_sees_who_follows_them_until_they_stop(): void {
		$this->share( $this->host, $this->queue() );
		wp_set_current_user( $this->guest );
		$this->call( 'POST', '/together/' . $this->host . '/follow' );

		wp_set_current_user( $this->host );
		$following = $this->call( 'GET', '/together/following' )->get_data()['following'];
		$this->assertSame( array( 'Guest' ), array_column( $following, 'name' ) );

		wp_set_current_user( $this->guest );
		$this->assertSame( 200, $this->call( 'DELETE', '/together/' . $this->host . '/follow' )->get_status() );
		$this->assertSame( array(), Together::followers( $this->host ) );
	}

	public function test_following_someone_who_stopped_sharing_is_refused_and_leaves_their_session(): void {
		$this->share( $this->host, $this->queue() );
		wp_set_current_user( $this->guest );
		$this->call( 'POST', '/together/' . $this->host . '/follow' );
		update_user_option( $this->host, Together::SHARE, 'off' );

		$this->assertSame( 404, $this->call( 'POST', '/together/' . $this->host . '/follow' )->get_status() );
		$this->assertSame( array(), Together::followers( $this->host ), 'not shown as a follower of someone they no longer hear' );
	}

	public function test_a_track_the_follower_cannot_see_is_never_followed(): void {
		$this->share( $this->host, array( $this->secret ) );
		wp_set_current_user( $this->guest );
		$this->assertSame( 404, $this->call( 'POST', '/together/' . $this->host . '/follow' )->get_status() );
	}

	public function test_no_one_follows_themself_and_a_visitor_follows_no_one(): void {
		$this->share( $this->host, $this->queue() );
		$this->assertSame( 400, $this->call( 'POST', '/together/' . $this->host . '/follow' )->get_status() );
		wp_set_current_user( 0 );
		foreach ( array( array( 'POST', '/together/' . $this->host . '/follow' ), array( 'DELETE', '/together/' . $this->host . '/follow' ), array( 'GET', '/together/following' ), array( 'GET', '/together/clock' ) ) as list( $method, $route ) ) {
			$this->assertSame( 401, $this->call( $method, $route )->get_status(), "$method $route" );
		}
	}

	public function test_a_change_by_a_listener_someone_follows_is_due_a_moment_ahead_where_the_music_will_be_then(): void {
		$this->share( $this->host, $this->queue() );
		wp_set_current_user( $this->guest );
		$this->call( 'POST', '/together/' . $this->host . '/follow' );

		// A seek while it plays: the music runs on from 40 until the change is due, LEAD on.
		$now  = microtime( true ) * 1000;
		$room = $this->share_as( $this->host, 40.0, true, true, (int) $now )->get_data();
		$this->assertSame( 1, $room['followers'], 'the host is told someone follows, so it holds its own presses' );
		$this->assertEqualsWithDelta( $now + Together::LEAD, $room['scheduled']['since'], 250, 'due a moment ahead' );
		$this->assertEqualsWithDelta( 40.0 + Together::LEAD / 1000, $room['scheduled']['at'], 0.25, 'where the music will be by then' );

		// A start held where it is until it is due.
		$held = $this->share_as( $this->host, 10.0, true, false )->get_data()['scheduled'];
		$this->assertSame( 10.0, $held['at'] );
		$this->assertTrue( $held['playing'] );

		// A stop that lets the music play on until it is due.
		$stop = $this->share_as( $this->host, 20.0, false, true )->get_data()['scheduled'];
		$this->assertEqualsWithDelta( 20.0 + Together::LEAD / 1000, $stop['at'], 0.25 );
		$this->assertFalse( $stop['playing'] );

		// The follower is answered with the change before it is due.
		wp_set_current_user( $this->guest );
		$plan = $this->call( 'POST', '/together/' . $this->host . '/follow' )->get_data();
		$this->assertGreaterThan( $plan['now'], $plan['since'], 'it reaches them before it is due' );
		$this->assertFalse( $plan['playing'] );
	}

	public function test_a_listener_no_one_follows_shares_a_change_due_at_once(): void {
		$room = $this->share_as( $this->host, 40.0, true, true )->get_data();
		$this->assertSame( 0, $room['followers'] );
		$this->assertEqualsWithDelta( microtime( true ) * 1000, $room['scheduled']['since'], 250 );
		$this->assertEqualsWithDelta( 40.0, $room['scheduled']['at'], 0.05 );
	}

	public function test_a_time_far_from_the_servers_clock_is_not_taken(): void {
		$room = $this->share_as( $this->host, 5.0, true, true, (int) ( microtime( true ) * 1000 ) - 60000 )->get_data();
		$this->assertEqualsWithDelta( 5.0, $room['scheduled']['at'], 0.05, 'a minute out is a wrong clock, not a slow request' );
	}

	public function test_the_clock_says_when_the_request_was_taken_and_answered(): void {
		wp_set_current_user( $this->guest );
		$clock = $this->call( 'GET', '/together/clock' )->get_data();
		$this->assertLessThanOrEqual( $clock['now'], $clock['received'] );
		$this->assertEqualsWithDelta( microtime( true ) * 1000, $clock['now'], 5000 );
	}

	public function test_an_index_past_the_queue_is_refused(): void {
		$this->assertSame( 400, $this->share( $this->host, $this->queue(), 2 )->get_status() );
	}

	public function test_a_row_another_plugin_writes_in_the_room_is_not_a_listener(): void {
		wp_set_presence( Together::ROOM, 'riff-' . $this->guest, array( 'queue' => $this->queue() ), array( 'user_id' => $this->host ) );
		wp_set_presence( Together::ROOM, 'other-' . $this->host, array( 'queue' => $this->queue() ), array( 'user_id' => $this->host ) );
		wp_set_current_user( $this->guest );
		$this->assertSame( array(), $this->call( 'GET', '/together' )->get_data()['listeners'] );
	}
}
