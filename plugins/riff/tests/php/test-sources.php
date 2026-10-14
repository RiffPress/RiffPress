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

	public function test_the_blocks_source_reads_a_playlist_block_as_tracks_in_order(): void {
		if ( ! WP_Block_Type_Registry::get_instance()->is_registered( 'core/playlist' ) ) {
			$this->markTestSkipped( 'The playlist block arrived in WordPress 7.1.' );
		}
		$post   = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$first  = self::attach( '03 - Trombone Detritus [detritus].mp3', $post );
		$second = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf(
					'<!-- wp:playlist --><figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist"><!-- wp:playlist-track {"id":%d} /--><!-- wp:playlist-track {"id":%d} /--><!-- wp:playlist-track {"src":"https://example.com/no-id.mp3"} /--></ol></figure><!-- /wp:playlist -->',
					$first,
					$second
				),
			)
		);
		$source = Sources::all()['blocks'];

		$this->assertTrue( $source->supports( get_post( $post ) ) );
		$this->assertSame( array( 'Trombone Detritus', 'Underground' ), array_column( $source->tracks( get_post( $post ) ), 'title' ), 'the playlist\'s order, and an item with no file is not a track' );
		$this->assertContains( $post, wp_list_pluck( Library::query()->posts, 'ID' ), 'a post with only a playlist block is in the library' );
		$this->assertStringContainsString( 'data-riff-track=', $source->html( get_post( $post ) ), 'the rendered playlist carries its tracks' );
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
