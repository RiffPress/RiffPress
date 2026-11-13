<?php
/**
 * Rights and controls.
 *
 * @package Riff
 */

use Riff\Likes;
use Riff\Library;
use Riff\Protect;
use Riff\Protected_Files;
use Riff\Rights;
use Riff\Tracks;

/**
 * @covers \Riff\Rights
 */
class Test_Riff_Rights extends Riff_TestCase {

	/**
	 * The album's post.
	 *
	 * @var int
	 */
	private int $album = 0;

	/**
	 * Its track.
	 *
	 * @var int
	 */
	private int $track = 0;

	/**
	 * What riff_may_play was asked, in order.
	 *
	 * @var array[]
	 */
	private array $asked = array();

	public function set_up(): void {
		parent::set_up();
		$author      = self::factory()->user->create(
			array(
				'role'         => 'author',
				'display_name' => 'Ma Rainey',
			)
		);
		$this->track = self::attach( '02 - Underground [underground].mp3' );
		wp_update_post(
			array(
				'ID'          => $this->track,
				'post_author' => $author,
			)
		);
		$this->album = (int) Library::create( 'Underground', array( $this->track ), 'publish' );
		wp_update_post(
			array(
				'ID'          => $this->album,
				'post_author' => $author,
			)
		);
		$this->asked = array();
	}

	public function tear_down(): void {
		Protected_Files::unprotect( $this->track );
		unset( $_GET[ Rights::PASS ], $_SERVER['HTTP_X_RIFF_PASS'] );
		parent::tear_down();
	}

	/**
	 * Records each riff_may_play call and refuses, or allows, as asked.
	 *
	 * @param bool $refuse Whether to refuse.
	 * @return callable
	 */
	private function gate( bool $refuse = true ): callable {
		$gate = function ( $allowed, $track_id, $user_id, $context ) use ( $refuse ) {
			$this->asked[] = array( $track_id, $user_id, $context );
			return $refuse ? new WP_Error( 'riff_pass', 'Pass required' ) : $allowed;
		};
		add_filter( 'riff_may_play', $gate, 10, 4 );
		return $gate;
	}

	public function test_the_meta_is_registered_on_posts_and_tracks_for_rest_and_written_by_editors(): void {
		$post       = get_registered_meta_keys( 'post', 'post' );
		$attachment = get_registered_meta_keys( 'post', 'attachment' );
		foreach ( array( Rights::HOLDER, Rights::YEAR, Rights::LICENSE, Rights::ATTESTED, Rights::DOWNLOADS, Rights::UNTIL ) as $key ) {
			$this->assertArrayHasKey( $key, $post, $key );
			$this->assertArrayHasKey( $key, $attachment, $key );
			$this->assertNotEmpty( $post[ $key ]['show_in_rest'], $key );
		}
		$this->assertArrayHasKey( Rights::ISRC, $attachment );
		$this->assertArrayHasKey( Rights::UPC, $post );
		$this->assertArrayNotHasKey( Rights::ISRC, $post, 'an ISRC is a recording\'s' );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertFalse( current_user_can( 'edit_post_meta', $this->album, Rights::LICENSE ) );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$this->assertTrue( current_user_can( 'edit_post_meta', $this->album, Rights::LICENSE ) );
	}

	/**
	 * @dataProvider isrcs
	 *
	 * @param string $given Given.
	 * @param string $kept  Kept.
	 */
	public function test_an_isrc_is_kept_without_hyphens_or_not_at_all( string $given, string $kept ): void {
		$this->assertSame( $kept, Rights::sanitize_isrc( $given ) );
	}

	public static function isrcs(): array {
		return array(
			'hyphenated'      => array( 'US-S1Z-99-00001', 'USS1Z9900001' ),
			'plain'           => array( 'gbaye0601498', 'GBAYE0601498' ),
			'too short'       => array( 'US-S1Z-99-0001', '' ),
			'letters in year' => array( 'US-S1Z-9A-00001', '' ),
			'empty'           => array( '', '' ),
		);
	}

	public function test_a_licence_is_one_riff_knows_with_its_deed(): void {
		$this->assertSame( 'cc-by-nc-sa', Rights::sanitize_license( 'cc-by-nc-sa' ) );
		$this->assertSame( Rights::DEFAULT_LICENSE, Rights::sanitize_license( 'gpl' ) );
		$this->assertSame( 'https://creativecommons.org/licenses/by-sa/4.0/', Rights::licenses()['cc-by-sa']['url'] );
		$this->assertSame( 'https://creativecommons.org/publicdomain/zero/1.0/', Rights::licenses()['cc0']['url'] );
		$this->assertSame( 'CC BY-NC-ND 4.0', Rights::licenses()['cc-by-nc-nd']['label'] );
		$this->assertSame( '', Rights::licenses()['all-rights-reserved']['url'] );
		$this->assertSame( '', Rights::sanitize_upc( '12345' ) );
		$this->assertSame( '012345678905', Rights::sanitize_upc( '0 12345 67890 5' ) );
	}

