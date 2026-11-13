<?php
/**
 * Private mode.
 *
 * @package Riff
 */

use Riff\Private_Site;
use Riff\Protect;
use Riff\Protected_Files;

/**
 * @covers \Riff\Private_Site
 */
class Test_Riff_Private_Site extends Riff_TestCase {

	/**
	 * Files a test made, to put back.
	 *
	 * @var int[]
	 */
	private array $files = array();

	public function tear_down(): void {
		foreach ( $this->files as $id ) {
			Protected_Files::unprotect( $id );
		}
		wp_clear_scheduled_hook( Private_Site::JOB );
		parent::tear_down();
	}

	private function song(): int {
		$id            = self::attach( '02 - Underground [underground].mp3' );
		$this->files[] = $id;
		return $id;
	}

	public function test_a_site_is_open_until_it_is_set_private(): void {
		$this->assertFalse( Private_Site::on() );
		$this->assertTrue( Private_Site::allowed() );
		$this->assertSame( '1', (string) get_option( 'blog_public', '1' ) );
	}

	public function test_a_private_site_turns_away_a_visitor_and_search_engines(): void {
		update_option( Private_Site::OPTION, true );
		$this->assertFalse( Private_Site::allowed() );
		$this->assertSame( '0', get_option( 'blog_public' ) );
		$this->assertFalse( apply_filters( 'xmlrpc_enabled', true ) );
		$error = apply_filters( 'rest_authentication_errors', null );
		$this->assertWPError( $error );
		$this->assertSame( 401, $error->get_error_data()['status'] );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertTrue( Private_Site::allowed(), 'someone with an account on the site' );
		$this->assertNull( apply_filters( 'rest_authentication_errors', null ) );
	}

	public function test_a_private_site_lets_through_only_what_a_plugin_says_it_answers_itself(): void {
		update_option( Private_Site::OPTION, true );
		$wp = new WP();
		try {
			Private_Site::gate( $wp );
			$this->fail( 'a visitor is turned away' );
		} catch ( WPDieException $e ) {
			$this->assertStringContainsString( 'This site is private.', $e->getMessage() );
		}

		add_filter( 'riff_private_open', '__return_true' );
		Private_Site::gate( $wp );
		$this->assertTrue( true, 'and let through when a plugin answers the request itself' );
	}

	public function test_a_file_arriving_on_a_private_site_is_protected_and_marked_as_this_modes(): void {
		update_option( Private_Site::OPTION, true );
		$id = $this->song();
		apply_filters( 'wp_generate_attachment_metadata', array(), $id );
		$this->assertTrue( Protect::is( $id ) );
		$this->assertSame( 'protected', get_post_meta( $id, Private_Site::META, true ) );
	}

	public function test_a_file_arriving_on_an_open_site_stays_as_it_is(): void {
		$id = $this->song();
		apply_filters( 'wp_generate_attachment_metadata', array(), $id );
		$this->assertFalse( Protect::is( $id ) );
	}

	public function test_an_image_on_a_private_site_keeps_its_address(): void {
		update_option( Private_Site::OPTION, true );
		$id = self::factory()->attachment->create( array( 'post_mime_type' => 'image/png' ) );
		apply_filters( 'wp_generate_attachment_metadata', array(), $id );
		$this->assertFalse( Protect::is( $id ) );
	}

	public function test_changing_the_setting_moves_the_files_and_leaves_ones_protected_by_hand(): void {
		$made = $this->song();
		$hand = self::attach( '03 - Trombone Detritus [detritus].mp3' );
		Protected_Files::protect( $hand );
		$this->files[] = $hand;

		update_option( Private_Site::OPTION, true );
		$this->assertNotFalse( wp_next_scheduled( Private_Site::JOB ), 'in the background' );
		Private_Site::sweep();
		$this->assertTrue( Protect::is( $made ) );
		$this->assertSame( '', get_post_meta( $hand, Private_Site::META, true ), 'already protected, so not this mode\'s' );

		update_option( Private_Site::OPTION, false );
		Private_Site::sweep();
		$this->assertFalse( Protect::is( $made ), 'back where it was' );
		$this->assertSame( '', get_post_meta( $made, Private_Site::META, true ) );
		$this->assertTrue( Protect::is( $hand ), 'protected by hand, and still' );
	}

