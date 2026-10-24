<?php
/**
 * The Block Bindings source: core blocks show a track's details with no Riff block on the page.
 *
 * @package Riff
 */

use Riff\Bindings;
use Riff\Tracks;

/**
 * @covers \Riff\Bindings
 */
class Test_Riff_Bindings extends Riff_TestCase {

	/**
	 * A published post with one track in an audio block and no cover of its own.
	 *
	 * @return int[] Post ID and attachment ID.
	 */
	private function post_with_track(): array {
		$post = self::factory()->post->create(
			array(
				'post_status' => 'publish',
				'post_title'  => 'Bindings',
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

	/**
	 * A block bound to the source, rendered on a post as the front end renders it.
	 *
	 * @param int    $post  Post ID.
	 * @param string $block Block markup.
	 * @return string
	 */
	private function render( int $post, string $block ): string {
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => get_post( $post )->post_content . $block,
			)
		);
		$this->go_to( get_permalink( $post ) );
		return apply_filters( 'the_content', get_post( $post )->post_content );
	}

	/**
	 * A heading bound to one key.
	 *
	 * @param string $key Key.
	 * @param int    $id  Attachment ID, or 0 for the post's first track.
	 * @return string
	 */
	private function heading( string $key, int $id = 0 ): string {
		$args = array( 'key' => $key ) + ( $id ? array( 'id' => $id ) : array() );
		return '<!-- wp:heading ' . wp_json_encode(
			array(
				'metadata' => array(
					'bindings' => array(
						'content' => array(
							'source' => Bindings::SOURCE,
							'args'   => $args,
						),
					),
				),
			)
		) . ' --><h2 class="wp-block-heading"></h2><!-- /wp:heading -->';
	}

	public function test_the_source_is_registered_with_its_label_and_the_post_as_context(): void {
		$source = WP_Block_Bindings_Registry::get_instance()->get_registered( Bindings::SOURCE );

		$this->assertInstanceOf( WP_Block_Bindings_Source::class, $source );
		$this->assertSame( 'Riff track', $source->label );
		$this->assertSame( array( 'postId' ), $source->uses_context );
		$this->assertSame( array_keys( Bindings::keys() ), array( 'title', 'artist', 'album', 'year', 'duration', 'quality', 'cover' ) );
	}

	public function test_each_key_is_the_tracks_detail_as_the_player_shows_it(): void {
		[ $post, $id ] = $this->post_with_track();
		$track         = Tracks::from_attachment( $id, $post );

		$this->assertSame( 'Underground', Bindings::field( $track, 'title' ) );
		$this->assertSame( 'Airmen of Note, United States Air Force Band', Bindings::field( $track, 'artist' ) );
		$this->assertSame( 'Compositions', Bindings::field( $track, 'album' ) );
		$this->assertSame( '2012', Bindings::field( $track, 'year' ), 'the year tag, which the track itself does not carry' );
		$this->assertSame( '8:58', Bindings::field( $track, 'duration' ) );
		$this->assertSame( 'MP3 · 128 kbps', Bindings::field( $track, 'quality' ), 'the badge\'s words' );
		$this->assertSame( end( $track['art'] )['src'], Bindings::field( $track, 'cover' ) );
		$this->assertStringContainsString( 'riff-art=', Bindings::field( $track, 'cover' ), 'the drawn cover, with no image anywhere' );
		$this->assertSame( '', Bindings::field( $track, 'genre' ), 'not a key' );
	}

	public function test_duration_and_quality_cover_what_a_file_may_say(): void {
		$this->assertSame( '', Bindings::duration( 0 ) );
		$this->assertSame( '0:07', Bindings::duration( 7.4 ) );
		$this->assertSame( '1:00:05', Bindings::duration( 3605 ) );
		$this->assertSame(
			'FLAC · 24-bit 96 kHz',
			Bindings::quality(
				array(
					'format'   => 'flac',
					'lossless' => true,
					'bits'     => 24,
					'rate'     => 96000,
				)
			)
		);
		$this->assertSame(
			'FLAC · 16-bit 44.1 kHz',
			Bindings::quality(
				array(
					'format'   => 'flac',
					'lossless' => true,
					'bits'     => 16,
					'rate'     => 44100,
				)
			)
		);
		$this->assertSame(
			'ALAC · Lossless',
			Bindings::quality(
				array(
					'format'   => 'alac',
					'lossless' => true,
				)
			)
		);
		$this->assertSame( '', Bindings::quality( array() ), 'a file that told nothing' );
		$this->assertSame( 'OGG', Bindings::quality( array( 'format' => 'ogg' ) ) );
	}

	public function test_a_bound_heading_shows_the_named_track_and_a_bare_one_the_posts_first(): void {
		[ $post, $id ] = $this->post_with_track();
		$other         = self::attach( '03 - Trombone Detritus [detritus].mp3', $post );

		$html = $this->render( $post, $this->heading( 'title' ) . $this->heading( 'title', $other ) . $this->heading( 'artist', $other ) );

		$this->assertStringContainsString( '<h2 class="wp-block-heading">Underground</h2>', $html, 'the post\'s first track' );
		$this->assertStringContainsString( '<h2 class="wp-block-heading">Trombone Detritus</h2>', $html, 'the track the binding names' );
		$this->assertStringContainsString( 'Airmen of Note, United States Air Force Band</h2>', $html );
		$this->assertSame( $id, (int) Bindings::track( 0, $post )['id'] );
	}

	public function test_a_bound_image_shows_the_cover(): void {
		[ $post, $id ] = $this->post_with_track();
		$cover         = self::attach( 'cover.png', $post );
		set_post_thumbnail( $id, $cover );
		$block = '<!-- wp:image ' . wp_json_encode(
			array(
				'metadata' => array(
					'bindings' => array(
						'url' => array(
							'source' => Bindings::SOURCE,
							'args'   => array( 'key' => 'cover' ),
						),
						'alt' => array(
							'source' => Bindings::SOURCE,
							'args'   => array( 'key' => 'title' ),
						),
					),
				),
			)
		) . ' --><figure class="wp-block-image"><img src="" alt=""/></figure><!-- /wp:image -->';

		$html = $this->render( $post, $block );

		$this->assertMatchesRegularExpression( '/<img[^>]*src="[^"]*cover[^"]*"[^>]*alt="Underground"/', $html );
	}

	public function test_a_key_or_a_track_there_is_none_of_leaves_the_block_as_it_was(): void {
		$empty = self::factory()->post->create( array( 'post_status' => 'publish' ) );

		$html = $this->render( $empty, $this->heading( 'title' ) . $this->heading( 'genre', 0 ) );

		$this->assertSame( 2, substr_count( $html, '<h2 class="wp-block-heading"></h2>' ), 'nothing to show, nothing invented' );
		$this->assertNull( Bindings::value( array( 'key' => 'title' ), null, 'content' ) );
		$this->assertNull( Bindings::track( 0, 0 ) );
	}

	public function test_a_locked_track_still_names_itself_but_not_its_file(): void {
		[ $post, $id ] = $this->post_with_track();
		add_filter( 'riff_can_play', '__return_false' );

		$track = Bindings::track( $id, $post );

		$this->assertTrue( $track['locked'] );
		$this->assertSame( 'Underground', Bindings::field( $track, 'title' ) );
		$this->assertSame( '', (string) $track['src'] );
	}
}