	public function test_a_track_has_its_albums_rights_unless_it_says_otherwise(): void {
		$rights = riff_rights( $this->track );
		$this->assertSame( 'Ma Rainey', $rights['holder'], 'the owner by default' );
		$this->assertSame( Rights::DEFAULT_LICENSE, $rights['license'] );
		$this->assertNull( $rights['year'] );
		$this->assertFalse( $rights['explicit'], 'nothing set' );

		update_post_meta( $this->album, Rights::HOLDER, 'Example Records' );
		update_post_meta( $this->album, Rights::YEAR, 1924 );
		update_post_meta( $this->album, Rights::LICENSE, 'cc-by' );
		update_post_meta( $this->album, Rights::UPC, '012345678905' );
		update_post_meta( $this->track, Rights::ISRC, 'US-S1Z-99-00001' );

		$rights = riff_rights( $this->track );
		$this->assertSame( 'Example Records', $rights['holder'] );
		$this->assertSame( 1924, $rights['year'] );
		$this->assertSame( 'cc-by', $rights['license'] );
		$this->assertSame( 'https://creativecommons.org/licenses/by/4.0/', $rights['license_url'] );
		$this->assertSame( 'USS1Z9900001', $rights['isrc'] );
		$this->assertSame( '012345678905', $rights['upc'] );
		$this->assertTrue( $rights['explicit'] );

		update_post_meta( $this->track, Rights::LICENSE, 'cc0' );
		$this->assertSame( 'cc0', riff_rights( $this->track )['license'], 'its own' );
		$this->assertSame( 'cc-by', riff_rights( $this->album )['license'], 'the album keeps its own' );

		$filter = static fn( $rights ) => array( 'holder' => 'Filtered' ) + $rights;
		add_filter( 'riff_rights', $filter );
		$this->assertSame( 'Filtered', riff_rights( $this->track )['holder'] );
		remove_filter( 'riff_rights', $filter );
	}

	public function test_nothing_set_changes_nothing_a_listener_gets(): void {
		$track = Tracks::from_attachment( $this->track, $this->album );
		$this->assertNull( $track['rights'] );
		$this->assertTrue( $track['downloads'] );
		$this->assertFalse( $track['locked'] );
		$this->assertSame( '', $track['reason'] );
		$this->assertSame( wp_get_attachment_url( $this->track ), $track['src'] );

		$this->go_to( get_permalink( $this->album ) );
		ob_start();
		Rights::head();
		$this->assertSame( '', ob_get_clean(), 'no licence link' );
		$block = render_block( parse_blocks( '<!-- wp:file {"id":' . $this->track . '} --><div class="wp-block-file"><a href="x">Underground</a></div><!-- /wp:file -->' )[0] );
		$this->assertStringContainsString( 'Underground', $block, 'a download stays' );
	}

	public function test_the_player_shows_the_rights_and_the_page_links_the_licence(): void {
		update_post_meta( $this->album, Rights::YEAR, 1924 );
		update_post_meta( $this->album, Rights::LICENSE, 'cc-by-sa' );
		$track = Tracks::from_attachment( $this->track, $this->album );
		$this->assertSame( 'Ma Rainey', $track['rights']['holder'] );
		$this->assertSame( 1924, $track['rights']['year'] );
		$this->assertSame( 'CC BY-SA 4.0', $track['rights']['license_label'] );
		$this->assertArrayNotHasKey( 'user_id', $track['rights'], 'who attested stays on the server' );

		$this->go_to( get_permalink( $this->album ) );
		ob_start();
		Rights::head();
		$this->assertSame( '<link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/">' . "\n", ob_get_clean() );
	}

	public function test_the_statement_is_always_the_saving_users_own(): void {
		$this->assertFalse( Rights::attestation_required(), 'a host\'s choice' );
		$artist = self::factory()->user->create( array( 'role' => 'author' ) );
		wp_set_current_user( $artist );
		update_post_meta(
			$this->album,
			Rights::ATTESTED,
			array(
				'user_id' => 1,
				'time'    => 5,
				'text'    => 'v1',
			)
		);
		$kept = get_post_meta( $this->album, Rights::ATTESTED, true );
		$this->assertSame( $artist, $kept['user_id'], 'nobody attests in another\'s name' );
		$this->assertEqualsWithDelta( time(), $kept['time'], 5 );
		$this->assertSame( 'v1', $kept['text'] );
		$this->assertSame( $artist, riff_rights( $this->track )['attested']['user_id'], 'the track has the album\'s' );

		$made = Rights::attest( $this->track, 7 );
		$this->assertSame( 7, get_post_meta( $this->track, Rights::ATTESTED, true )['user_id'], 'attest() keeps who it is told' );
		$this->assertSame( Rights::statement_hash(), $made['text'] );
	}

