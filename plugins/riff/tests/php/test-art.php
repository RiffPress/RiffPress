<?php
/**
 * Default artwork: drawn for a post with no image, served by WordPress, never over a site's own.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Listen\Art;
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
		$this->assertSame( 'Cover of ' . get_the_title( $post ), $track['art'][0]['alt'], 'a post\'s cover names the post' );
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

	public function test_every_colour_is_riffs_amber_or_a_wordpress_org_token(): void {
		$tokens = array( '#1e1e1e', '#ffb020', '#f6f6f6', '#ffffff', '#e26f56', '#33f078', '#fff972', '#d7a7ff', '#7a00df', '#40464d', '#d98a00' );
		foreach ( Art::palettes() as $palette ) {
			foreach ( $palette as $colour ) {
				$this->assertContains( strtolower( $colour ), $tokens, "$colour is a design system token" );
			}
		}
		$this->assertSame( array( 'corner', 'centre', 'horizon' ), Art::layouts() );
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
		$this->assertSame( count( Art::palettes() ) * count( Art::layouts() ), substr_count( $html, '<figure>' ), 'one cell per palette and layout' );
		$this->assertStringContainsString( 'data:image/svg+xml;base64,', $html );
	}

	public function test_the_route_is_a_public_query_variable(): void {
		$this->assertContains( 'riff-art', apply_filters( 'query_vars', array() ) );
		[ $post ] = $this->bare_post();
		$this->assertSame( add_query_arg( 'riff-art', $post, home_url( '/' ) ), Art::url( $post ) );
	}

	public function test_a_drawn_cover_tints_its_album_with_its_own_colour(): void {
		list( $post, $id ) = $this->bare_post();
		$track             = Tracks::from_attachment( $id, $post );

		$tint    = Art::tint( $track['art'] );
		$colours = array_merge( ...array_map( static fn( $p ) => array_slice( $p, 0, 2 ), Art::palettes() ) );

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
