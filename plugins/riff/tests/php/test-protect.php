<?php
/**
 * Protected files.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Protect;
use Riff\Protected_Files;
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
		Protected_Files::unprotect( $this->track );
		parent::tear_down();
	}

	public function test_protecting_moves_the_file_and_gives_it_an_address_that_checks(): void {
		$public = (string) get_attached_file( $this->track );
		$under  = (string) get_post_meta( $this->track, '_wp_attached_file', true );

		$this->assertTrue( Protected_Files::protect( $this->track ) );

		$file = (string) get_attached_file( $this->track );
		$this->assertFileDoesNotExist( $public, 'no longer at its public address' );
		$this->assertFileExists( $file );
		$this->assertSame( Protected_Files::dir() . '/' . $under, $file, 'in the same folders under the protected one as under uploads' );
		$this->assertSame( $under, get_post_meta( $this->track, Protected_Files::META, true ), 'its place under uploads, to go back to' );
		$this->assertFileExists( Protected_Files::dir() . '/.htaccess', 'Apache is told to refuse the folder' );
		$this->assertSame( Protect::address( $this->track ), wp_get_attachment_url( $this->track ) );
		$this->assertStringContainsString( '?riff-file=' . $this->track, wp_get_attachment_url( $this->track ) );
	}

	public function test_unprotecting_puts_it_back_where_it_was(): void {
		$public = (string) get_attached_file( $this->track );
		$url    = (string) wp_get_attachment_url( $this->track );
		Protected_Files::protect( $this->track );

		$this->assertTrue( Protected_Files::unprotect( $this->track ) );

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

		Protected_Files::protect( $this->track );
		$content = get_post_field( 'post_content', $this->post );

		$this->assertStringNotContainsString( $url, $content );
		$this->assertSame( 2, substr_count( $content, Protect::address( $this->track ) ), 'the block\'s src and the playlist track\'s' );
		$this->assertCount( $revisions, wp_get_post_revisions( $this->post ), 'an address changing is not an edit' );

		Protected_Files::unprotect( $this->track );
		$this->assertSame( 2, substr_count( get_post_field( 'post_content', $this->post ), $url ) );
	}

	public function test_a_visitor_may_have_the_file_only_when_they_may_play_it(): void {
		Protected_Files::protect( $this->track );
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
		Protected_Files::protect( $this->track );
		parse_str( (string) wp_parse_url( Protect::signed( $this->track ), PHP_URL_QUERY ), $query );

		$this->assertTrue( Protect::valid( $this->track, (int) $query['riff-expires'], $query['riff-sig'] ) );
		$this->assertGreaterThanOrEqual( time() + Protect::TTL, (int) $query['riff-expires'] );
		$this->assertFalse( Protect::valid( $this->track + 1, (int) $query['riff-expires'], $query['riff-sig'] ), 'another file' );
		$this->assertFalse( Protect::valid( $this->track, (int) $query['riff-expires'] + 3600, $query['riff-sig'] ), 'a later expiry' );
		$this->assertFalse( Protect::valid( $this->track, time() - 1, $query['riff-sig'] ), 'expired' );
	}

	public function test_a_protected_track_carries_a_signed_address_and_a_locked_one_none(): void {
		Protected_Files::protect( $this->track );

		$track = Tracks::from_attachment( $this->track, $this->post );
		$this->assertStringContainsString( 'riff-sig=', $track['src'], 'AirPlay and Cast fetch without the visitor\'s cookie' );

		add_filter( 'riff_can_play', '__return_false' );
		$this->assertSame( '', Tracks::from_attachment( $this->track, $this->post )['src'] );
		remove_filter( 'riff_can_play', '__return_false' );
	}

	public function test_a_password_protected_posts_file_waits_for_the_password_even_for_a_signed_in_reader(): void {
		Protected_Files::protect( $this->track );
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
		Protected_Files::protect( $this->track );
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

	public function test_a_cdn_that_signs_an_address_serves_the_file_instead_of_wordpress(): void {
		$this->assertSame( '', Protect::elsewhere( $this->track ), 'from WordPress, without a plugin that signs' );

		$asked = array();
		$sign  = static function ( $url, $id, $expires ) use ( &$asked ) {
			$asked = array( $id, $expires );
			return 'https://cdn.example/file.mp3?Expires=' . $expires . '&Signature=a~b';
		};
		add_filter( 'riff_protected_url', $sign, 10, 3 );
		$url = Protect::elsewhere( $this->track );
		remove_filter( 'riff_protected_url', $sign );

		$this->assertSame( 'https://cdn.example/file.mp3?Expires=' . $asked[1] . '&Signature=a~b', $url );
		$this->assertSame( $this->track, $asked[0] );
		$this->assertEqualsWithDelta( time() + HOUR_IN_SECONDS, $asked[1], 5, 'for an hour' );

		foreach ( array( 'javascript:alert(1)', '//cdn.example/file.mp3', 'file:///etc/passwd' ) as $bad ) {
			$give = static fn() => $bad;
			add_filter( 'riff_protected_url', $give );
			$this->assertSame( '', Protect::elsewhere( $this->track ), "not $bad" );
			remove_filter( 'riff_protected_url', $give );
		}
	}

	public function test_a_file_kept_off_this_server_is_protected_only_by_the_plugin_that_keeps_it(): void {
		// As WP Offload Media leaves a file once it is copied to the bucket: gone from here.
		wp_delete_file( (string) get_attached_file( $this->track ) );
		$this->assertStringContainsString( 'kept off this server', Protect::field( array(), get_post( $this->track ) )['riff_protected']['helps'], 'the Media Library says so' );

		$done = Protected_Files::protect( $this->track );
		$this->assertWPError( $done, 'not protected: nothing could make the copy elsewhere private' );
		$this->assertSame( 'riff_protect_storage', $done->get_error_code() );
		$this->assertFalse( Protect::is( $this->track ) );

		$asked   = array();
		$storage = static function ( $done, $id, $protect ) use ( &$asked ) {
			$asked[] = array( $id, $protect );
			return true;
		};
		add_filter( 'riff_protect_storage', $storage, 10, 3 );
		$from = (string) wp_get_attachment_url( $this->track );
		wp_update_post(
			array(
				'ID'           => $this->post,
				'post_content' => '<audio src="' . $from . '"></audio>',
			)
		);

		$this->assertTrue( Protected_Files::protect( $this->track ) );
		$this->assertTrue( Protect::is( $this->track ) );
		$this->assertStringContainsString( Protect::address( $this->track ), (string) get_post_field( 'post_content', $this->post ), 'posts are relinked' );
		$this->assertTrue( Protected_Files::unprotect( $this->track ) );
		$this->assertFalse( Protect::is( $this->track ) );
		remove_filter( 'riff_protect_storage', $storage );

		$this->assertSame( array( array( $this->track, true ), array( $this->track, false ) ), $asked );
	}

	public function test_a_file_on_this_server_is_put_back_when_its_storage_elsewhere_refuses(): void {
		$public = (string) get_attached_file( $this->track );
		$refuse = static fn() => new WP_Error( 'cdn_down', 'The bucket could not be reached.' );
		add_filter( 'riff_protect_storage', $refuse );
		$done   = Protected_Files::protect( $this->track );
		remove_filter( 'riff_protect_storage', $refuse );

		$this->assertWPError( $done );
		$this->assertSame( 'The bucket could not be reached.', $done->get_error_message(), 'the plugin\'s reason, for the Media Library' );
		$this->assertFalse( Protect::is( $this->track ) );
		$this->assertFileExists( $public, 'back where it was, never half protected' );
		$this->assertSame( $public, (string) get_attached_file( $this->track ) );

		$this->assertTrue( Protected_Files::protect( $this->track ) );
		add_filter( 'riff_protect_storage', $refuse );
		$this->assertWPError( Protected_Files::unprotect( $this->track ) );
		remove_filter( 'riff_protect_storage', $refuse );
		$this->assertTrue( Protect::is( $this->track ), 'nor half public' );
		$this->assertFileExists( (string) get_attached_file( $this->track ) );
	}

	public function test_a_copy_the_player_has_is_current_as_the_rfc_has_it(): void {
		$etag = '"abc"';
		$time = strtotime( '2026-10-01 12:00:00 UTC' );
		$at   = gmdate( 'D, d M Y H:i:s', $time ) . ' GMT';

		$this->assertTrue( Protect::current( '"abc"', '', $etag, $time ) );
		$this->assertTrue( Protect::current( '"x", W/"abc"', '', $etag, $time ), 'weakly, in a list' );
		$this->assertTrue( Protect::current( '*', '', $etag, $time ) );
		$this->assertFalse( Protect::current( '"x"', $at, $etag, $time ), 'If-None-Match decides alone when it is sent' );
		$this->assertTrue( Protect::current( '', $at, $etag, $time ), 'not changed since' );
		$this->assertFalse( Protect::current( '', gmdate( 'D, d M Y H:i:s', $time - 60 ) . ' GMT', $etag, $time ), 'changed since' );
		$this->assertFalse( Protect::current( '', 'not a date', $etag, $time ) );
		$this->assertFalse( Protect::current( '', '', $etag, $time ) );
	}

	public function test_a_range_is_met_only_of_the_file_the_player_had(): void {
		$etag = '"abc"';
		$time = strtotime( '2026-10-01 12:00:00 UTC' );

		$this->assertTrue( Protect::ranged( '', $etag, $time ) );
		$this->assertTrue( Protect::ranged( '"abc"', $etag, $time ) );
		$this->assertFalse( Protect::ranged( 'W/"abc"', $etag, $time ), 'never by a weak tag' );
		$this->assertFalse( Protect::ranged( '"old"', $etag, $time ) );
		$this->assertTrue( Protect::ranged( gmdate( 'D, d M Y H:i:s', $time ) . ' GMT', $etag, $time ) );
		$this->assertFalse( Protect::ranged( gmdate( 'D, d M Y H:i:s', $time + 60 ) . ' GMT', $etag, $time ), 'only exactly when it changed' );
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

	public function test_the_media_library_says_when_the_protected_folder_is_open_without_asking_the_server_itself(): void {
		Protected_Files::protect( $this->track );
		$box = static fn( int $id ) => Protect::field( array(), get_post( $id ) )['riff_protected']['html'];

		delete_transient( Protect::OPEN );
		wp_clear_scheduled_hook( Protect::PROBE );
		$asked = false;
		$spy   = static function ( $pre ) use ( &$asked ) {
			$asked = true;
			return $pre;
		};
		add_filter( 'pre_http_request', $spy );
		$this->assertStringNotContainsString( 'role="alert"', $box( $this->track ), 'not known yet' );
		remove_filter( 'pre_http_request', $spy );
		$this->assertFalse( $asked, 'the box never waits on a request' );
		$this->assertNotFalse( wp_next_scheduled( Protect::PROBE ), 'cron asks instead' );

		set_transient( Protect::OPEN, '1' );
		$this->assertStringContainsString( 'Site Health shows the rule', $box( $this->track ) );
		$this->assertStringNotContainsString( 'role="alert"', $box( self::attach( '03 - Trombone Detritus [detritus].mp3', $this->post ) ), 'only on a protected file' );

		set_transient( Protect::OPEN, '0' );
		$this->assertStringNotContainsString( 'role="alert"', $box( $this->track ), 'not once the folder is closed' );
	}

	public function test_an_address_is_relinked_only_where_it_is_the_whole_address(): void {
		$from = Protect::address( 5 );
		$text = sprintf( '<audio src="%1$s"></audio><audio src="%2$s"></audio><a href="%1$s&amp;x=1">', $from, Protect::address( 55 ) );

		$this->assertSame(
			sprintf( '<audio src="%1$s"></audio><audio src="%2$s"></audio><a href="%1$s&amp;x=1">', 'https://cdn.example/$1.mp3', Protect::address( 55 ) ),
			Protected_Files::replace( $from, 'https://cdn.example/$1.mp3', $text ),
			'file 55\'s address is left alone, and the new address is taken literally'
		);
	}

	public function test_many_files_are_relinked_in_one_pass_each_where_it_is_the_whole_address(): void {
		$a = Protect::address( 7 );
		$b = Protect::address( 8 );
		wp_update_post(
			array(
				'ID'           => $this->post,
				'post_content' => sprintf( '<audio src="%1$s"></audio><audio src="%2$s"></audio><audio src="%1$s0"></audio>', $a, $b ),
			)
		);

		// File 7's new address is file 8's old one: never replaced a second time.
		$this->assertSame(
			1,
			Protected_Files::relink_all(
				array(
					$a => $b,
					$b => 'https://cdn.example/8.mp3',
					'' => 'x',
				)
			)
		);

		$this->assertSame(
			sprintf( '<audio src="%1$s"></audio><audio src="%2$s"></audio><audio src="%3$s0"></audio>', $b, 'https://cdn.example/8.mp3', $a ),
			get_post_field( 'post_content', $this->post )
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

		Protected_Files::protect( $this->track );
		Protected_Files::unprotect( $this->track );

		$this->assertStringContainsString( 'src="' . $longer . '"', (string) get_post_field( 'post_content', $this->post ) );
	}

	public function test_uninstalling_relinks_only_the_whole_address(): void {
		Protected_Files::protect( $this->track );
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
		Protected_Files::dir();
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
		$this->assertSame( '0', get_transient( Protect::OPEN ), 'closed, and kept for the Media Library' );

		$served = static fn() => array(
			'headers'  => array(),
			'body'     => 'riff',
			'response' => array( 'code' => 200 ),
			'cookies'  => array(),
		);
		add_filter( 'pre_http_request', $served );
		$result = Protect::health();
		remove_filter( 'pre_http_request', $served );

		$this->assertSame( 'recommended', $result['status'] );
		$this->assertStringContainsString( '/' . get_option( Protected_Files::DIR ) . '/ { internal; }', $result['description'], 'with the rule for the folder' );
		$this->assertSame( '1', get_transient( Protect::OPEN ) );
	}
}
