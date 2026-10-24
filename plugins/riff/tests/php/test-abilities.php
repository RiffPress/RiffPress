<?php
/**
 * The abilities: each one answers what its REST route answers, and is allowed what it allows.
 *
 * @package Riff
 */

use Riff\Abilities;

/**
 * @covers \Riff\Abilities
 */
class Test_Riff_Abilities extends Riff_TestCase {

	/**
	 * A published post with two tracks.
	 *
	 * @var int
	 */
	private int $post;

	/**
	 * The two tracks' attachment IDs.
	 *
	 * @var int[]
	 */
	private array $tracks;

	/**
	 * A subscriber.
	 *
	 * @var int
	 */
	private int $user;

	public function set_up(): void {
		parent::set_up();
		$this->post   = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->tracks = array(
			self::attach( '02 - Underground [underground].mp3', $this->post ),
			self::attach( '03 - Trombone Detritus [detritus].mp3', $this->post ),
		);
		$blocks       = '';
		foreach ( $this->tracks as $id ) {
			$blocks .= sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) );
		}
		wp_update_post(
			array(
				'ID'           => $this->post,
				'post_content' => $blocks,
			)
		);
		$this->user = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( 0 );
	}

	/**
	 * A route's answer, as REST gives it.
	 *
	 * @param string $method Method.
	 * @param string $path   Path under riff/v1.
	 * @param array  $params Parameters.
	 * @return mixed
	 */
	private function route( string $method, string $path, array $params = array() ) {
		$request = new WP_REST_Request( $method, '/riff/v1' . $path );
		if ( 'GET' === $method ) {
			$request->set_query_params( $params );
		} else {
			$request->set_body_params( $params );
		}
		return rest_do_request( $request )->get_data();
	}

	public function test_every_ability_is_registered_in_riffs_category_with_its_words(): void {
		$this->assertNotNull( wp_get_ability_category( Abilities::CATEGORY ) );
		foreach ( Abilities::list() as $name => $spec ) {
			$ability = wp_get_ability( $name );
			$this->assertNotNull( $ability, $name );
			$this->assertSame( Abilities::CATEGORY, $ability->get_category() );
			$this->assertSame( $spec['label'], $ability->get_label() );
			$this->assertSame( $spec['output'], $ability->get_output_schema(), "$name answers in its route's shape" );
			$this->assertSame( $spec['readonly'], $ability->get_meta_item( 'annotations' )['readonly'] );
			$this->assertTrue( $ability->get_meta_item( 'public' ) );
		}
		$this->assertCount( 11, Abilities::list() );
	}

	public function test_the_read_abilities_answer_what_their_routes_answer_to_a_visitor(): void {
		$cases = array(
			array( 'riff/tracks', '/tracks', array( 'search' => 'Underground' ) ),
			array(
				'riff/tracks',
				'/tracks',
				array(
					'orderby'  => 'added',
					'per_page' => 1,
					'page'     => 2,
				),
			),
			array( 'riff/albums', '/albums', array( 'search' => 'Compositions' ) ),
			array( 'riff/artists', '/artists', array() ),
			array( 'riff/library', '/library', array( 'page' => 1 ) ),
		);
		foreach ( $cases as list( $name, $path, $input ) ) {
			$answer = wp_get_ability( $name )->execute( $input );
			$this->assertNotWPError( $answer, $name );
			$this->assertSame( $this->route( 'GET', $path, $input ), $answer, $name );
			$this->assertNotEmpty( $answer['items'], $name );
		}
		$tracks = wp_get_ability( 'riff/tracks' )->execute( array( 'album' => (int) wp_get_object_terms( $this->tracks[0], 'riff_album' )[0]->term_id ) );
		$this->assertSame( array( 'Underground', 'Trombone Detritus' ), array_column( $tracks['items'], 'title' ), 'an album, in album order' );
	}

	public function test_a_visitor_is_refused_what_the_routes_refuse(): void {
		foreach ( array( 'riff/likes', 'riff/history', 'riff/playlists', 'riff/like', 'riff/unlike', 'riff/add-to-playlist', 'riff/remove-from-playlist' ) as $name ) {
			$input  = array(
				'kind'     => 'track',
				'id'       => $this->tracks[0],
				'playlist' => 1,
				'index'    => 0,
				'tracks'   => array( $this->tracks[0] ),
			);
			$input  = array_intersect_key( $input, Abilities::list()[ $name ]['input'] );
			$answer = $input ? wp_get_ability( $name )->execute( $input ) : wp_get_ability( $name )->execute();
			$this->assertWPError( $answer, $name );
			$this->assertSame( 'ability_invalid_permissions', $answer->get_error_code(), $name );
		}
		$this->assertFalse( Abilities::permitted( 'riff/nothing', array() ), 'no such ability' );
	}

	public function test_likes_and_history_are_the_users_own_and_a_like_can_be_taken_back(): void {
		wp_set_current_user( $this->user );

		$this->assertSame( array(), wp_get_ability( 'riff/likes' )->execute()['items'], 'nothing yet, and nothing to pass' );
		$this->assertWPError( wp_get_ability( 'riff/likes' )->execute( array( 'page' => 2 ) ), 'an ability that takes nothing takes nothing' );
		$this->assertSame( $this->route( 'GET', '/users/me/history' ), wp_get_ability( 'riff/history' )->execute() );

		$liked = wp_get_ability( 'riff/like' )->execute(
			array(
				'kind' => 'track',
				'id'   => $this->tracks[0],
			)
		);
		$this->assertNotWPError( $liked );
		$this->assertSame( array( array( 'track', $this->tracks[0] ) ), array_map( static fn( array $l ): array => array( $l['kind'], (int) $l['id'] ), $liked['items'] ) );
		$this->assertSame( $this->route( 'GET', '/users/me/likes' ), wp_get_ability( 'riff/likes' )->execute(), 'the list is the route\'s' );

		$album = (int) wp_get_object_terms( $this->tracks[0], 'riff_album' )[0]->term_id;
		wp_get_ability( 'riff/like' )->execute(
			array(
				'kind' => 'album',
				'id'   => $album,
			)
		);
		$this->assertCount( 2, wp_get_ability( 'riff/likes' )->execute()['items'] );

		$left = wp_get_ability( 'riff/unlike' )->execute(
			array(
				'kind' => 'track',
				'id'   => $this->tracks[0],
			)
		);
		$this->assertNotWPError( $left );
		$this->assertSame( array( 'album' ), array_column( $left['items'], 'kind' ) );
	}

	public function test_a_track_joins_and_leaves_one_of_the_users_playlists(): void {
		wp_set_current_user( $this->user );
		$made = $this->route(
			'POST',
			'/users/me/playlists',
			array(
				'title'  => 'Mine',
				'tracks' => array( $this->tracks[0] ),
			)
		);
		$id   = (int) $made['id'];
		$this->assertGreaterThan( 0, $id );

		$this->assertSame( $this->route( 'GET', '/users/me/playlists' ), wp_get_ability( 'riff/playlists' )->execute() );

		$added = wp_get_ability( 'riff/add-to-playlist' )->execute(
			array(
				'playlist' => $id,
				'tracks'   => array( $this->tracks[1], $this->tracks[0] ),
			)
		);
		$this->assertNotWPError( $added );
		$this->assertSame( array( $this->tracks[0], $this->tracks[1], $this->tracks[0] ), array_map( 'intval', array_column( $added['tracks'], 'id' ) ) );

		$left = wp_get_ability( 'riff/remove-from-playlist' )->execute(
			array(
				'playlist' => $id,
				'index'    => 0,
			)
		);
		$this->assertNotWPError( $left );
		$this->assertSame( array( $this->tracks[1], $this->tracks[0] ), array_map( 'intval', array_column( $left['tracks'], 'id' ) ) );
		$listed = wp_get_ability( 'riff/playlists' )->execute()['items'];
		$this->assertSame( $this->route( 'GET', '/users/me/playlists' )['items'], $listed );
		$this->assertSame( array( $id, 2 ), array( (int) $listed[0]['id'], (int) $listed[0]['count'] ) );

		// Another user's playlist is not this one's to change: the route's own refusal.
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$other = wp_get_ability( 'riff/add-to-playlist' )->execute(
			array(
				'playlist' => $id,
				'tracks'   => array( $this->tracks[1] ),
			)
		);
		$this->assertWPError( $other );
		$this->assertSame( 'ability_invalid_permissions', $other->get_error_code() );
	}

	public function test_input_is_held_to_the_schema_before_the_route_sees_it(): void {
		wp_set_current_user( $this->user );

		$this->assertWPError(
			wp_get_ability( 'riff/like' )->execute(
				array(
					'kind' => 'song',
					'id'   => $this->tracks[0],
				)
			),
			'not a kind'
		);
		$this->assertWPError( wp_get_ability( 'riff/like' )->execute( array( 'id' => $this->tracks[0] ) ), 'the kind is required' );
		$this->assertWPError( wp_get_ability( 'riff/tracks' )->execute( array( 'genre' => 'jazz' ) ), 'nothing the route does not take' );
		$this->assertWPError( Abilities::run( 'riff/nothing', array() ) );
		$this->assertNull( Abilities::request( 'riff/nothing', array() ) );
	}
}
