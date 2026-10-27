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
	 * @param int     $index Which is playing.
	 * @return WP_REST_Response
	 */
	private function share( int $user, array $queue, int $index = 0 ): WP_REST_Response {
		wp_set_current_user( $user );
		return $this->call(
			'POST',
			'/together',
			array(
				'queue'   => $queue,
				'index'   => $index,
				'at'      => 12.5,
				'playing' => true,
			)
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

	public function test_leaving_takes_the_listener_out_of_the_room(): void {
		$this->share( $this->host, $this->queue() );
		$this->assertSame( 200, $this->call( 'DELETE', '/together' )->get_status() );
		wp_set_current_user( $this->guest );
		$this->assertSame( array(), $this->call( 'GET', '/together' )->get_data()['listeners'] );
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
