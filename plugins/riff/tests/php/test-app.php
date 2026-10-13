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

	public function test_the_listen_template_is_registered_and_a_slug_opens_a_post(): void {
		if ( ! function_exists( 'register_block_template' ) ) {
			$this->markTestSkipped( 'register_block_template() arrived in WordPress 6.7.' );
		}
		$template = get_block_template( App::TEMPLATE );
		$this->assertNotNull( $template, 'the template is registered' );
		$this->assertStringContainsString( '<!-- wp:riff/app', $template->content );
		$this->assertSame( array( 'page' ), $template->post_types );

		[ $post, $page ] = $this->library_and_page();
		$this->go_to( get_permalink( $page ) );
		$_GET['riff'] = get_post( $post )->post_name;
		$html         = App::render();
		unset( $_GET['riff'] );
		$this->assertStringContainsString( 'class="riff-album"', $html, 'a slug opens the post the way an id does' );
	}

	/**
	 * A published post whose content carries one audio block, which is what the library reads.
	 */
	private function post_with_track( string $title = 'Side A' ): int {
		$post = self::factory()->post->create(
			array(
				'post_status' => 'publish',
				'post_title'  => $title,
			)
		);
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		return $post;
	}

	public function test_the_library_item_carries_the_byline_for_the_app_and_the_route(): void {
		$post = $this->post_with_track();
		$item = \Riff\Library::item( get_post( $post ) );
		$this->assertSame( App::meta( $item ), $item['meta'] );
		$this->assertStringContainsString( '1 track', $item['meta'] );
		$listed = rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library' ) )->get_data()['items'][0];
		$this->assertSame( $item['meta'], $listed['meta'] );
		$this->assertArrayHasKey( 'meta', \Riff\Library::item_schema()['properties'] );
	}

	public function test_a_card_is_a_link_beside_a_play_button_never_one_inside_the_other(): void {
		$post = $this->post_with_track();
		$html = App::render( array(), '' );
		$this->assertMatchesRegularExpression( '#<div class="riff-card" data-riff-post="' . $post . '">#', $html );
		$this->assertStringContainsString( 'class="riff-card-play"', $html, 'the server-rendered card can play from its cover' );
		$this->assertStringContainsString( 'aria-label="Play Side A"', $html );
		$this->assertDoesNotMatchRegularExpression( '#<a[^>]*>(?:(?!</a>).)*<button#s', $html, 'no button inside a link' );
	}
}
