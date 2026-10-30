<?php
/**
 * Default artwork: drawn for a post with no image, served by WordPress, never over a site's own.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Listen\Art;
use Riff\Listen\Cover;
use Riff\Tracks;

/**
 * @covers \Riff\Listen\Art
 */
class Test_Riff_Art extends Riff_TestCase {

	/**
	 * A published post with one track and no featured image.
	 *
	 * @param string $title Post title.
	 * @return int[] Post ID and attachment ID.
	 */
	private function bare_post( string $title = 'Night Sessions & Other Tales' ): array {
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
		return array( $post, $id );
	}

	public function test_a_post_without_an_image_gets_a_drawn_cover(): void {
		[ $post, $id ] = $this->bare_post();

		$track = Tracks::from_attachment( $id, $post );

		$this->assertCount( 1, $track['art'] );
		$this->assertSame( Art::url( $post ), $track['art'][0]['src'] );
		$this->assertStringContainsString( 'riff-art=' . $post, $track['art'][0]['src'] );
	}

	public function test_a_drawn_cover_says_what_it_draws(): void {
		[ $post, $id ] = $this->bare_post();
		$album         = (int) wp_get_object_terms( $id, Catalog::ALBUM )[0]->term_id;
		$track         = Tracks::from_attachment( $id, $post );
		$this->assertSame( 'Cover of ' . html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ), $track['art'][0]['alt'], 'a post\'s cover names the post, as it is written' );
		$art = Art::album_art( $album, $track['art'] );
		$this->assertSame( 'Cover of Compositions by The Airmen of Note', $art[0]['alt'], 'an album\'s cover names the album and its artist' );
		$this->assertSame( '', Art::alt( '', 'Nobody' ) );
	}

	public function test_an_album_with_no_image_gets_a_cover_drawn_for_the_album(): void {
		[ $post, $id ] = $this->bare_post();
		$album         = (int) wp_get_object_terms( $id, Catalog::ALBUM )[0]->term_id;
		$track         = Tracks::from_attachment( $id, $post );

		$art = Art::album_art( $album, $track['art'] );
		$svg = Art::album_svg( $album );

		$this->assertTrue( Art::drawn( $track['art'] ), 'the track alone falls back to its post\'s drawn cover' );
		$this->assertStringContainsString( 'riff-art=album-' . $album, $art[0]['src'] );
		$this->assertStringContainsString( '>Compositions<', $svg, 'the album\'s own name' );
		$this->assertStringContainsString( 'The Airmen of Note', $svg, 'and its artist' );
		$this->assertStringContainsString( '>1</text>', $svg, 'and how many of its tracks can be seen' );
		$this->assertStringNotContainsString( 'Night Sessions', $svg, 'not the post\'s' );
		$this->assertSame( array(), Art::album( 0 ) );

		$cover = self::attach( 'cover.png', $post );
		set_post_thumbnail( $id, $cover );
		$own = Tracks::from_attachment( $id, $post )['art'];
		$this->assertFalse( Art::drawn( $own ) );
		$this->assertSame( $own, Art::album_art( $album, $own ), 'an image of the site\'s own wins' );

		$tint = Art::tint( $art );
		$this->assertMatchesRegularExpression( '/^#[0-9a-f]{6}$/', $tint, 'an album\'s drawn cover tints its page as a post\'s does' );
	}

	public function test_a_private_albums_cover_is_not_drawn_for_a_visitor(): void {
		[ $post, $id ] = $this->bare_post();
		$album         = (int) wp_get_object_terms( $id, Catalog::ALBUM )[0]->term_id;
		wp_update_post(
			array(
				'ID'          => $post,
				'post_status' => 'private',
			)
		);

		wp_set_current_user( 0 );
		$this->assertNull( Art::album_svg( $album ), 'nothing to learn an album\'s name from' );
		$this->assertNull( Art::album_svg( 0 ) );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$this->assertStringContainsString( '>Compositions<', (string) Art::album_svg( $album ) );
	}

	public function test_a_sites_own_image_wins(): void {
		[ $post, $id ] = $this->bare_post();
		$cover         = self::attach( 'cover.png', $post );
		set_post_thumbnail( $post, $cover );

		$track = Tracks::from_attachment( $id, $post );

		$this->assertStringContainsString( 'cover', $track['art'][0]['src'] );
		$this->assertStringNotContainsString( 'riff-art', wp_json_encode( $track['art'] ) );
	}

	public function test_the_cover_carries_the_title_the_count_and_the_record(): void {
		[ $post ] = $this->bare_post();

		$svg = Art::svg( get_post( $post ) );

		$this->assertStringStartsWith( '<?xml', $svg );
		$this->assertStringContainsString( 'Night Sessions &amp; Other Tales', $svg, 'escaped for XML' );
		$this->assertStringContainsString( '>1</text>', $svg, 'the track count, large' );
		$this->assertStringContainsString( '1 track', $svg );
		$this->assertStringContainsString( '<circle', $svg );
		$this->assertSame( 1, substr_count( $svg, 'class="riff-groove"' ), 'one groove per track' );
	}

	public function test_the_cover_does_not_repeat_the_artist_in_its_byline(): void {
		[ $post ] = $this->bare_post();
		$svg      = Art::svg( get_post( $post ) );
		$this->assertSame( 1, substr_count( $svg, 'Airmen of Note, United States Air Force Band' ), 'the artist is on its own line, once' );
		$this->assertStringContainsString( '>1 track', $svg );
	}

	public function test_the_fonts_are_embedded_and_are_the_brands(): void {
		[ $post ] = $this->bare_post();
		$svg      = Art::svg( get_post( $post ) );
		$this->assertStringContainsString( "@font-face{font-family:'Riff Garamond'", $svg );
		$this->assertStringContainsString( "@font-face{font-family:'Riff Inter'", $svg );
		$this->assertStringContainsString( 'data:font/woff2;base64,', $svg );
		$this->assertStringNotContainsString( 'Poppins', $svg );
	}

	public function test_the_cover_comes_from_the_slug_so_it_survives_a_reseed(): void {
		[ $post ] = $this->bare_post();
		$a        = get_post( $post );
		$b        = clone $a;
		$b->ID    = $a->ID + 1000;
		$this->assertSame( Art::svg( $a ), Art::svg( $b ), 'the same slug draws the same cover whatever the ID' );
		$c            = clone $a;
		$c->post_name = 'another-slug-entirely';
		$this->assertNotSame( Art::svg( $a ), Art::svg( $c ), 'a different slug draws a different cover' );
	}

	public function test_every_colour_is_a_wordpress_org_token_and_never_riffs_accent(): void {
		// Riff's ivory is kept for what you press, as Play, so no cover looks like a button.
		$tokens = array( '#1e1e1e', '#3858e9', '#f6f6f6', '#ffffff', '#e26f56', '#33f078', '#fff972', '#d7a7ff', '#7a00df', '#40464d', '#213fd4' );
		foreach ( Cover::palettes() as $palette ) {
			foreach ( $palette as $colour ) {
				$this->assertContains( strtolower( $colour ), $tokens, "$colour is a design system token" );
			}
		}
		$this->assertSame( array( 'corner', 'centre', 'horizon' ), Cover::layouts() );
	}

	public function test_a_track_with_level_data_puts_the_music_in_the_groove(): void {
		$levels = static function ( $track ) {
			$track['levels'] = str_repeat( '0369', 30 );
			return $track;
		};
		add_filter( 'riff_track', $levels );
		[ $post ] = $this->bare_post();
		$svg      = Art::svg( get_post( $post ) );
		remove_filter( 'riff_track', $levels );
		$this->assertMatchesRegularExpression( '#<path class="riff-groove" d="M[\d. ]+L#', $svg, 'the groove is a path that follows the levels' );
	}

	public function test_the_sheet_is_for_editors_only(): void {
		$this->bare_post();
		$html = Art::sheet();
		$this->assertStringContainsString( '<!DOCTYPE html>', $html );
		$this->assertSame( count( Cover::palettes() ) * count( Cover::layouts() ), substr_count( $html, '<figure>' ), 'one cell per palette and layout' );
		$this->assertStringContainsString( 'data:image/svg+xml;base64,', $html );
	}

	public function test_a_cover_title_breaks_evenly_and_never_leaves_one_word_alone(): void {
		$wrap = new ReflectionMethod( Cover::class, 'wrap' );
		$wrap->setAccessible( true );
		$this->assertSame( array( 'Hands Across', 'the Sea' ), $wrap->invoke( null, 'Hands Across the Sea', 14 ) );
		$this->assertSame( array( 'Carols of', 'the Season' ), $wrap->invoke( null, 'Carols of the Season', 14 ) );
		$this->assertSame( array( 'Strolling', 'Strings' ), $wrap->invoke( null, 'Strolling Strings', 14 ), 'two words may sit one a line' );
		$this->assertSame( array( 'Silver Wings' ), $wrap->invoke( null, 'Silver Wings', 14 ) );
		foreach ( array( 'Little Dreamer Big Dreams', 'The Stars and Stripes Forever', 'A Night on the Town Again' ) as $title ) {
			$lines = $wrap->invoke( null, $title, 14 );
			$this->assertCount( 2, $lines, $title );
			$this->assertStringContainsString( ' ', $lines[1], "$title leaves one word alone" );
		}
	}

	public function test_the_route_is_a_public_query_variable(): void {
		$this->assertContains( 'riff-art', apply_filters( 'query_vars', array() ) );
		[ $post ] = $this->bare_post();
		$url      = Art::url( $post );
		$this->assertStringStartsWith( add_query_arg( 'riff-art', $post, home_url( '/' ) ) . '&ver=', $url );
		// The drawing's version is in the address, so a browser that kept a cover for a day fetches
		// the new one when Riff draws covers differently.
		$this->assertMatchesRegularExpression( '/&ver=[0-9a-f]{8}$/', $url );
		// From what the drawing code says, so a deploy that writes the same files keeps every address,
		// and from the stamp, which moves when anything a cover draws from does.
		$dir = RIFF_DIR . 'features/listen/';
		$this->assertStringEndsWith( '&ver=' . substr( md5( RIFF_VERSION . md5_file( $dir . 'class-cover.php' ) . md5_file( $dir . 'class-art.php' ) . get_option( Art::STAMP, '' ) ), 0, 8 ), $url );
	}

	public function test_a_cover_drawn_once_is_kept_in_uploads_and_linked_from_there(): void {
		[ $post, $id ] = $this->bare_post();
		$this->assertStringContainsString( 'riff-art=' . $post, Art::url( $post ), 'not drawn yet, so WordPress draws it' );

		$svg = $this->serve( (string) $post );

		$url = Art::url( $post );
		$this->assertMatchesRegularExpression( '#/uploads/riff-art/[0-9a-f]{8}/' . $post . '\.svg$#', $url, 'then the web server serves the file' );
		$this->assertSame( $svg, file_get_contents( $this->path( $url ) ) );
		$this->assertTrue( Art::drawn( array( array( 'src' => $url ) ) ), 'and it is still a drawn cover' );
		$this->assertSame( Art::tint( Tracks::from_attachment( $id, $post )['art'] ), Art::tint( array( array( 'src' => $url ) ) ), 'that tints as it did' );
	}

	public function test_a_change_draws_again_and_keeps_the_cover_a_cached_page_links_to(): void {
		[ $post ] = $this->bare_post();
		$this->serve( (string) $post );
		$before = Art::url( $post );

		wp_update_post(
			array(
				'ID'         => $post,
				'post_title' => 'Morning Sessions',
			)
		);

		$this->assertStringContainsString( 'riff-art=' . $post, Art::url( $post ), 'drawn again when next asked for' );
		$this->assertFileExists( $this->path( $before ), 'the cover a page cached a moment ago links to stays' );
		$this->assertStringContainsString( 'Morning', $this->serve( (string) $post ) );

		wp_update_post(
			array(
				'ID'         => $post,
				'post_title' => 'Evening Sessions',
			)
		);
		$this->assertFileDoesNotExist( $this->path( $before ), 'and goes with the next change' );
	}

	public function test_saves_with_nothing_drawn_since_move_the_stamp_once(): void {
		[ $post ] = $this->bare_post();
		$this->serve( (string) $post );
		wp_update_post( array( 'ID' => $post ) );
		$stamp = get_option( Art::STAMP );
		wp_update_post( array( 'ID' => $post ) );
		wp_update_post( array( 'ID' => $post ) );
		$this->assertSame( $stamp, get_option( Art::STAMP ), 'an import saving many tracks moves it once' );
	}

	public function test_a_post_that_stops_being_public_takes_every_kept_cover(): void {
		[ $post, $id ] = $this->bare_post();
		$album         = (int) wp_get_object_terms( $id, Catalog::ALBUM )[0]->term_id;
		$this->serve( (string) $post );
		$this->serve( 'album-' . $album );
		$kept = array( $this->path( Art::url( $post ) ), $this->path( Art::album( $album )[0]['src'] ) );

		wp_update_post(
			array(
				'ID'            => $post,
				'post_password' => 'secret',
			)
		);

		foreach ( $kept as $file ) {
			$this->assertFileDoesNotExist( $file, 'nothing kept tells a visitor what it held' );
		}
		$this->assertNull( Art::shared( (string) $post ) );
		$this->assertNull( Art::shared( 'album-' . $album ), 'nor what its album holds' );
	}

	public function test_a_cover_only_a_listener_may_see_is_drawn_for_them_and_kept_nowhere(): void {
		[ $post, $id ] = $this->bare_post();
		$album         = (int) wp_get_object_terms( $id, Catalog::ALBUM )[0]->term_id;
		wp_update_post(
			array(
				'ID'          => $post,
				'post_status' => 'private',
			)
		);
		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		wp_set_current_user( $editor );

		$this->assertNull( Art::shared( 'album-' . $album ), 'drawn as a visitor sees it, there is nothing' );
		$this->assertSame( $editor, get_current_user_id(), 'and the editor is signed in again after' );
		$this->assertStringContainsString( '>Compositions<', (string) Art::draw( 'album-' . $album ), 'drawn for the editor, there is' );
		$this->assertStringContainsString( 'riff-art=album-' . $album, Art::album( $album )[0]['src'], 'and nothing is kept' );
	}

	public function test_a_cover_drawn_from_what_changed_while_it_was_drawn_is_not_kept(): void {
		[ $post ] = $this->bare_post();
		$since    = microtime( true );
		$svg      = (string) Art::shared( (string) $post );
		wp_update_post(
			array(
				'ID'         => $post,
				'post_title' => 'Morning Sessions',
			)
		);
		$keep = new ReflectionMethod( Art::class, 'keep' );
		$keep->setAccessible( true );
		$keep->invoke( null, (string) $post, $svg, $since );

		$this->assertStringContainsString( 'riff-art=' . $post, Art::url( $post ), 'drawn again from the post as it is now' );
	}

	public function test_attaching_a_track_in_the_media_library_takes_every_kept_cover(): void {
		[ $post, $id ] = $this->bare_post();
		$this->serve( (string) $post );
		$kept = $this->path( Art::url( $post ) );

		// What Attach and Detach fire, having changed the track's post with SQL of their own.
		do_action( 'wp_media_attach_action', 'detach', $id, $post );

		$this->assertFileDoesNotExist( $kept );
	}

	public function test_only_what_a_cover_draws_from_draws_the_covers_again(): void {
		[ $post ] = $this->bare_post();
		$this->serve( (string) $post );
		$stamp = get_option( Art::STAMP );

		$words = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		wp_update_post(
			array(
				'ID'         => $words,
				'post_title' => 'Only words',
			)
		);
		$image = self::attach( 'cover.png', $words );
		wp_update_attachment_metadata( $image, array( 'width' => 1 ) );
		$this->assertSame( $stamp, get_option( Art::STAMP ), 'not a post with no tracks, nor an image' );

		wp_update_post(
			array(
				'ID'         => $post,
				'post_title' => 'Morning Sessions',
			)
		);
		$this->assertNotSame( $stamp, get_option( Art::STAMP ), 'a post with tracks' );
	}

	public function test_nothing_is_kept_where_uploads_are_not_a_folder_that_can_be_listed(): void {
		[ $post ] = $this->bare_post();
		// As S3 Uploads does, a stream wrapper of its own.
		if ( ! in_array( 'riffs3', stream_get_wrappers(), true ) ) {
			stream_wrapper_register( 'riffs3', get_class( new class() {} ) );
		}
		$to = static function ( $dir ) {
			$dir['basedir'] = 'riffs3://bucket/uploads';
			return $dir;
		};
		add_filter( 'upload_dir', $to );
		$this->serve( (string) $post );
		$this->assertStringContainsString( 'riff-art=' . $post, Art::url( $post ), 'a cover that must go could not be found to delete' );
		remove_filter( 'upload_dir', $to );
	}

	/**
	 * Draws a cover as ?riff-art does, and keeps it.
	 *
	 * @param string $drawn A post ID, or album-<term ID>.
	 * @return string The cover.
	 */
	private function serve( string $drawn ): string {
		$svg = (string) Art::shared( $drawn );
		$this->assertNotSame( '', $svg, "$drawn is drawn" );
		$keep = new ReflectionMethod( Art::class, 'keep' );
		$keep->setAccessible( true );
		$keep->invoke( null, $drawn, $svg, microtime( true ) );
		return $svg;
	}

	/**
	 * Where a kept cover's address is on disk.
	 *
	 * @param string $url The cover's address in uploads.
	 * @return string
	 */
	private function path( string $url ): string {
		$uploads = wp_upload_dir( null, false );
		return $uploads['basedir'] . substr( $url, strlen( $uploads['baseurl'] ) );
	}

	public function tear_down(): void {
		// Kept covers are files, which the database's rollback leaves behind.
		Art::redraw( true );
		parent::tear_down();
	}

	public function test_a_drawn_cover_tints_its_album_with_its_own_colour(): void {
		list( $post, $id ) = $this->bare_post();
		$track             = Tracks::from_attachment( $id, $post );

		$tint    = Art::tint( $track['art'] );
		$colours = array_merge( ...array_map( static fn( $p ) => array_slice( $p, 0, 2 ), Cover::palettes() ) );

		$this->assertMatchesRegularExpression( '/^#[0-9a-f]{6}$/', $tint );
		$this->assertContains( $tint, $colours, 'the ground or the accent of the palette the cover was drawn in' );
		$this->assertNotContains( $tint, array( '#1e1e1e', '#f6f6f6' ), 'never the neutral ground, which would tint nothing' );
	}

	public function test_an_uploaded_cover_is_read_once_for_its_most_colourful_shade(): void {
		$file  = get_temp_dir() . 'riff-tint-' . wp_generate_password( 6, false ) . '.png';
		$image = imagecreatetruecolor( 64, 64 );
		imagefill( $image, 0, 0, imagecolorallocate( $image, 128, 128, 128 ) );
		imagefilledrectangle( $image, 16, 16, 47, 47, imagecolorallocate( $image, 220, 30, 40 ) );
		imagepng( $image, $file );
		$cover = self::factory()->attachment->create_upload_object( $file );
		wp_delete_file( $file );
		$art = Tracks::art( $cover );

		$tint = Art::tint( $art );
		$rgb  = sscanf( $tint, '#%2x%2x%2x' );

		$this->assertGreaterThan( 150, $rgb[0], 'the red, not the grey around it' );
		$this->assertLessThan( 90, max( $rgb[1], $rgb[2] ) );
		$this->assertSame( $tint, get_post_meta( $cover, Art::TINT, true ), 'kept on the image' );
		update_post_meta( $cover, Art::TINT, '#123456' );
		$this->assertSame( '#123456', Art::tint( $art ), 'and read from there after' );
		$this->assertSame( '', Art::tint( array() ) );
	}
}
