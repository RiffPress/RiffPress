<?php
/**
 * Locked tracks: riff_can_play and riff_unlock_url.
 *
 * @package Riff
 */

/**
 * @covers \Riff\Tracks
 * @covers \Riff\Blocks
 */
class Test_Riff_Access extends Riff_TestCase {

	/**
	 * A published post holding two tracks.
	 *
	 * @var int
	 */
	private int $post = 0;

	/**
	 * The track the tests lock.
	 *
	 * @var int
	 */
	private int $locked = 0;

	/**
	 * The track left open.
	 *
	 * @var int
	 */
	private int $open = 0;

	public function set_up(): void {
		parent::set_up();
		$this->post   = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->locked = self::attach( '02 - Underground [underground].mp3', $this->post );
		$this->open   = self::attach( '03 - Trombone Detritus [detritus].mp3', $this->post );
	}

	/**
	 * Locks the one track, the way a membership plugin would, and names where to unlock it.
	 */
	private function lock(): void {
		add_filter( 'riff_can_play', fn( $allowed, $track ) => (string) $this->locked === $track['id'] ? false : $allowed, 10, 2 );
		add_filter( 'riff_unlock_url', static fn() => 'https://example.org/join/' );
	}

	/**
	 * Renders a post's content as the front end does.
	 *
	 * @param string $content Block markup.
	 * @return string
	 */
	private function render( string $content ): string {
		wp_update_post(
			array(
				'ID'           => $this->post,
				'post_content' => $content,
			)
		);
		$this->go_to( get_permalink( $this->post ) );
		return apply_filters( 'the_content', get_post( $this->post )->post_content );
	}

	/**
	 * An audio block's saved markup.
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	private function audio( int $id ): string {
		return sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) );
	}

	public function test_nothing_is_locked_until_a_plugin_says_so(): void {
		$track = \Riff\Tracks::from_attachment( $this->locked, $this->post );

		$this->assertFalse( $track['locked'] );
		$this->assertSame( '', $track['unlock'] );
		$this->assertSame( wp_get_attachment_url( $this->locked ), $track['src'] );
	}

	public function test_a_locked_track_keeps_its_details_and_loses_its_file(): void {
		$this->lock();

		$track = \Riff\Tracks::from_attachment( $this->locked, $this->post );

		$this->assertTrue( $track['locked'] );
		$this->assertSame( '', $track['src'], 'nothing to play' );
		$this->assertNull( $track['video'] );
		$this->assertSame( 'Underground', $track['title'], 'still listed by name' );
		$this->assertSame( 'https://example.org/join/', $track['unlock'] );
		$this->assertFalse( \Riff\Tracks::from_attachment( $this->open, $this->post )['locked'] );
	}

	public function test_the_tracks_route_lists_a_locked_track_without_its_file(): void {
		$this->lock();
		$request = new WP_REST_Request( 'GET', '/riff/v1/tracks' );

		$items = rest_do_request( $request )->get_data()['items'];
		$byid  = array_column( $items, null, 'id' );

		$this->assertCount( 2, $items, 'a locked track is listed, so pages and counts stay the same' );
		$this->assertTrue( $byid[ (string) $this->locked ]['locked'] );
		$this->assertSame( '', $byid[ (string) $this->locked ]['src'] );
		$this->assertNotSame( '', $byid[ (string) $this->open ]['src'] );
	}

	public function test_a_locked_audio_blocks_own_player_has_no_file_either(): void {
		$this->lock();

		$html = $this->render( $this->audio( $this->locked ) . $this->audio( $this->open ) );

		$this->assertStringNotContainsString( (string) wp_get_attachment_url( $this->locked ), $html, 'neither the track nor the native player names the file' );
		$this->assertStringContainsString( (string) wp_get_attachment_url( $this->open ), $html );
		$this->assertSame( 1, substr_count( $html, '<audio controls src=' ), 'only the open track keeps its src' );
	}

	public function test_a_locked_playlist_item_leaves_its_file_out_of_the_interactivity_state(): void {
		if ( ! WP_Block_Type_Registry::get_instance()->is_registered( 'core/playlist' ) ) {
			$this->markTestSkipped( 'The playlist block arrived in WordPress 7.1.' );
		}
		$this->lock();
		$items = '';
		foreach ( array( $this->locked, $this->open ) as $id ) {
			$items .= sprintf( '<!-- wp:playlist-track {"id":%d,"src":"%s","title":"%s"} /-->', $id, wp_get_attachment_url( $id ), get_the_title( $id ) );
		}

		$html  = $this->render( '<!-- wp:playlist --><figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist">' . $items . '</ol></figure><!-- /wp:playlist -->' );
		$state = wp_json_encode( wp_interactivity_state( 'core/playlist' ) );

		$this->assertStringNotContainsString( (string) wp_get_attachment_url( $this->locked ), $html );
		$this->assertStringNotContainsString( wp_json_encode( (string) wp_get_attachment_url( $this->locked ) ), $state, 'core\'s own player state has no address for it' );
		$this->assertStringContainsString( wp_json_encode( (string) wp_get_attachment_url( $this->open ) ), $state );
	}
}