	public function test_a_visitor_gets_no_file_and_going_private_ends_every_signed_address(): void {
		$post          = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id            = self::attach( '02 - Underground [underground].mp3', $post );
		$this->files[] = $id;
		Protected_Files::protect( $id );
		$this->assertTrue( Protect::can( $id ), 'on an open site, a published post\'s track' );
		parse_str( (string) wp_parse_url( Protect::signed( $id ), PHP_URL_QUERY ), $open );

		update_option( Private_Site::OPTION, true );
		$this->assertFalse( Protect::can( $id ), 'private, a visitor is refused' );
		$this->assertFalse( Protect::valid( $id, (int) $open['riff-expires'], $open['riff-sig'] ), 'an address from before stops working' );
		parse_str( (string) wp_parse_url( Protect::signed( $id ), PHP_URL_QUERY ), $now );
		$this->assertTrue( Protect::valid( $id, (int) $now['riff-expires'], $now['riff-sig'] ), 'and one made for a member works' );
	}

	public function test_comments_close_and_no_cover_is_kept_as_a_public_file(): void {
		$post = self::factory()->post->create( array( 'comment_status' => 'open' ) );
		$this->assertTrue( comments_open( $post ) );
		update_option( Private_Site::OPTION, true );
		$this->assertFalse( comments_open( $post ) );
		$file = new ReflectionMethod( \Riff\Listen\Art::class, 'file' );
		$this->assertNull( $file->invoke( null, (string) $post ) );
	}

	public function test_what_could_not_be_moved_shows_in_site_health_and_is_tried_again(): void {
		update_option( Private_Site::OPTION, true );
		$this->assertSame( 'good', Private_Site::health()['status'] );
		$stuck         = self::attach( '02 - Underground [underground].mp3' );
		$this->files[] = $stuck;
		Protected_Files::unprotect( $stuck );
		delete_post_meta( $stuck, Private_Site::META );
		$this->assertSame( 'critical', Private_Site::health()['status'], 'a file that arrived unseen' );
		update_post_meta( $stuck, Private_Site::META, 'failed' );
		Private_Site::sweep();
		$this->assertFalse( Protect::is( $stuck ), 'marked as failed, the batch passes over it' );
		$this->assertSame( '', get_post_meta( $stuck, Private_Site::META, true ), 'and with none left, the mark goes' );
		Private_Site::sweep();
		$this->assertTrue( Protect::is( $stuck ), 'so the next run tries it again' );
		$this->assertSame( 'good', Private_Site::health()['status'] );
	}

	public function test_a_private_site_keeps_its_job_coming_back(): void {
		update_option( Private_Site::OPTION, true );
		wp_clear_scheduled_hook( Private_Site::JOB );
		Private_Site::keep_watch();
		$this->assertNotFalse( wp_next_scheduled( Private_Site::JOB ) );
	}

	public function test_opening_the_site_leaves_a_version_of_a_song_protected_by_hand(): void {
		$song = $this->song();
		Protected_Files::protect( $song );
		update_option( Private_Site::OPTION, true );
		$version       = self::attach( '03 - Trombone Detritus [detritus].mp3' );
		$this->files[] = $version;
		update_post_meta( $song, \Riff\Media::STREAM_META, $version );
		Private_Site::sweep();
		$this->assertSame( 'protected', get_post_meta( $version, Private_Site::META, true ) );

		update_option( Private_Site::OPTION, false );
		Private_Site::sweep();
		$this->assertTrue( Protect::is( $version ) );
		$this->assertSame( '', get_post_meta( $version, Private_Site::META, true ) );
	}

	/**
	 * @group multisite
	 */
	public function test_on_a_network_belonging_to_the_site_is_what_counts(): void {
		if ( ! is_multisite() ) {
			$this->markTestSkipped( 'A network only.' );
		}
		$user = self::factory()->user->create();
		$site = self::factory()->blog->create();
		switch_to_blog( $site );
		update_option( Private_Site::OPTION, true );
		wp_set_current_user( $user );
		$this->assertFalse( Private_Site::allowed(), 'an account elsewhere on the network' );
		add_user_to_blog( $site, $user, 'subscriber' );
		// Set anew, as a user's roles on a site are read once.
		wp_set_current_user( 0 );
		wp_set_current_user( $user );
		$this->assertTrue( Private_Site::allowed() );
		restore_current_blog();
	}

	public function test_on_a_network_a_signature_is_good_only_on_its_own_site(): void {
		if ( ! is_multisite() ) {
			$this->markTestSkipped( 'A network only.' );
		}
		$id = $this->song();
		Protected_Files::protect( $id );
		parse_str( (string) wp_parse_url( Protect::signed( $id ), PHP_URL_QUERY ), $here );
		switch_to_blog( self::factory()->blog->create() );
		$this->assertFalse( Protect::valid( $id, (int) $here['riff-expires'], $here['riff-sig'] ) );
		restore_current_blog();
	}
}
