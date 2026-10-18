<?php
/**
 * The catalogue over REST.
 *
 * @package Riff
 */

use Riff\Catalog;

/**
 * Riff\Catalog_Rest.
 */
class Test_Riff_Catalog_Rest extends Riff_TestCase {

	/**
	 * Tracks on a published post.
	 *
	 * @var int[]
	 */
	private array $published = array();

	/**
	 * A track on a draft, tagged with an album and artist nobody else has.
	 *
	 * @var int
	 */
	private int $secret = 0;

	public function set_up(): void {
		parent::set_up();
		// A fresh REST server, as test-api.php explains; and the taxonomies' meta, as test-catalog.php does.
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		$post            = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$draft           = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		$this->published = array(
			self::attach( '03 - Trombone Detritus [detritus].mp3', $post ),
			self::attach( '02 - Underground [underground].mp3', $post ),
		);
		$this->secret    = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $draft );
		wp_update_attachment_metadata(
			$this->secret,
			array(
				'album'  => 'Secret Sessions',
				'artist' => 'Hidden Artist',
			)
		);
		self::attach( '05 - Stole Back My Soul [stole-back].mp3' );
	}

	/**
	 * A GET request's data.
	 *
	 * @param string $route Route under /riff/v1.
	 * @param array  $query Query arguments.
	 * @return array
	 */
	private function get( string $route, array $query = array() ): array {
		$request = new WP_REST_Request( 'GET', '/riff/v1' . $route );
		$request->set_query_params( $query );
		return rest_do_request( $request )->get_data();
	}

	public function test_a_visitor_sees_every_track_but_those_on_unpublished_posts(): void {
		$data = $this->get( '/tracks' );

		$this->assertSame( 3, $data['total'], 'the two on the published post and the unattached one, as /wp/v2/media shows them' );
		$this->assertSame( array( 'Stole Back My Soul', 'Trombone Detritus', 'Underground' ), wp_list_pluck( $data['items'], 'title' ), 'by title' );
		$this->assertSame( 'Compositions', $data['items'][0]['album'] );
	}

	public function test_a_visitor_cannot_learn_a_private_album_or_artist_by_name_or_count(): void {
		$albums  = $this->get( '/albums' );
		$artists = $this->get( '/artists' );

		$this->assertSame( array( 'Compositions' ), wp_list_pluck( $albums['items'], 'name' ) );
		$this->assertSame( 3, $albums['items'][0]['count'], 'counted by the tracks a visitor can see' );
		$this->assertSame( 'The Airmen of Note', $albums['items'][0]['artist'] );
		$this->assertNotContains( 'Hidden Artist', wp_list_pluck( $artists['items'], 'name' ) );
		$this->assertSame( array(), $this->get( '/tracks', array( 'search' => 'Secret' ) )['items'] );
	}

	public function test_a_track_on_a_password_protected_post_is_hidden_from_visitors(): void {
		$locked = self::factory()->post->create(
			array(
				'post_status'   => 'publish',
				'post_password' => 'secret',
			)
		);
		self::attach( '06 - Sunk in Dars [sunk-in-dars].mp3', $locked );

		$this->assertNotContains( 'Sunk in Dars', wp_list_pluck( $this->get( '/tracks' )['items'], 'title' ) );
	}

	public function test_someone_who_can_upload_sees_the_whole_library(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$this->assertSame( 4, $this->get( '/tracks' )['total'] );
		$this->assertContains( 'Secret Sessions', wp_list_pluck( $this->get( '/albums' )['items'], 'name' ) );
	}

	public function test_search_matches_a_title_an_album_or_an_artist(): void {
		$this->assertSame( array( 'Trombone Detritus' ), wp_list_pluck( $this->get( '/tracks', array( 'search' => 'tromb' ) )['items'], 'title' ) );
		$this->assertSame( 3, $this->get( '/tracks', array( 'search' => 'Compos' ) )['total'], 'by album' );
		$this->assertSame( 3, $this->get( '/tracks', array( 'search' => 'Airmen' ) )['total'], 'by artist' );
		$this->assertSame( array( 'Compositions' ), wp_list_pluck( $this->get( '/albums', array( 'search' => 'comp' ) )['items'], 'name' ) );
		$this->assertSame( array(), $this->get( '/albums', array( 'search' => '%' ) )['items'], 'a wildcard is a character, not a pattern' );
	}

	public function test_an_album_lists_its_tracks_in_album_order(): void {
		$album = $this->get( '/albums' )['items'][0]['id'];

		$data = $this->get( '/tracks', array( 'album' => $album ) );

		$this->assertSame( array( 'Underground', 'Trombone Detritus', 'Stole Back My Soul' ), wp_list_pluck( $data['items'], 'title' ), 'tracks 2, 3, 5' );
	}

	public function test_an_artist_lists_their_tracks(): void {
		$artist = $this->get( '/artists' )['items'][0];

		$this->assertSame( 'Airmen of Note, United States Air Force Band', $artist['name'] );
		$this->assertSame( 3, $this->get( '/tracks', array( 'artist' => $artist['id'] ) )['total'] );
	}

	public function test_paging_and_its_limits(): void {
		$first = $this->get( '/tracks', array( 'per_page' => 1 ) );
		$this->assertSame( 3, $first['pages'] );
		$this->assertSame( array( 'Stole Back My Soul' ), wp_list_pluck( $first['items'], 'title' ) );
		$this->assertSame( array( 'Trombone Detritus' ), wp_list_pluck( $this->get( '/tracks', array( 'per_page' => 1, 'page' => 2 ) )['items'], 'title' ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound

		$request = new WP_REST_Request( 'GET', '/riff/v1/tracks' );
		$request->set_query_params( array( 'per_page' => 101 ) );
		$this->assertSame( 400, rest_do_request( $request )->get_status() );
	}

	public function test_the_routes_describe_themselves(): void {
		foreach ( array( '/tracks', '/albums', '/artists' ) as $route ) {
			$data = rest_do_request( new WP_REST_Request( 'OPTIONS', '/riff/v1' . $route ) )->get_data();
			$this->assertArrayHasKey( 'search', $data['endpoints'][0]['args'] );
			$this->assertArrayHasKey( 'items', $data['schema']['properties'] );
		}
	}
}
