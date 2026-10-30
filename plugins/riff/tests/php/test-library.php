<?php
/**
 * The library: which posts are in it, what a post opens as, and the REST route that serves both.
 *
 * @package Riff
 */

use Riff\Library;

/**
 * @covers \Riff\Library
 */
class Test_Riff_Library extends Riff_TestCase {

	/**
	 * A published post holding one audio block from a fixture.
	 *
	 * @param string $file Fixture file name.
	 * @return int Post ID.
	 */
	private function post_with_track( string $file = '02 - Underground [underground].mp3' ): int {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id   = self::attach( $file, $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:group --><div class="wp-block-group"><!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio --></div><!-- /wp:group -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		return $post;
	}

	/**
	 * A published post holding a track for each of `$n` files, each file with a cover of its own.
	 *
	 * @param int $n How many tracks.
	 * @return int Post ID.
	 */
	private function post_with_tracks( int $n ): int {
		$post   = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$blocks = '';
		for ( $i = 0; $i < $n; $i++ ) {
			$id = self::attach( '02 - Underground [underground].mp3', $post );
			set_post_thumbnail( $id, self::attach( 'cover.png', $post ) );
			$blocks .= sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) );
		}
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => $blocks,
			)
		);
		return $post;
	}

	/**
	 * How many queries listing these posts takes, from nothing cached but the posts themselves, as
	 * a list's query leaves them.
	 *
	 * @param int[] $ids Post IDs.
	 * @return int
	 */
	private static function queries_to_list( array $ids ): int {
		global $wpdb;
		wp_cache_flush();
		$posts  = get_posts(
			array(
				'post__in' => $ids,
				'orderby'  => 'post__in',
			)
		);
		$before = $wpdb->num_queries;
		Library::prime( $posts );
		foreach ( $posts as $post ) {
			Library::item( $post );
		}
		return $wpdb->num_queries - $before;
	}

	public function test_a_list_of_posts_costs_the_same_queries_however_many_tracks_they_hold(): void {
		$few  = array( $this->post_with_tracks( 1 ), $this->post_with_tracks( 1 ) );
		$many = array( $this->post_with_tracks( 4 ), $this->post_with_tracks( 4 ) );

		$this->assertSame( 4, Library::item( get_post( $many[0] ) )['count'] );
		$this->assertLessThanOrEqual( self::queries_to_list( $few ) + 2, self::queries_to_list( $many ), 'each track\'s file, post and cover are loaded with the rest' );
	}

	public function test_a_post_opened_is_parsed_once(): void {
		$post   = get_post( $this->post_with_tracks( 2 ) );
		$parsed = 0;
		// Asked for on every parse_blocks().
		$count = static function ( $parser ) use ( &$parsed ) {
			++$parsed;
			return $parser;
		};
		add_filter( 'block_parser_class', $count );
		$detail = Library::post( $post );
		remove_filter( 'block_parser_class', $count );

		$this->assertSame( 2, $detail['count'] );
		$this->assertCount( 2, $detail['tracks'] );
		$this->assertStringContainsString( 'data-riff-track=', $detail['html'] );
		$this->assertSame( 1, $parsed, 'for its tracks, its count and its markup' );
	}

	public function test_a_card_adds_its_tracks_up_once_until_one_of_them_changes(): void {
		$post  = get_post( $this->post_with_tracks( 2 ) );
		$built = 0;
		$count = static function ( $track ) use ( &$built ) {
			++$built;
			return $track;
		};
		$first = Library::item( $post );
		add_filter( 'riff_track', $count );
		$again = Library::item( $post );
		remove_filter( 'riff_track', $count );

		$this->assertSame( 0, $built, 'the second card builds no tracks' );
		$this->assertSame( $first, $again );

		$id   = \Riff\Blocks_Source::attachments( $post )[0];
		$meta = wp_get_attachment_metadata( $id );
		$this->assertLessThan( 5000, $first['duration'] );
		wp_update_attachment_metadata( $id, array( 'length' => 5000 ) + $meta );
		$this->assertGreaterThan( 5000, Library::item( $post )['duration'], 'until a track\'s length changes' );
	}

	public function test_only_posts_with_media_blocks_are_in_the_library(): void {
		$with    = $this->post_with_track();
		$without = self::factory()->post->create( array( 'post_content' => '<!-- wp:paragraph --><p>Words.</p><!-- /wp:paragraph -->' ) );
		$draft   = $this->post_with_track();
		wp_update_post(
			array(
				'ID'          => $draft,
				'post_status' => 'draft',
			)
		);

		$ids = wp_list_pluck( Library::query()->posts, 'ID' );

		$this->assertContains( $with, $ids );
		$this->assertNotContains( $without, $ids );
		$this->assertNotContains( $draft, $ids );
	}

	public function test_a_post_opens_with_its_tracks_and_the_rendered_blocks(): void {
		$post   = $this->post_with_track();
		$detail = Library::post( get_post( $post ) );

		$this->assertSame( 1, $detail['count'] );
		$this->assertSame( 'Underground', $detail['tracks'][0]['title'] );
		$this->assertGreaterThan( 30, $detail['duration'], 'the length comes from the file' );
		$this->assertStringContainsString( 'data-riff-track=', $detail['html'], 'the blocks render marked, nested or not' );
		$this->assertStringContainsString( wp_json_encode( get_permalink( $post ) ), html_entity_decode( $detail['html'], ENT_QUOTES, 'UTF-8' ), 'the track knows its post' );
	}

	public function test_the_rest_route_lists_the_library_and_opens_a_post(): void {
		$post = $this->post_with_track();

		$list = rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library' ) );
		$this->assertSame( 200, $list->get_status() );
		$this->assertSame( $post, $list->get_data()['items'][0]['id'] );
		$this->assertSame( 1, $list->get_data()['items'][0]['count'] );

		$one = rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library/' . $post ) );
		$this->assertSame( 200, $one->get_status() );
		$this->assertSame( 'Underground', $one->get_data()['tracks'][0]['title'] );
		$this->assertStringContainsString( 'riff-track', $one->get_data()['html'] );
	}

	public function test_the_rest_route_hides_what_cannot_be_played(): void {
		$words = self::factory()->post->create();
		$this->assertSame( 404, rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library/' . $words ) )->get_status() );

		$draft = $this->post_with_track();
		wp_update_post(
			array(
				'ID'          => $draft,
				'post_status' => 'draft',
			)
		);
		$this->assertSame( 404, rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library/' . $draft ) )->get_status() );
	}

	public function test_a_password_protected_post_is_listed_nowhere(): void {
		$locked = $this->post_with_track();
		wp_update_post(
			array(
				'ID'            => $locked,
				'post_password' => 'secret',
			)
		);
		$this->assertNotContains( $locked, wp_list_pluck( Library::query()->posts, 'ID' ) );
		$this->assertSame( 404, rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library/' . $locked ) )->get_status() );
	}

	public function test_the_list_paginates(): void {
		$this->post_with_track();
		$this->post_with_track();
		$one = static function ( \WP_Query $query ): void {
			if ( \Riff\Library::PER_PAGE === (int) $query->get( 'posts_per_page' ) ) {
				$query->set( 'posts_per_page', 1 );
			}
		};
		add_action( 'pre_get_posts', $one );
		$first = rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library' ) )->get_data();
		$next  = new WP_REST_Request( 'GET', '/riff/v1/library' );
		$next->set_param( 'page', 2 );
		$second = rest_do_request( $next )->get_data();
		remove_action( 'pre_get_posts', $one );
		$this->assertSame( 2, $first['pages'] );
		$this->assertSame( 2, $first['total'] );
		$this->assertCount( 1, $first['items'] );
		$this->assertNotSame( $first['items'][0]['id'], $second['items'][0]['id'] );
	}
}
