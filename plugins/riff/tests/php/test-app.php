<?php
/**
 * The app block and shortcode: the library on the page, a post opened by its address.
 *
 * @package Riff
 */

use Riff\Listen\App;

/**
 * @covers \Riff\Listen\App
 */
class Test_Riff_App extends Riff_TestCase {

	/**
	 * A published post with one track, and a page holding the block.
	 *
	 * @return int[] Post ID and page ID.
	 */
	private function library_and_page(): array {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		$page = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app {"align":"full"} /-->',
			)
		);
		return array( $post, $page );
	}

	public function test_the_block_is_registered_with_its_shortcode(): void {
		$this->assertTrue( WP_Block_Type_Registry::get_instance()->is_registered( 'riff/app' ) );
		$this->assertTrue( shortcode_exists( 'riff' ) );
	}

	public function test_the_page_lists_the_library_with_a_link_into_the_app(): void {
		[ $post, $page ] = $this->library_and_page();
		$this->go_to( get_permalink( $page ) );

		$html = apply_filters( 'the_content', get_post( $page )->post_content );

		$this->assertStringContainsString( 'class="riff-app alignfull wp-block-riff-app"', $html, 'the block wrapper carries its supports' );
		$this->assertStringContainsString( 'data-riff-rest="' . esc_url( rest_url( 'riff/v1/library' ) ) . '"', $html );
		$this->assertStringContainsString( 'href="' . esc_url( add_query_arg( 'riff', $post, get_permalink( $page ) ) ) . '"', $html );
		$this->assertStringContainsString( '1 track', $html );
		$this->assertStringNotContainsString( 'data-riff-track=', $html, 'the library shows posts, not rows' );
	}

	public function test_the_address_opens_a_post_with_its_rows(): void {
		[ $post, $page ] = $this->library_and_page();
		$this->go_to( add_query_arg( 'riff', $post, get_permalink( $page ) ) );
		$_GET['riff'] = (string) $post; // go_to() does not fill $_GET; the block reads the address from it.

		$html = do_shortcode( '[riff]' );
		unset( $_GET['riff'] );

		$this->assertStringContainsString( 'class="riff-album"', $html );
		$this->assertStringContainsString( get_the_title( $post ), $html );
		$this->assertStringContainsString( 'data-riff-track=', $html, 'the post renders as rows the player takes over' );
		$this->assertStringContainsString( 'data-riff-app-action="shuffle"', $html );
	}

	public function test_a_post_that_cannot_be_played_falls_back_to_the_library(): void {
		[ , $page ] = $this->library_and_page();
		$words      = self::factory()->post->create();
		$this->go_to( get_permalink( $page ) );
		$_GET['riff'] = (string) $words;

		$html = App::render();
		unset( $_GET['riff'] );

		$this->assertStringContainsString( 'riff-grid', $html );
		$this->assertStringNotContainsString( 'riff-album', $html );
	}

	public function test_meta_reads_like_a_byline(): void {
		$this->assertSame(
			'Airmen of Note · 10 tracks · 7 min',
			App::meta(
				array(
					'artist'   => 'Airmen of Note',
					'count'    => 10,
					'duration' => 400,
				)
			)
		);
		$this->assertSame(
			'1 track',
			App::meta(
				array(
					'artist'   => '',
					'count'    => 1,
					'duration' => 10,
				)
			)
		);
	}
}
