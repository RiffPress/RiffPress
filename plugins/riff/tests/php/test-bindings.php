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

	public function set_up(): void {
		parent::set_up();
		Bindings::flush();
	}

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
		$this->assertSame( 2012, $track['year'], 'the track carries its year' );
		$this->assertSame( '2012', Bindings::field( $track, 'year' ) );
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
		$this->assertSame(
			'FLAC · 16-bit 22.05 kHz',
			Bindings::quality(
				array(
					'format'   => 'flac',
					'lossless' => true,
					'bits'     => 16,
					'rate'     => 22050,
				)
			),
			'as the badge prints it'
		);
		$this->assertSame( '', Bindings::quality( array() ), 'a file that told nothing' );
		$this->assertSame( '', Bindings::quality( array( 'format' => 'ogg' ) ), 'no bit rate, no badge, as riff.js has it' );
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

		// Core's attribute order differs between releases, so each one is looked for on its own.
		preg_match( '/<img[^>]*>/', $html, $img );
		$this->assertMatchesRegularExpression( '/ src="[^"]*cover[^"]*"/', $img[0] ?? '' );
		$this->assertStringContainsString( ' alt="Underground"', $img[0] ?? '' );
	}

	public function test_a_key_or_a_track_there_is_none_of_leaves_the_block_as_it_was(): void {
		$empty = self::factory()->post->create( array( 'post_status' => 'publish' ) );

		$html = $this->render( $empty, $this->heading( 'title' ) . $this->heading( 'genre', 0 ) );

		$this->assertSame( 2, substr_count( $html, '<h2 class="wp-block-heading"></h2>' ), 'nothing to show, nothing invented' );
		$this->assertNull( Bindings::value( array( 'key' => 'title' ), null, 'content' ) );
		$this->assertNull( Bindings::track( 0, 0 ) );
	}

	public function test_a_block_in_a_query_loop_reads_the_post_it_is_in_not_the_page(): void {
		[ $post ] = $this->post_with_track();
		$other    = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id       = self::attach( '03 - Trombone Detritus [detritus].mp3', $other );
		wp_update_post(
			array(
				'ID'           => $other,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		$this->go_to( get_permalink( $post ) );
		// As core hands a bound block to its source inside a Query Loop: the loop's post in its context.
		$block          = new WP_Block(
			array(
				'blockName'    => 'core/heading',
				'attrs'        => array(),
				'innerBlocks'  => array(),
				'innerHTML'    => '',
				'innerContent' => array(),
			)
		);
		$block->context = array( 'postId' => $other );

		$this->assertSame( $post, get_the_ID(), 'the page is one post' );
		$this->assertSame( 'Trombone Detritus', Bindings::value( array( 'key' => 'title' ), $block, 'content' ), 'and the block another' );
		$this->assertSame( 'Underground', Bindings::value( array( 'key' => 'title' ), null, 'content' ), 'without a block, the page' );
	}

	public function test_a_tag_that_reads_like_markup_is_text_in_a_heading_and_itself_in_an_attribute(): void {
		[ $post, $id ] = $this->post_with_track();
		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => 'Under <em>ground</em> & more',
			)
		);
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

		$html = $this->render( $post, $this->heading( 'title' ) . $block );

		$this->assertStringContainsString( '<h2 class="wp-block-heading">Under &lt;em&gt;ground&lt;/em&gt; &amp; more</h2>', $html, 'text, as the player shows it' );
		$this->assertStringContainsString( 'alt="Under &lt;em&gt;ground&lt;/em&gt; &amp; more"', $html, 'escaped once, by core' );
	}

	public function test_a_named_track_is_shown_only_where_the_media_route_would_show_it(): void {
		[ $post ] = $this->post_with_track();
		$draft    = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		$hidden   = self::attach( '03 - Trombone Detritus [detritus].mp3', $draft );

		$this->assertNull( Bindings::track( $hidden, $post ), 'a visitor cannot name a draft\'s file into a public post' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		Bindings::flush();
		$this->assertSame( 'Trombone Detritus', Bindings::track( $hidden, $post )['title'], 'an editor sees it, as on the media route' );
	}

	public function test_a_track_is_read_once_a_request_however_many_blocks_bind_it(): void {
		[ $post, $id ] = $this->post_with_track();
		$reads         = 0;
		add_filter(
			'riff_track',
			static function ( $track ) use ( &$reads ) {
				++$reads;
				return $track;
			}
		);

		$this->render( $post, $this->heading( 'title', $id ) . $this->heading( 'artist', $id ) . $this->heading( 'album', $id ) );

		$this->assertSame( 1, $reads - 1, 'once for the three bindings, beside the audio block\'s own read' );
	}

	public function test_a_file_outside_the_media_library_binds_what_it_knows(): void {
		$post = self::factory()->post->create(
			array(
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:audio --><figure class="wp-block-audio"><audio controls src="https://example.com/elsewhere.mp3"></audio><figcaption>Elsewhere</figcaption></figure><!-- /wp:audio -->',
			)
		);

		$track = Bindings::track( 0, $post );

		$this->assertStringStartsWith( 'url:', $track['id'] );
		$this->assertSame( 'Elsewhere', Bindings::field( $track, 'title' ) );
		$this->assertSame( '', Bindings::field( $track, 'year' ) );
		$this->assertSame( '', Bindings::field( $track, 'quality' ) );
		$this->assertStringContainsString( 'riff-art=', Bindings::field( $track, 'cover' ), 'its post\'s drawn cover' );
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
