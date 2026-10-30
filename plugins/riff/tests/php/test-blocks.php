<?php
/**
 * The block markup: the figure gets its track, and nothing else changes.
 *
 * @package Riff
 */

use Riff\Blocks;

/**
 * @covers \Riff\Blocks
 */
class Test_Riff_Blocks extends Riff_TestCase {

	/**
	 * Renders a post's content the way the front end does, with the post set up as the current one.
	 *
	 * @param int $post Post ID.
	 * @return string
	 */
	private function render( int $post ): string {
		$this->go_to( get_permalink( $post ) );
		return apply_filters( 'the_content', get_post( $post )->post_content );
	}

	/**
	 * The track JSON out of a rendered figure.
	 *
	 * @param string $html Rendered content.
	 * @return array[]
	 */
	private function tracks( string $html ): array {
		preg_match_all( '/data-riff-track="([^"]*)"/', $html, $m );
		return array_map( static fn( $json ) => json_decode( html_entity_decode( $json, ENT_QUOTES, 'UTF-8' ), true ), $m[1] );
	}

	public function test_an_audio_block_with_an_attachment_carries_its_track(): void {
		$post = self::factory()->post->create();
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);

		$html   = $this->render( $post );
		$tracks = $this->tracks( $html );

		$this->assertCount( 1, $tracks );
		$this->assertSame( (string) $id, $tracks[0]['id'] );
		$this->assertSame( 'Underground', $tracks[0]['title'] );
		$this->assertSame( get_permalink( $post ), $tracks[0]['post']['url'] );
		$this->assertStringContainsString( 'class="wp-block-audio riff-track"', $html );
		$this->assertMatchesRegularExpression( '/<audio [^>]*controls src=/', $html, 'the native player stays' );
		$this->assertMatchesRegularExpression( '/<audio [^>]*preload="none"/', $html, 'and fetches nothing until it is pressed' );
	}

	/**
	 * The saved markup of a playlist block (WordPress 7.1): the track blocks are dynamic, so they
	 * save as self-closing comments inside the figure's list.
	 *
	 * @param int[] $ids Attachment IDs, in order.
	 * @return string
	 */
	private static function playlist( array $ids ): string {
		$items = '';
		foreach ( $ids as $id ) {
			$items .= sprintf( '<!-- wp:playlist-track {"id":%d,"src":"%s","title":"%s"} /-->', $id, wp_get_attachment_url( $id ), get_the_title( $id ) );
		}
		return '<!-- wp:playlist --><figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist wp-block-playlist__tracklist-show-numbers">' . $items . '</ol></figure><!-- /wp:playlist -->';
	}

	public function test_a_playlist_block_marks_each_of_its_items_with_a_track(): void {
		if ( ! WP_Block_Type_Registry::get_instance()->is_registered( 'core/playlist' ) ) {
			$this->markTestSkipped( 'The playlist block arrived in WordPress 7.1.' );
		}
		$post   = self::factory()->post->create();
		$first  = self::attach( '02 - Underground [underground].mp3', $post );
		$second = self::attach( '03 - Trombone Detritus [detritus].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => self::playlist( array( $first, $second ) ),
			)
		);

		$html   = $this->render( $post );
		$tracks = $this->tracks( $html );

		$this->assertCount( 2, $tracks );
		$this->assertSame( array( (string) $first, (string) $second ), array_column( $tracks, 'id' ), 'in the playlist\'s order' );
		$this->assertSame( 'Underground', $tracks[0]['title'] );
		$this->assertStringContainsString( 'class="wp-block-playlist riff-tracks"', $html );
		$this->assertSame( 2, preg_match_all( '/<li [^>]*data-riff-track="[^"]+"[^>]*class="[^"]*riff-track[^"]*"/', $html ), 'each item carries its track' );
		$this->assertStringContainsString( 'wp-block-playlist-track__button', $html, 'core\'s track buttons stay' );
		$this->assertStringContainsString( 'wp-block-playlist__waveform-player', $html, 'core\'s player markup stays' );
		$this->assertStringNotContainsString( 'initWaveformPlayer', $html, 'but core\'s player is not started, since it would fetch the whole file to draw its waveform' );
	}

	public function test_a_playlist_item_whose_file_is_gone_is_skipped_like_core_skips_it(): void {
		if ( ! WP_Block_Type_Registry::get_instance()->is_registered( 'core/playlist' ) ) {
			$this->markTestSkipped( 'The playlist block arrived in WordPress 7.1.' );
		}
		$post = self::factory()->post->create();
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => self::playlist( array( $id ) ) . self::playlist( array( $id + 1000 ) ),
			)
		);

		$html   = $this->render( $post );
		$tracks = $this->tracks( $html );

		$this->assertCount( 1, $tracks );
		$this->assertSame( (string) $id, $tracks[0]['id'] );
	}

	public function test_a_video_block_is_a_video_track(): void {
		$post = self::factory()->post->create();
		$id   = self::attach( '01 - Intensities in Ten Cities [intensities].webm', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:video {"id":%d} --><figure class="wp-block-video"><video controls src="%s"></video></figure><!-- /wp:video -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		$html   = $this->render( $post );
		$tracks = $this->tracks( $html );
		$this->assertCount( 1, $tracks );
		$this->assertSame( 'video', $tracks[0]['type'] );
		$this->assertMatchesRegularExpression( '/<video [^>]*preload="none"/', $html );
	}

	public function test_a_block_pointing_elsewhere_is_a_track_by_address(): void {
		$post   = self::factory()->post->create(
			array(
				'post_content' => '<!-- wp:audio --><figure class="wp-block-audio"><audio controls src="https://example.com/a/Blue%20Rondo.mp3"></audio><figcaption class="wp-element-caption">Blue Rondo à la Turk</figcaption></figure><!-- /wp:audio -->',
			)
		);
		$tracks = $this->tracks( $this->render( $post ) );
		$this->assertCount( 1, $tracks );
		$this->assertStringStartsWith( 'url:', $tracks[0]['id'] );
		$this->assertSame( 'https://example.com/a/Blue%20Rondo.mp3', $tracks[0]['src'] );
		$this->assertSame( 'Blue Rondo à la Turk', $tracks[0]['title'] );
	}

	public function test_a_block_with_no_source_is_left_alone(): void {
		$html = Blocks::render( '<figure class="wp-block-audio"></figure>', array( 'blockName' => 'core/audio' ) );
		$this->assertSame( '<figure class="wp-block-audio"></figure>', $html );
		$this->assertSame( '', Blocks::render( '', array( 'blockName' => 'core/audio' ) ) );
	}

	public function test_feeds_get_the_plain_block(): void {
		$post = self::factory()->post->create(
			array(
				'post_content' => '<!-- wp:audio --><figure class="wp-block-audio"><audio controls src="https://example.com/a.mp3"></audio></figure><!-- /wp:audio -->',
			)
		);
		$this->go_to( get_feed_link() );
		$this->assertTrue( is_feed() );
		$html = apply_filters( 'the_content', get_post( $post )->post_content );
		$this->assertStringNotContainsString( 'data-riff-track', $html );
	}
}