	public function test_downloads_off_takes_the_link_away_from_everyone_who_cant_edit(): void {
		update_post_meta( $this->album, Rights::DOWNLOADS, false );
		$block = parse_blocks( '<!-- wp:file {"id":' . $this->track . '} --><div class="wp-block-file"><a href="x">Underground</a><a href="x" class="wp-block-file__button" download>Download</a></div><!-- /wp:file -->' )[0];

		$this->assertFalse( riff_may_download( $this->track, 0 ) );
		$this->assertSame( '', render_block( $block ) );
		$this->assertFalse( Tracks::from_attachment( $this->track, $this->album )['downloads'] );

		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		wp_set_current_user( $editor );
		$this->assertTrue( riff_may_download( $this->track, $editor ) );
		$this->assertStringContainsString( 'Download', render_block( $block ) );

		$allow = static fn() => true;
		add_filter( 'riff_may_download', $allow );
		$this->assertTrue( riff_may_download( $this->track, 0 ) );
		remove_filter( 'riff_may_download', $allow );
	}

	public function test_music_past_its_availability_is_no_longer_available_to_listeners(): void {
		update_post_meta( $this->album, Rights::UNTIL, '2020-01-01T00:00:00+00:00' );
		$this->assertSame( '2020-01-01 00:00:00', get_post_meta( $this->album, Rights::UNTIL, true ), 'kept in UTC' );

		$track = Tracks::from_attachment( $this->track, $this->album );
		$this->assertTrue( $track['locked'] );
		$this->assertSame( '', $track['src'] );
		$this->assertSame( 'No longer available', $track['reason'] );
		$hidden = new ReflectionMethod( Riff\Catalog_Rest::class, 'hidden_tracks' );
		$hidden->setAccessible( true );
		$this->assertContains( $this->track, $hidden->invoke( null ), 'not listed' );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$this->assertFalse( Tracks::from_attachment( $this->track, $this->album )['locked'], 'an editor still plays it' );
		wp_set_current_user( 0 );

		update_post_meta( $this->track, Rights::UNTIL, gmdate( 'Y-m-d H:i:s', time() + DAY_IN_SECONDS ) );
		$this->assertFalse( Tracks::from_attachment( $this->track, $this->album )['locked'], 'its own end, later' );
		$this->assertNotContains( $this->track, $hidden->invoke( null ) );
	}

	public function test_a_page_asks_riff_may_play_with_the_pass(): void {
		$_GET[ Rights::PASS ] = 'abc.123';
		$this->gate();
		$track = Tracks::from_attachment( $this->track, $this->album );
		$this->assertTrue( $track['locked'] );
		$this->assertSame( 'Pass required', $track['reason'] );
		$this->assertSame(
			array(
				$this->track,
				0,
				array(
					'pass' => 'abc.123',
					'via'  => 'page',
					'post' => $this->album,
				),
			),
			$this->asked[0]
		);
	}

	public function test_rest_asks_riff_may_play_with_the_pass_from_its_header(): void {
		$_SERVER['HTTP_X_RIFF_PASS'] = 'from-header';
		$this->gate();
		$response = rest_get_server()->dispatch( new WP_REST_Request( 'GET', '/' . Library::REST . '/library/' . $this->album ) );
		$this->assertSame( 200, $response->get_status() );
		$this->assertTrue( $response->get_data()['tracks'][0]['locked'] );
		$this->assertSame( '', $response->get_data()['tracks'][0]['src'] );
		$this->assertSame( 'rest', $this->asked[0][2]['via'] );
		$this->assertSame( 'from-header', $this->asked[0][2]['pass'] );
	}

	public function test_a_protected_files_own_request_asks_riff_may_play_even_when_signed(): void {
		Protected_Files::protect( $this->track );
		$_GET[ Rights::PASS ] = 'p1';
		$signed               = Protect::signed( $this->track );
		$this->assertStringContainsString( 'riff-pass=p1', $signed, 'the signed address carries the pass' );
		$query = array();
		wp_parse_str( (string) wp_parse_url( $signed, PHP_URL_QUERY ), $query );

		$this->assertTrue( Protect::allows( $this->track, (int) $query['riff-expires'], $query['riff-sig'] ), 'allowed by default' );
		$this->gate();
		$this->assertFalse( Protect::allows( $this->track, (int) $query['riff-expires'], $query['riff-sig'] ) );
		$this->assertSame( 'audio', $this->asked[0][2]['via'] );
		$this->assertSame( 'p1', $this->asked[0][2]['pass'] );
	}

