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
}
