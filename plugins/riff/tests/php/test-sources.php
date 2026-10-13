<?php
/**
 * Sources: the core blocks source reads posts, and a registered source of its own feeds the
 * library, the REST route and the tracks alike.
 *
 * @package Riff
 */

use Riff\Blocks_Source;
use Riff\Library;
use Riff\Sources;

require_once __DIR__ . '/class-riff-test-mixtape-source.php';

/**
 * @covers \Riff\Sources
 * @covers \Riff\Blocks_Source
 */
class Test_Riff_Sources extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		register_post_type( 'mixtape', array( 'public' => true ) );
	}

	public function tear_down(): void {
		Sources::unregister( 'mixtape' );
		unregister_post_type( 'mixtape' );
		parent::tear_down();
	}

	public function test_the_blocks_source_is_registered_at_boot(): void {
		$this->assertInstanceOf( Blocks_Source::class, Sources::all()['blocks'] );
	}

	public function test_a_registered_source_feeds_the_library_and_the_rest_route(): void {
		Sources::register( new Riff_Test_Mixtape_Source() );
		$mixtape = self::factory()->post->create(
			array(
				'post_type'   => 'mixtape',
				'post_status' => 'publish',
				'post_title'  => 'Side A',
			)
		);
		$audio   = self::attach( '02 - Underground [underground].mp3', $mixtape );
		update_post_meta( $mixtape, 'mixtape_tracks', array( $audio ) );
		$words = self::factory()->post->create( array( 'post_type' => 'mixtape' ) );

		$this->assertInstanceOf( Riff_Test_Mixtape_Source::class, Sources::for_post( get_post( $mixtape ) ) );
		$this->assertSame( 'Underground', Library::tracks( get_post( $mixtape ) )[0]['title'] );
		$this->assertStringContainsString( 'data-riff-track=', Library::html( get_post( $mixtape ) ) );

		$ids = wp_list_pluck( Library::query( array( 'post_type' => array( 'post', 'mixtape' ) ) )->posts, 'ID' );
		$this->assertContains( $mixtape, $ids, 'its WHERE clause joins the library query' );
		$this->assertContains( $words, $ids, 'SQL alone cannot see that this one is empty' );

		$one = rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library/' . $mixtape ) );
		$this->assertSame( 200, $one->get_status() );
		$this->assertSame( 'Underground', $one->get_data()['tracks'][0]['title'] );
		$this->assertSame( 404, rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library/' . $words ) )->get_status(), 'an empty one is not a thing to open' );
	}

	public function test_the_sources_filter_can_replace_the_set(): void {
		$none = static fn(): array => array();
		add_filter( 'riff_sources', $none );
		$post = self::factory()->post->create( array( 'post_content' => '<!-- wp:audio {"id":1} --><figure class="wp-block-audio"><audio controls src="/a.mp3"></audio></figure><!-- /wp:audio -->' ) );
		$this->assertNull( Sources::for_post( get_post( $post ) ) );
		$this->assertSame( array(), Library::tracks( get_post( $post ) ) );
		remove_filter( 'riff_sources', $none );
	}
}
