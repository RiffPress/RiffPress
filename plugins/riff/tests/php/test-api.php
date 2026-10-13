<?php
/**
 * The track on every audio and video file, over REST.
 *
 * @package Riff
 */

/**
 * @covers \Riff\Api
 */
class Test_Riff_Api extends Riff_TestCase {

	/**
	 * A fresh REST server per test, as core's own REST tests do: one left over from another test
	 * has already answered rest_api_init and describes only what it knew then.
	 */
	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
	}

	public function test_media_items_carry_their_track(): void {
		$post  = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$audio = self::attach( '02 - Underground [underground].mp3', $post );
		$image = self::attach( 'cover.png', $post );

		$item = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . $audio ) )->get_data();
		$this->assertSame( 'Underground', $item['riff_track']['title'] );
		$this->assertSame( 'audio', $item['riff_track']['type'] );
		$this->assertStringContainsString( 'riff-art=' . $post, $item['riff_track']['art'][0]['src'], 'the post\'s drawn cover, as nothing else is set' );

		$this->assertNull( rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . $image ) )->get_data()['riff_track'] );
	}

	public function test_the_field_is_described_in_the_schema(): void {
		$options = rest_do_request( new WP_REST_Request( 'OPTIONS', '/wp/v2/media' ) )->get_data();
		$this->assertArrayHasKey( 'riff_track', $options['schema']['properties'] );
		$this->assertTrue( $options['schema']['properties']['riff_track']['readonly'] );

		$library = rest_do_request( new WP_REST_Request( 'OPTIONS', '/riff/v1/library' ) )->get_data();
		$this->assertSame( 'riff-library', $library['schema']['title'] );
	}

	public function test_graphql_registration_waits_for_wpgraphql(): void {
		$this->assertSame( 10, has_action( 'graphql_register_types', array( Riff\Api::class, 'graphql' ) ) );
		Riff\Api::graphql(); // Without WPGraphQL loaded this is a no-op, not an error.
		$this->assertTrue( true );
	}
}
