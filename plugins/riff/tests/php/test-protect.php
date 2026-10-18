<?php
/**
 * Protected files.
 *
 * @package Riff
 */

use Riff\Protect;
use Riff\Tracks;

/**
 * @covers \Riff\Protect
 */
class Test_Riff_Protect extends Riff_TestCase {

	/**
	 * A published post.
	 *
	 * @var int
	 */
	private int $post = 0;

	/**
	 * Its track.
	 *
	 * @var int
	 */
	private int $track = 0;

	public function set_up(): void {
		parent::set_up();
		$this->post  = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->track = self::attach( '02 - Underground [underground].mp3', $this->post );
	}

	public function tear_down(): void {
		Protect::unprotect( $this->track );
		parent::tear_down();
	}

	public function test_protecting_moves_the_file_and_gives_it_an_address_that_checks(): void {
		$public = (string) get_attached_file( $this->track );

		$this->assertTrue( Protect::protect( $this->track ) );

		$file = (string) get_attached_file( $this->track );
		$this->assertFileDoesNotExist( $public, 'no longer at its public address' );
		$this->assertFileExists( $file );
		$this->assertStringStartsWith( Protect::dir() . '/', $file );
		$this->assertFileExists( Protect::dir() . '/.htaccess', 'Apache is told to refuse the folder' );
		$this->assertSame( Protect::address( $this->track ), wp_get_attachment_url( $this->track ) );
		$this->assertStringContainsString( '?riff-file=' . $this->track, wp_get_attachment_url( $this->track ) );
	}

	public function test_unprotecting_puts_it_back_where_it_was(): void {
		$public = (string) get_attached_file( $this->track );
		$url    = (string) wp_get_attachment_url( $this->track );
		Protect::protect( $this->track );

		$this->assertTrue( Protect::unprotect( $this->track ) );

		$this->assertSame( $public, get_attached_file( $this->track ) );
		$this->assertFileExists( $public );
		$this->assertSame( $url, wp_get_attachment_url( $this->track ) );
		$this->assertFalse( Protect::is( $this->track ) );
	}

	public function test_posts_that_named_the_file_are_relinked_both_ways(): void {
		$url = (string) wp_get_attachment_url( $this->track );
		wp_update_post(
			array(
				'ID'           => $this->post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio --><!-- wp:playlist-track {"id":%1$d,"src":"%2$s"} /-->', $this->track, $url ),
			)
		);
		$revisions = count( wp_get_post_revisions( $this->post ) );

		Protect::protect( $this->track );
		$content = get_post_field( 'post_content', $this->post );

		$this->assertStringNotContainsString( $url, $content );
		$this->assertSame( 2, substr_count( $content, Protect::address( $this->track ) ), 'the block\'s src and the playlist track\'s' );
		$this->assertCount( $revisions, wp_get_post_revisions( $this->post ), 'an address changing is not an edit' );

		Protect::unprotect( $this->track );
		$this->assertSame( 2, substr_count( get_post_field( 'post_content', $this->post ), $url ) );
	}

	public function test_a_visitor_may_have_the_file_only_when_they_may_play_it(): void {
		Protect::protect( $this->track );
		$this->assertTrue( Protect::can( $this->track ), 'a published post\'s track' );

		add_filter( 'riff_can_play', '__return_false' );
		$this->assertFalse( Protect::can( $this->track ), 'riff_can_play refuses it' );
		remove_filter( 'riff_can_play', '__return_false' );

		wp_update_post(
			array(
				'ID'          => $this->post,
				'post_status' => 'private',
			)
		);
		$this->assertFalse( Protect::can( $this->track ), 'a private post\'s, to a visitor' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->assertTrue( Protect::can( $this->track ), 'and to someone who can read the post' );
	}

	public function test_a_signed_address_works_until_it_expires_and_only_for_its_file(): void {
		Protect::protect( $this->track );
		parse_str( (string) wp_parse_url( Protect::signed( $this->track ), PHP_URL_QUERY ), $query );

		$this->assertTrue( Protect::valid( $this->track, (int) $query['riff-expires'], $query['riff-sig'] ) );
		$this->assertGreaterThanOrEqual( time() + Protect::TTL, (int) $query['riff-expires'] );
		$this->assertFalse( Protect::valid( $this->track + 1, (int) $query['riff-expires'], $query['riff-sig'] ), 'another file' );
		$this->assertFalse( Protect::valid( $this->track, (int) $query['riff-expires'] + 3600, $query['riff-sig'] ), 'a later expiry' );
		$this->assertFalse( Protect::valid( $this->track, time() - 1, $query['riff-sig'] ), 'expired' );
	}

	public function test_a_protected_track_carries_a_signed_address_and_a_locked_one_none(): void {
		Protect::protect( $this->track );

		$track = Tracks::from_attachment( $this->track, $this->post );
		$this->assertStringContainsString( 'riff-sig=', $track['src'], 'AirPlay and Cast fetch without the visitor\'s cookie' );

		add_filter( 'riff_can_play', '__return_false' );
		$this->assertSame( '', Tracks::from_attachment( $this->track, $this->post )['src'] );
		remove_filter( 'riff_can_play', '__return_false' );
	}

	/**
	 * Range headers and what they ask for, from a 1,000-byte file.
	 *
	 * @return array[]
	 */
	public static function ranges(): array {
		return array(
			'no header'            => array( '', null ),
			'from a byte'          => array( 'bytes=100-', array( 100, 999 ) ),
			'a span'               => array( 'bytes=0-499', array( 0, 499 ) ),
			'past the end'         => array( 'bytes=900-5000', array( 900, 999 ) ),
			'the last bytes'       => array( 'bytes=-200', array( 800, 999 ) ),
			'more than the file'   => array( 'bytes=-5000', array( 0, 999 ) ),
			'starting past it'     => array( 'bytes=1000-', false ),
			'backwards'            => array( 'bytes=500-100', false ),
			'several, so all'      => array( 'bytes=0-1,5-6', null ),
			'another unit, so all' => array( 'items=0-1', null ),
		);
	}

	/**
	 * @dataProvider ranges
	 *
	 * @param string           $header Range header.
	 * @param array|null|false $want   Expected.
	 */
	public function test_a_range_is_read_as_the_rfc_has_it( string $header, $want ): void {
		$this->assertSame( $want, Protect::range( $header, 1000 ) );
	}

	public function test_the_media_library_box_protects_and_unprotects(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$fields = Protect::field( array(), get_post( $this->track ) );
		$this->assertStringContainsString( 'name="attachments[' . $this->track . '][riff_protected]"', $fields['riff_protected']['html'] );

		Protect::save( array( 'ID' => $this->track ), array( 'riff_protected' => '1' ) );
		$this->assertTrue( Protect::is( $this->track ) );
		$this->assertStringContainsString( 'checked', Protect::field( array(), get_post( $this->track ) )['riff_protected']['html'] );

		Protect::save( array( 'ID' => $this->track ), array( 'riff_protected' => '0' ) );
		$this->assertFalse( Protect::is( $this->track ) );
		$this->assertArrayNotHasKey( 'riff_protected', Protect::field( array(), get_post( self::attach( 'cover.png' ) ) ), 'not on an image' );
	}
}
