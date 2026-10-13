<?php
/**
 * Default artwork: drawn for a post with no image, served by WordPress, never over a site's own.
 *
 * @package Riff
 */

use Riff\Listen\Art;
use Riff\Tracks;

/**
 * @covers \Riff\Listen\Art
 */
class Test_Riff_Art extends Riff_TestCase {

	/**
	 * A published post with one track and no featured image.
	 *
	 * @return int[] Post ID and attachment ID.
	 */
	private function bare_post(): array {
		$post = self::factory()->post->create(
			array(
				'post_status' => 'publish',
				'post_title'  => 'Night Sessions & Other Tales',
			)
		);
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		return array( $post, $id );
	}

	public function test_a_post_without_an_image_gets_a_drawn_cover(): void {
		[ $post, $id ] = $this->bare_post();

		$track = Tracks::from_attachment( $id, $post );

		$this->assertCount( 1, $track['art'] );
		$this->assertSame( Art::url( $post ), $track['art'][0]['src'] );
		$this->assertStringContainsString( 'riff-art=' . $post, $track['art'][0]['src'] );
	}

	public function test_a_sites_own_image_wins(): void {
		[ $post, $id ] = $this->bare_post();
		$cover         = self::attach( 'cover.png', $post );
		set_post_thumbnail( $post, $cover );

		$track = Tracks::from_attachment( $id, $post );

		$this->assertStringContainsString( 'cover', $track['art'][0]['src'] );
		$this->assertStringNotContainsString( 'riff-art', wp_json_encode( $track['art'] ) );
	}

	public function test_the_cover_carries_the_title_count_and_the_record(): void {
		[ $post ] = $this->bare_post();

		$svg = Art::svg( get_post( $post ) );

		$this->assertStringStartsWith( '<?xml', $svg );
		$this->assertStringContainsString( 'Night Sessions &amp; Other Tales', $svg, 'escaped for XML' );
		$this->assertStringContainsString( '>1</text>', $svg, 'the track count, large' );
		$this->assertStringContainsString( '1 track', $svg );
		$this->assertStringContainsString( '<circle', $svg );
	}

	public function test_the_palette_is_the_posts_own(): void {
		[ $a ] = $this->bare_post();
		[ $b ] = $this->bare_post();

		$this->assertSame( Art::svg( get_post( $a ) ), Art::svg( get_post( $a ) ), 'stable' );
		// Eight palettes: two posts usually differ, and always draw a valid document.
		$this->assertStringContainsString( '</svg>', Art::svg( get_post( $b ) ) );
	}

	public function test_the_route_is_a_public_query_variable(): void {
		$this->assertContains( 'riff-art', apply_filters( 'query_vars', array() ) );
		[ $post ] = $this->bare_post();
		$this->assertSame( add_query_arg( 'riff-art', $post, home_url( '/' ) ), Art::url( $post ) );
	}
}