	public function test_a_feed_leaves_out_an_enclosure_riff_may_play_refuses(): void {
		$html = '<enclosure url="' . esc_url( wp_get_attachment_url( $this->track ) ) . '" length="1" type="audio/mpeg" />' . "\n";
		$this->assertSame( $html, Rights::enclosure( $html ) );
		$this->gate();
		$this->assertSame( '', Rights::enclosure( $html ) );
		$this->assertSame( 'feed', $this->asked[0][2]['via'] );
		$other = '<enclosure url="https://elsewhere.example/a.mp3" />' . "\n";
		$this->assertSame( $other, Rights::enclosure( $other ), 'an address not in the library is left' );
	}

	public function test_a_public_export_leaves_out_music_riff_may_play_refuses(): void {
		$posts = new ReflectionMethod( Riff\Export::class, 'posts' );
		$posts->setAccessible( true );
		$this->assertContains( $this->track, $posts->invoke( null, true ) );
		$this->gate();
		$this->assertNotContains( $this->track, $posts->invoke( null, true ) );
		$this->assertSame( 'export', $this->asked[0][2]['via'] );
		$this->assertContains( $this->track, $posts->invoke( null, false ), 'the owner\'s own archive keeps everything' );
	}

	public function test_a_playable_address_is_handed_out_through_riff_play_url(): void {
		$sign  = static fn( $url, $id, $context ) => $url . '#' . $id . '-' . $context['via'];
		add_filter( 'riff_play_url', $sign, 10, 3 );
		$track = Tracks::from_attachment( $this->track, $this->album );
		remove_filter( 'riff_play_url', $sign );
		$this->assertSame( wp_get_attachment_url( $this->track ) . '#' . $this->track . '-page', $track['src'] );
	}

	public function test_riff_played_fires_once_for_each_play_reported(): void {
		$user   = self::factory()->user->create();
		$played = array();
		$count  = static function ( $track_id, $user_id, $context ) use ( &$played ) {
			$played[] = array( $track_id, $user_id, $context['pass'] );
		};
		add_action( 'riff_played', $count, 10, 3 );
		$_GET[ Rights::PASS ] = 'p2';
		Likes::played( $user, array( array( 'id' => $this->track ) ) );
		Likes::played( $user, array( array( 'id' => 999999 ) ) );
		remove_action( 'riff_played', $count );
		$this->assertSame( array( array( $this->track, $user, 'p2' ) ), $played, 'once, and not for what is not a track' );
	}

	public function test_a_share_link_carries_the_pass(): void {
		$this->assertSame( get_permalink( $this->album ), riff_share_url( $this->album ) );
		$this->assertSame( add_query_arg( 'riff-pass', 'x-1', get_permalink( $this->album ) ), riff_share_url( $this->album, 'x-1<>"' ) );
	}

	public function test_a_pass_opens_only_the_page_its_host_says_on_a_private_site(): void {
		update_option( Riff\Private_Site::OPTION, true );
		$other = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$dies  = static function ( callable $run ): bool {
			try {
				$run();
			} catch ( WPDieException $e ) {
				return true;
			}
			return false;
		};

		$this->assertTrue( $dies( static fn() => Riff\Private_Site::gate( new WP() ) ), 'refused without a pass' );
		$_GET[ Rights::PASS ] = 'p3';
		$this->assertFalse( $dies( static fn() => Riff\Private_Site::gate( new WP() ) ) );
		$this->assertNotFalse( has_action( 'template_redirect', array( Riff\Private_Site::class, 'gate_passed' ) ), 'let on as far as its page' );
		remove_action( 'template_redirect', array( Riff\Private_Site::class, 'gate_passed' ), 0 );
		// Visiting as the test does, without the private gate in the way.
		$visit = function ( int $id ): void {
			update_option( Riff\Private_Site::OPTION, false );
			$this->go_to( get_permalink( $id ) );
			update_option( Riff\Private_Site::OPTION, true );
		};

		$visit( $this->album );
		$_GET[ Rights::PASS ] = 'p3';
		$this->assertTrue( $dies( array( Riff\Private_Site::class, 'gate_passed' ) ), 'closed unless the host says' );
		$opens = fn( $allowed, $pass, $post_id ) => 'p3' === $pass && $this->album === $post_id;
		add_filter( 'riff_private_pass', $opens, 10, 3 );
		$this->assertFalse( $dies( array( Riff\Private_Site::class, 'gate_passed' ) ), 'its page opens' );
		$visit( $other );
		$_GET[ Rights::PASS ] = 'p3';
		$this->assertTrue( $dies( array( Riff\Private_Site::class, 'gate_passed' ) ), 'no other' );
		remove_filter( 'riff_private_pass', $opens, 10 );
	}
}
