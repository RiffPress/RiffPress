<?php
/**
 * The blocks route, riff/v1/posts/{id}/blocks: who may read a post's blocks, and Riff's tracks resolved in them.
 *
 * @package Riff
 */

/**
 * @covers \Riff\Blocks_Rest
 */
class Test_Riff_Blocks_Rest extends Riff_TestCase {

	public function tear_down(): void {
		remove_all_filters( 'riff_post_blocks' );
		remove_all_filters( 'riff_can_play' );
		parent::tear_down();
	}

	/**
	 * A post with a paragraph and a group holding an audio block.
	 *
	 * @param array $args Post arguments.
	 * @return array{0: int, 1: int} Post ID and attachment ID.
	 */
	private function post( array $args = array() ): array {
		$post = self::factory()->post->create( $args + array( 'post_status' => 'publish' ) );
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( "<!-- wp:paragraph -->\n<p>Recorded <strong>live</strong>.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:group -->\n<div class=\"wp-block-group\"><!-- wp:audio {\"id\":%d} -->\n<figure class=\"wp-block-audio\"><audio controls src=\"%s\"></audio></figure>\n<!-- /wp:audio --></div>\n<!-- /wp:group -->", $id, wp_get_attachment_url( $id ) ),
			)
		);
		return array( $post, $id );
	}

	private function get( int $post ): WP_REST_Response {
		return rest_do_request( new WP_REST_Request( 'GET', "/riff/v1/posts/$post/blocks" ) );
	}

	public function test_a_visitor_is_refused_until_the_site_turns_it_on(): void {
		list( $post ) = $this->post();
		$this->assertSame( 'riff_post_blocks_off', $this->get( $post )->as_error()->get_error_code() );

		add_filter( 'riff_post_blocks', '__return_true' );
		$this->assertSame( 200, $this->get( $post )->get_status() );
	}

	public function test_a_private_post_or_draft_is_refused_to_anyone_who_cannot_edit_it(): void {
		add_filter( 'riff_post_blocks', '__return_true' );
		list( $private ) = $this->post( array( 'post_status' => 'private' ) );
		list( $draft )   = $this->post( array( 'post_status' => 'draft' ) );
		list( $locked )  = $this->post( array( 'post_password' => 'secret' ) );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		foreach ( array( $private, $draft, $locked ) as $post ) {
			$this->assertSame( 404, $this->get( $post )->get_status() );
		}

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$this->assertSame( 200, $this->get( $private )->get_status(), 'an editor reads what they may edit' );
	}

	public function test_someone_who_may_edit_the_post_reads_it_with_the_filter_off(): void {
		list( $post ) = $this->post();
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$this->assertSame( 200, $this->get( $post )->get_status() );
	}

	public function test_a_playlist_or_a_missing_post_is_not_found(): void {
		add_filter( 'riff_post_blocks', '__return_true' );
		$playlist = self::factory()->post->create(
			array(
				'post_type'   => 'riff_playlist',
				'post_status' => 'publish',
			)
		);
		$this->assertSame( 404, $this->get( $playlist )->get_status() );
		$this->assertSame( 404, $this->get( 999999 )->get_status() );
	}

	public function test_the_tree_is_the_core_parser_s_with_the_track_resolved_in_place(): void {
		add_filter( 'riff_post_blocks', '__return_true' );
		list( $post, $id ) = $this->post();
		$data              = $this->get( $post )->get_data();

		$this->assertSame( $post, $data['id'] );
		$this->assertCount( 2, $data['blocks'], 'white space between blocks is left out' );
		list( $paragraph, $group ) = $data['blocks'];
		$this->assertSame( 'core/paragraph', $paragraph['blockName'] );
		$this->assertStringContainsString( '<strong>live</strong>', $paragraph['innerHTML'] );
		$this->assertArrayNotHasKey( 'track', $paragraph );

		$this->assertSame( 'core/group', $group['blockName'] );
		$this->assertSame( array( '<div class="wp-block-group">', null, '</div>' ), array_map( static fn( $p ) => null === $p ? null : trim( $p ), $group['innerContent'] ), 'a gap where the audio block goes' );
		$audio = $group['innerBlocks'][0];
		$this->assertSame( 'core/audio', $audio['blockName'] );
		$this->assertSame( (string) $id, $audio['track']['id'] );
		$this->assertSame( 'Underground', $audio['track']['title'] );
		$this->assertSame( wp_get_attachment_url( $id ), $audio['track']['src'] );
		$this->assertEquals( (object) array( 'id' => $id ), $audio['attrs'] );
	}

	public function test_a_locked_track_has_no_file_address_anywhere_in_its_block(): void {
		add_filter( 'riff_post_blocks', '__return_true' );
		add_filter( 'riff_can_play', '__return_false' );
		list( $post, $id ) = $this->post();
		$audio             = $this->get( $post )->get_data()['blocks'][1]['innerBlocks'][0];

		$this->assertTrue( $audio['track']['locked'] );
		$this->assertSame( '', $audio['track']['src'] );
		$this->assertStringNotContainsString( wp_get_attachment_url( $id ), wp_json_encode( $audio ) );
	}
}
