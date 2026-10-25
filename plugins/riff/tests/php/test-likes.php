<?php
/**
 * Likes and recently played for a signed-in user, over REST, and the sign-in merge.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Likes;
use Riff\Likes_Rest;

/**
 * Riff\Likes.
 */
class Test_Riff_Likes extends Riff_TestCase {

	/**
	 * Two tracks on a published post.
	 *
	 * @var int[]
	 */
	private array $tracks = array();

	/**
	 * A track on a draft.
	 *
	 * @var int
	 */
	private int $secret = 0;

	/**
	 * A subscriber.
	 *
	 * @var int
	 */
	private int $user = 0;

	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		$post         = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->tracks = array(
			self::attach( '02 - Underground [underground].mp3', $post ),
			self::attach( '03 - Trombone Detritus [detritus].mp3', $post ),
		);
		$draft        = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		$this->secret = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $draft );
		$this->user   = self::factory()->user->create( array( 'role' => 'subscriber' ) );
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
	 * @param array  $body   JSON body.
	 * @return WP_REST_Response
	 */
	private function call( string $method, string $route, array $body = array() ): WP_REST_Response {
		$request = new WP_REST_Request( $method, '/riff/v1' . $route );
		if ( $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}
		return rest_do_request( $request );
	}

	/**
	 * The album's term ID.
	 *
	 * @return int
	 */
	private function album(): int {
		return (int) get_term_by( 'name', 'Compositions', Catalog::ALBUM )->term_id;
	}

	public function test_a_visitor_is_told_to_sign_in_on_every_route(): void {
		wp_set_current_user( 0 );
		foreach ( array(
			array( 'GET', '/users/me/likes' ),
			array( 'POST', '/users/me/likes' ),
			array( 'DELETE', '/users/me/likes/track/' . $this->tracks[0] ),
			array( 'GET', '/users/me/history' ),
			array( 'POST', '/users/me/history' ),
			array( 'DELETE', '/users/me/history' ),
		) as list( $method, $route ) ) {
			$this->assertSame( 401, $this->call( $method, $route, array( 'items' => array() ) )->get_status(), "$method $route" );
		}
	}

	public function test_a_user_who_cannot_read_this_site_is_refused(): void {
		$nobody = self::factory()->user->create( array( 'role' => '' ) );
		wp_set_current_user( $nobody );
		$this->assertFalse( current_user_can( 'read' ), 'no role on this site' );

		$this->assertSame( 403, $this->call( 'GET', '/users/me/likes' )->get_status() );
		$this->assertSame(
			403,
			$this->call(
				'POST',
				'/users/me/likes',
				array(
					'items' => array(
						array(
							'kind' => 'track',
							'id'   => $this->tracks[0],
						),
					),
				)
			)->get_status()
		);
		$this->assertSame( '', (string) get_user_option( Likes::OPTION, $nobody ), 'nothing was saved' );
	}

	public function test_a_user_id_in_place_of_me_needs_permission_to_edit_that_user(): void {
		Likes::add( $this->user, array( array( 'kind' => 'track', 'id' => $this->tracks[0] ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$other = self::factory()->user->create( array( 'role' => 'subscriber' ) );

		wp_set_current_user( $this->user );
		$own = $this->call( 'GET', '/users/' . $this->user . '/likes' );
		$this->assertSame( 200, $own->get_status(), 'their own ID is the same as me' );
		$this->assertSame( array( $this->tracks[0] ), wp_list_pluck( $own->get_data()['items'], 'id' ) );

		wp_set_current_user( $other );
		$this->assertSame( 403, $this->call( 'GET', '/users/' . $this->user . '/likes' )->get_status(), 'another subscriber cannot' );
		$this->assertSame( 403, $this->call( 'DELETE', '/users/' . $this->user . '/likes/track/' . $this->tracks[0] )->get_status() );
		$this->assertCount( 1, Likes::get( $this->user ), 'and changed nothing' );

		$admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		if ( is_multisite() ) {
			grant_super_admin( $admin ); // On a network only a super admin edits other users.
		}
		wp_set_current_user( $admin );
		$this->assertSame( array( $this->tracks[0] ), wp_list_pluck( $this->call( 'GET', '/users/' . $this->user . '/likes' )->get_data()['items'], 'id' ), 'someone who can edit them can' );
		$this->assertSame( 404, $this->call( 'GET', '/users/999999/history' )->get_status() );
		$this->assertSame( 404, $this->call( 'GET', '/users/someone/likes' )->get_status(), 'only me or a number' );
	}

	public function test_a_signed_in_request_without_the_rest_nonce_counts_as_a_visitor(): void {
		wp_set_current_user( $this->user );
		// What WordPress does to a REST request that came with the login cookie and no nonce.
		$GLOBALS['wp_rest_auth_cookie'] = true;
		unset( $_REQUEST['_wpnonce'], $_SERVER['HTTP_X_WP_NONCE'] );
		rest_cookie_check_errors( null );

		$this->assertSame( 0, get_current_user_id() );
		$this->assertSame(
			401,
			$this->call(
				'POST',
				'/users/me/likes',
				array(
					'items' => array(
						array(
							'kind' => 'track',
							'id'   => $this->tracks[0],
						),
					),
				)
			)->get_status()
		);
	}

	public function test_likes_are_added_newest_first_and_taken_away(): void {
		wp_set_current_user( $this->user );
		$this->call(
			'POST',
			'/users/me/likes',
			array(
				'items' => array(
					array(
						'kind' => 'track',
						'id'   => $this->tracks[0],
					),
				),
			)
		);
		$this->call(
			'POST',
			'/users/me/likes',
			array(
				'items' => array(
					array(
						'kind' => 'album',
						'id'   => $this->album(),
					),
				),
			)
		);
		$items = $this->call( 'GET', '/users/me/likes' )->get_data()['items'];

		$this->assertSame( array( 'album', 'track' ), wp_list_pluck( $items, 'kind' ), 'newest first' );
		$this->assertSame( array( $this->album(), $this->tracks[0] ), wp_list_pluck( $items, 'id' ) );
		$this->assertGreaterThan( 1600000000000, $items[0]['at'], 'in milliseconds, as the browser counts' );

		$after = $this->call( 'DELETE', '/users/me/likes/album/' . $this->album() )->get_data()['items'];
		$this->assertSame( array( $this->tracks[0] ), wp_list_pluck( $after, 'id' ) );
	}

	public function test_a_like_made_in_the_same_millisecond_as_another_still_leads(): void {
		Likes::add(
			$this->user,
			array(
				array(
					'kind' => 'track',
					'id'   => $this->tracks[0],
					'at'   => 5000,
				),
			)
		);
		$likes = Likes::add(
			$this->user,
			array(
				array(
					'kind' => 'album',
					'id'   => $this->album(),
					'at'   => 5000,
				),
			)
		);

		$this->assertSame( array( 'album', 'track' ), wp_list_pluck( $likes, 'kind' ) );
	}

	public function test_a_like_that_names_nothing_here_is_left_out(): void {
		wp_set_current_user( $this->user );
		$image = self::factory()->attachment->create_upload_object( self::fixture( 'cover.png' ) );
		$items = $this->call(
			'POST',
			'/users/me/likes',
			array(
				'items' => array(
					array(
						'kind' => 'track',
						'id'   => $image,
					),
					array(
						'kind' => 'artist',
						'id'   => 999999,
					),
					array(
						'kind' => 'album',
						'id'   => $this->album(),
					),
				),
			)
		)->get_data()['items'];

		$this->assertSame( array( 'album' ), wp_list_pluck( $items, 'kind' ), 'an image is not a track, and a missing artist is nothing' );
		$this->assertSame(
			400,
			$this->call(
				'POST',
				'/users/me/likes',
				array(
					'items' => array(
						array(
							'kind' => 'playlist',
							'id'   => 1,
						),
					),
				)
			)->get_status(),
			'an unknown kind'
		);
	}

	public function test_the_likes_from_a_device_join_the_account_and_what_it_had_keeps_its_place(): void {
		wp_set_current_user( $this->user );
		update_user_option(
			$this->user,
			Likes::OPTION,
			array(
				array(
					'kind' => 'track',
					'id'   => $this->tracks[0],
					'at'   => 3000,
				),
			)
		);
		// What a visitor liked before they signed in: one the account has too, liked later on the device.
		$items = $this->call(
			'POST',
			'/users/me/likes',
			array(
				'items' => array(
					array(
						'kind' => 'track',
						'id'   => $this->tracks[1],
						'at'   => 2000,
					),
					array(
						'kind' => 'track',
						'id'   => $this->tracks[0],
						'at'   => 5000,
					),
					array(
						'kind' => 'album',
						'id'   => $this->album(),
						'at'   => 4000,
					),
				),
			)
		)->get_data()['items'];

		$this->assertSame(
			array( 'album:' . $this->album(), 'track:' . $this->tracks[0], 'track:' . $this->tracks[1] ),
			array_map( static fn( $l ) => $l['kind'] . ':' . $l['id'], $items ),
			'the device\'s likes keep their times, and the newest leads'
		);
		$this->assertSame( 3000, $items[1]['at'], 'the account\'s like keeps its own time' );
		$this->assertCount( 3, Likes::get( $this->user ), 'and each once' );
	}

	public function test_likes_are_a_user_option_so_each_site_keeps_its_own(): void {
		global $wpdb;
		wp_set_current_user( $this->user );
		$this->call(
			'POST',
			'/users/me/likes',
			array(
				'items' => array(
					array(
						'kind' => 'track',
						'id'   => $this->tracks[0],
					),
				),
			)
		);

		$stored = get_user_meta( $this->user, $wpdb->get_blog_prefix() . 'riff_likes', true );
		$this->assertSame( $this->tracks[0], $stored[0]['id'], 'under the site\'s table prefix' );
		$this->assertSame( '', get_user_meta( $this->user, 'riff_likes', true ), 'not shared by every site' );
	}

	public function test_history_keeps_the_latest_play_of_each_track_and_hides_what_went_private(): void {
		wp_set_current_user( $this->user );
		$this->call(
			'POST',
			'/users/me/history',
			array(
				'items' => array(
					array(
						'id'     => $this->tracks[0],
						'played' => 1000,
					),
					array(
						'id'     => $this->tracks[1],
						'played' => 2000,
					),
					array(
						'id'     => $this->secret,
						'played' => 3000,
					),
				),
			)
		);
		$items = $this->call( 'POST', '/users/me/history', array( 'items' => array( array( 'id' => $this->tracks[0] ) ) ) )->get_data()['items'];

		$this->assertSame( array( (string) $this->tracks[0], (string) $this->tracks[1] ), wp_list_pluck( $items, 'id' ), 'played again, it leads; the draft\'s track is not shown to a subscriber' );
		$this->assertSame( 'Underground', $items[0]['title'], 'in the track shape' );
		$this->assertGreaterThan( 2000, $items[0]['played'] );
		$this->assertArrayNotHasKey( 'levels', $items[0] );
		$this->assertCount( 3, Likes::history( $this->user ), 'the private one is kept, in case its post comes back' );

		$this->assertSame( array(), $this->call( 'DELETE', '/users/me/history' )->get_data()['items'] );
		$this->assertSame( array(), Likes::history( $this->user ) );
	}

	public function test_history_remembers_the_post_a_track_was_played_from(): void {
		wp_set_current_user( $this->user );
		$elsewhere = self::factory()->post->create(
			array(
				'post_status' => 'publish',
				'post_title'  => 'A mixtape',
			)
		);
		$items     = $this->call( 'POST', '/users/me/history', array( 'items' => array( array( 'id' => $this->tracks[0], 'post' => $elsewhere ) ) ) )->get_data()['items']; // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound

		$this->assertSame( 'A mixtape', $items[0]['post']['title'], 'where it played from, for Jump back in, not the post it was uploaded to' );
	}

	public function test_history_keeps_thirty(): void {
		$plays = array();
		for ( $i = 1; $i <= 40; $i++ ) {
			$plays[] = array(
				'id'     => self::factory()->attachment->create_object(
					array(
						'file'           => "song-$i.mp3",
						'post_mime_type' => 'audio/mpeg',
					)
				),
				'played' => $i * 1000,
			);
		}
		Likes::played( $this->user, $plays );

		$kept = Likes::history( $this->user );
		$this->assertCount( Likes::HISTORY_MAX, $kept );
		$this->assertSame( 40000, $kept[0]['played'], 'the newest' );
	}

	public function test_the_player_gets_a_signed_in_users_likes_and_history_and_a_visitor_nothing(): void {
		wp_set_current_user( 0 );
		$this->assertArrayNotHasKey( 'me', Likes_Rest::player_data( array() ) );

		wp_set_current_user( $this->user );
		Likes::add(
			$this->user,
			array(
				array(
					'kind' => 'track',
					'id'   => $this->tracks[1],
				),
			)
		);
		Likes::played( $this->user, array( array( 'id' => $this->tracks[0] ) ) );
		$me = Likes_Rest::player_data( array() )['me'];

		$this->assertSame( array( $this->tracks[1] ), wp_list_pluck( $me['likes'], 'id' ) );
		$this->assertSame( array( (string) $this->tracks[0] ), wp_list_pluck( $me['history'], 'id' ) );
		$this->assertSame( 1, wp_verify_nonce( $me['nonce'], 'wp_rest' ) );
		$this->assertStringContainsString( 'riff/v1/users/me/likes', $me['rest']['likes'] );
	}

	public function test_the_tracks_route_lists_tracks_by_id_in_the_order_given(): void {
		$request = new WP_REST_Request( 'GET', '/riff/v1/tracks' );
		$request->set_query_params(
			array(
				'include' => array( $this->tracks[0], $this->secret, $this->tracks[1] ),
				'orderby' => 'include',
			)
		);
		$data = rest_do_request( $request )->get_data();

		$this->assertSame( array( 'Underground', 'Trombone Detritus' ), wp_list_pluck( $data['items'], 'title' ), 'as given, not by title; and a visitor still does not see the draft\'s' );
	}

	public function test_a_users_likes_go_in_their_personal_data_export_and_erasure(): void {
		Likes::add(
			$this->user,
			array(
				array(
					'kind' => 'track',
					'id'   => $this->tracks[0],
				),
			)
		);
		$email = get_userdata( $this->user )->user_email;

		$export = Likes::export( $email );
		$this->assertSame( 'Underground', $export['data'][0]['data'][0]['value'] );

		$erased = Likes::erase( $email );
		$this->assertTrue( $erased['items_removed'] );
		$this->assertSame( array(), Likes::get( $this->user ) );
	}

	public function test_the_export_names_a_track_the_user_cannot_see_by_its_id_only(): void {
		// Liked while its post was published; the post is a draft now.
		update_user_option(
			$this->user,
			Likes::OPTION,
			array(
				array(
					'kind' => 'track',
					'id'   => $this->secret,
					'at'   => 1000,
				),
			)
		);
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$export = Likes::export( get_userdata( $this->user )->user_email );
		$this->assertSame( '#' . $this->secret, $export['data'][0]['data'][0]['value'], 'not the title of a track on a post they cannot read' );
	}
}
