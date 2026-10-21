<?php
/**
 * Protected files.
 *
 * @package Riff
 */

use Riff\Catalog;
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
		$under  = (string) get_post_meta( $this->track, '_wp_attached_file', true );

		$this->assertTrue( Protect::protect( $this->track ) );

		$file = (string) get_attached_file( $this->track );
		$this->assertFileDoesNotExist( $public, 'no longer at its public address' );
		$this->assertFileExists( $file );
		$this->assertSame( Protect::dir() . '/' . $under, $file, 'in the same folders under the protected one as under uploads' );
		$this->assertSame( $under, get_post_meta( $this->track, Protect::META, true ), 'its place under uploads, to go back to' );
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

	public function test_a_password_protected_posts_file_waits_for_the_password_even_for_a_signed_in_reader(): void {
		Protect::protect( $this->track );
		wp_update_post(
			array(
				'ID'            => $this->post,
				'post_password' => 'secret',
			)
		);

		$this->assertFalse( Protect::can( $this->track ), 'a visitor' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertFalse( Protect::can( $this->track ), 'a subscriber, who may read the post but has not given its password' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$this->assertTrue( Protect::can( $this->track ), 'someone who may edit the post' );
	}

	public function test_a_track_is_signed_only_for_a_visitor_who_may_read_its_post(): void {
		Protect::protect( $this->track );
		wp_update_post(
			array(
				'ID'            => $this->post,
				'post_password' => 'secret',
			)
		);

		// WordPress lists a password-protected post's files in wp/v2/media to anyone.
		$GLOBALS['wp_rest_server'] = null;
		$response                  = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . $this->track ) );
		$this->assertSame( 200, $response->get_status() );
		$this->assertStringNotContainsString( 'riff-sig=', (string) $response->get_data()['riff_track']['src'], 'no address that skips the password' );

		wp_update_post(
			array(
				'ID'            => $this->post,
				'post_password' => '',
				'post_status'   => 'private',
			)
		);
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$this->assertStringNotContainsString( 'riff-sig=', (string) Tracks::from_attachment( $this->track, $this->post )['src'], 'nor for someone else\'s private post' );
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

	public function test_an_address_is_relinked_only_where_it_is_the_whole_address(): void {
		$from = Protect::address( 5 );
		$text = sprintf( '<audio src="%1$s"></audio><audio src="%2$s"></audio><a href="%1$s&amp;x=1">', $from, Protect::address( 55 ) );

		$this->assertSame(
			sprintf( '<audio src="%1$s"></audio><audio src="%2$s"></audio><a href="%1$s&amp;x=1">', 'https://cdn.example/$1.mp3', Protect::address( 55 ) ),
			Protect::replace( $from, 'https://cdn.example/$1.mp3', $text ),
			'file 55\'s address is left alone, and the new address is taken literally'
		);
	}

	public function test_relinking_one_file_leaves_a_file_whose_id_starts_the_same_alone(): void {
		$longer = Protect::address( $this->track ) . '7';
		wp_update_post(
			array(
				'ID'           => $this->post,
				'post_content' => '<!-- wp:audio --><figure class="wp-block-audio"><audio controls src="' . $longer . '"></audio></figure><!-- /wp:audio -->',
			)
		);

		Protect::protect( $this->track );
		Protect::unprotect( $this->track );

		$this->assertStringContainsString( 'src="' . $longer . '"', (string) get_post_field( 'post_content', $this->post ) );
	}

	public function test_uninstalling_relinks_only_the_whole_address(): void {
		Protect::protect( $this->track );
		$longer = Protect::address( $this->track ) . '7';
		wp_update_post(
			array(
				'ID'           => $this->post,
				'post_content' => sprintf( '<audio src="%s"></audio><audio src="%s"></audio>', Protect::address( $this->track ), $longer ),
			)
		);

		if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
			define( 'WP_UNINSTALL_PLUGIN', 'riff/riff.php' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- core's own constant.
		}
		// Uninstalling runs with the plugin not loaded, so without its filter on file addresses.
		remove_filter( 'wp_get_attachment_url', array( Protect::class, 'url' ), 99 );
		include dirname( __DIR__, 2 ) . '/uninstall.php';
		add_filter( 'wp_get_attachment_url', array( Protect::class, 'url' ), 99, 2 );
		Catalog::taxonomies();

		$content = (string) get_post_field( 'post_content', $this->post );
		$this->assertFalse( Protect::is( $this->track ), 'the file is back where it was' );
		$this->assertStringContainsString( 'src="' . wp_get_attachment_url( $this->track ) . '"', $content );
		$this->assertStringContainsString( 'src="' . $longer . '"', $content, 'another file\'s address is left alone' );
	}

	public function test_a_file_that_is_no_longer_protected_sends_on_only_a_visitor_who_may_have_it(): void {
		$this->assertSame( (string) wp_get_attachment_url( $this->track ), Protect::moved( $this->track ), 'a published post\'s file' );

		wp_update_post(
			array(
				'ID'          => $this->post,
				'post_status' => 'draft',
			)
		);
		$this->assertSame( '', Protect::moved( $this->track ), 'not a draft\'s, to a visitor' );
		$this->assertSame( '', Protect::moved( self::attach( 'cover.png' ) ), 'nor an image' );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->assertSame( (string) wp_get_attachment_url( $this->track ), Protect::moved( $this->track ), 'someone who can read the post is sent on' );
	}

	public function test_the_site_health_check_asks_its_loopback_like_core_does(): void {
		Protect::dir();
		$seen = null;
		$hook = static function ( $pre, $args ) use ( &$seen ) {
			$seen = $args['sslverify'];
			return array(
				'headers'  => array(),
				'body'     => '',
				'response' => array( 'code' => 403 ),
				'cookies'  => array(),
			);
		};
		add_filter( 'pre_http_request', $hook, 10, 2 );
		add_filter( 'https_local_ssl_verify', '__return_true' );
		Protect::health();
		remove_filter( 'https_local_ssl_verify', '__return_true' );
		remove_filter( 'pre_http_request', $hook, 10 );

		$this->assertTrue( $seen, 'https_local_ssl_verify decides, as for core\'s own loopback requests' );
	}
}
