<?php
/**
 * Making an album through REST, and what the library holds: who may, and each way it says no.
 *
 * @package Riff
 */

/**
 * POST /riff/v1/library and GET /riff/v1/library/summary.
 *
 * @covers \Riff\Library
 */
class Test_Riff_Library_Rest extends Riff_TestCase {

	/**
	 * Makes an album through the route.
	 *
	 * @param array $body The request's body.
	 * @return WP_REST_Response
	 */
	private static function make( array $body ): WP_REST_Response {
		$request = new WP_REST_Request( 'POST', '/riff/v1/library' );
		$request->set_body_params( $body );
		return rest_do_request( $request );
	}

	/**
	 * How many posts there are of any status, to show none was made.
	 *
	 * @return int
	 */
	private static function posts(): int {
		return count(
			get_posts(
				array(
					'post_status'    => 'any',
					'posts_per_page' => -1,
					'fields'         => 'ids',
				)
			)
		);
	}

	public function test_an_author_makes_a_draft_album_of_their_tracks_in_order(): void {
		$author = self::factory()->user->create( array( 'role' => 'author' ) );
		wp_set_current_user( $author );
		$first  = self::attach( '02 - Underground [underground].mp3' );
		$second = self::attach( '01 - Intensities in Ten Cities [intensities].mp3' );
		$cover  = self::attach( 'cover.png' );
		set_post_thumbnail( $second, $cover );
		foreach ( array( $first, $second ) as $id ) {
			wp_update_post(
				array(
					'ID'          => $id,
					'post_author' => $author,
				)
			);
		}

		$response = self::make(
			array(
				'title'  => 'Side B',
				'tracks' => array( $second, $first ),
			)
		);

		$this->assertSame( 201, $response->get_status() );
		$album = get_post( $response->get_data()['id'] );
		$this->assertSame( 'draft', $album->post_status, 'a draft unless asked otherwise' );
		$this->assertSame( 'Side B', $album->post_title );
		$this->assertLessThan( strpos( $album->post_content, '"id":' . $first ), strpos( $album->post_content, '"id":' . $second ), 'in the order given' );
		$this->assertSame( $cover, (int) get_post_thumbnail_id( $album ), 'the first track\'s artwork, when none was given' );
		$this->assertSame( $album->ID, (int) get_post_field( 'post_parent', $first ), 'a track on no post is attached to the album' );
		$this->assertNotSame( '', $response->get_data()['edit'] );
	}

	public function test_a_visitor_a_subscriber_and_a_contributor_publishing_are_refused_and_nothing_is_made(): void {
		$track  = self::attach( '02 - Underground [underground].mp3' );
		$cases  = array(
			'a visitor'                => array( 0, 'draft', 401 ),
			'a subscriber'             => array( self::factory()->user->create( array( 'role' => 'subscriber' ) ), 'draft', 403 ),
			'a contributor publishing' => array( self::factory()->user->create( array( 'role' => 'contributor' ) ), 'publish', 403 ),
		);
		$before = self::posts();
		foreach ( $cases as $who => [ $user, $status, $code ] ) {
			wp_set_current_user( $user );
			$response = self::make(
				array(
					'title'  => 'Not mine',
					'tracks' => array( $track ),
					'status' => $status,
				)
			);
			$this->assertSame( $code, $response->get_status(), $who );
			$this->assertSame( 'rest_cannot_create', $response->as_error()->get_error_code(), $who );
		}
		$this->assertSame( $before, self::posts() );
		$this->assertSame( 0, (int) get_post_field( 'post_parent', $track ), 'and no track moved' );
	}

	public function test_an_author_cannot_make_an_album_of_someone_elses_track(): void {
		$owner = self::factory()->user->create( array( 'role' => 'author' ) );
		$track = self::attach( '02 - Underground [underground].mp3' );
		wp_update_post(
			array(
				'ID'          => $track,
				'post_author' => $owner,
			)
		);
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$this->assertSame(
			403,
			self::make(
				array(
					'title'  => 'Borrowed',
					'tracks' => array( $track ),
				)
			)->get_status()
		);
		$this->assertSame( 0, (int) get_post_field( 'post_parent', $track ) );
	}

	public function test_a_file_that_is_not_audio_and_artwork_that_is_not_an_image_are_each_said_why(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$track  = self::attach( '02 - Underground [underground].mp3' );
		$cover  = self::attach( 'cover.png' );
		$before = self::posts();

		$picture = self::make(
			array(
				'title'  => 'Pictures',
				'tracks' => array( $track, $cover ),
			)
		);
		$this->assertSame( 400, $picture->get_status() );
		$this->assertStringContainsString( (string) $cover, $picture->as_error()->get_error_message(), 'names the file' );

		$sleeve = self::make(
			array(
				'title'   => 'Sleeve',
				'tracks'  => array( $track ),
				'artwork' => $track,
			)
		);
		$this->assertSame( 400, $sleeve->get_status() );
		$this->assertSame( 'rest_invalid_param', $sleeve->as_error()->get_error_code() );

		$this->assertSame( $before, self::posts(), 'nothing made either time' );
	}

	public function test_what_the_library_holds_is_for_whoever_can_upload(): void {
		self::attach( '02 - Underground [underground].mp3' );
		$request = new WP_REST_Request( 'GET', '/riff/v1/library/summary' );

		wp_set_current_user( 0 );
		$this->assertSame( 401, rest_do_request( $request )->get_status() );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertSame( 403, rest_do_request( $request )->get_status() );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$response = rest_do_request( $request );
		$this->assertSame( 200, $response->get_status() );
		$this->assertGreaterThanOrEqual( 1, $response->get_data()['tracks'] ?? 0 );
	}
}
