<?php
/**
 * Permissions: what a Riff plugin's isolation.json says it may do, in the words a site owner reads.
 *
 * @package Riff
 */

use Riff\Extensions;
use Riff\Permissions;

/**
 * Riff\Permissions.
 */
class Test_Riff_Permissions extends Riff_TestCase {

	/**
	 * Folders made for one test, removed after it.
	 *
	 * @var string[]
	 */
	private array $made = array();

	public function tear_down(): void {
		foreach ( $this->made as $dir ) {
			foreach ( (array) glob( $dir . '/*' ) as $file ) {
				wp_delete_file( (string) $file );
			}
			rmdir( $dir );
		}
		$this->made = array();
		delete_transient( 'riff_permissions_pending_' . get_current_user_id() );
		parent::tear_down();
	}

	/**
	 * A plugin folder holding an isolation.json, or the given text in its place.
	 *
	 * @param array|string|null $manifest The manifest, raw text, or null for none.
	 * @return string The folder.
	 */
	private function plugin( $manifest ): string {
		$dir = get_temp_dir() . 'riff-permissions-' . wp_generate_password( 8, false );
		wp_mkdir_p( $dir );
		$this->made[] = $dir;
		if ( null !== $manifest ) {
			file_put_contents( $dir . '/isolation.json', is_string( $manifest ) ? $manifest : wp_json_encode( $manifest ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- a fixture.
		}
		return $dir;
	}

	/**
	 * The sentences a manifest gives.
	 *
	 * @param array $manifest A manifest.
	 * @return string[]
	 */
	private function texts( array $manifest ): array {
		return array_column( Permissions::lines( $manifest ), 'text' );
	}

	public function test_a_view_extension_reads_as_the_player_and_its_tracks(): void {
		$texts = $this->texts(
			array(
				'plugin' => 'riff-lyrics',
				'data'   => array(
					'options' => array( 'riff_lyrics_' ),
					'meta'    => array(),
				),
				'hosts'  => array( 'api.example.com' ),
				'riff'   => array(
					'hooks'     => array( 'riff_register', 'riff_before_player', 'riff_track' ),
					'functions' => array( 'riff_register_view' ),
					'events'    => array( 'view', 'ready', 'time' ),
					'api'       => array( 'seek', 'view', 'time' ),
				),
			)
		);
		$this->assertContains( 'Reads your tracks', $texts );
		$this->assertContains( 'Adds a view to the player', $texts );
		$this->assertContains( 'Can contact api.example.com', $texts );
		$this->assertContains( 'Stores settings under riff_lyrics_*', $texts );
		$this->assertContains( "Follows what's playing", $texts );
		$this->assertContains( 'Can jump to a point in the song', $texts );
		$this->assertNotContains( 'Contacts no other website', $texts, 'it names a host' );
	}

	public function test_a_plugin_that_names_no_host_contacts_none(): void {
		$this->assertContains( 'Contacts no other website', $this->texts( array( 'hosts' => array() ) ) );
		$this->assertContains( 'Contacts no other website', $this->texts( array( 'hosts' => array( 'self' ) ) ), 'its own site is not another' );
		$this->assertNotContains( 'Contacts no other website', $this->texts( array() ), 'a manifest silent on hosts promises nothing' );
	}

	public function test_a_wildcard_host_names_the_domain_and_what_is_under_it(): void {
		$this->assertSame( array( 'Can contact gravatar.com and any address under it' ), $this->texts( array( 'hosts' => array( 'self', '*.gravatar.com' ) ) ) );
	}

	public function test_data_rest_programs_and_capabilities_are_each_said_once(): void {
		$lines = Permissions::lines(
			array(
				'data'         => array(
					'options' => array( 'riff_sign_in_', 'riff_sign_in_' ),
					'meta'    => array( '_riff_chords' ),
					'shared'  => array( '_wp_attachment_metadata' => 'The lyrics live in the file.' ),
					'keep'    => array( 'riff_likes' => 'What a listener liked.' ),
				),
				'rest'         => array(
					'namespaces' => array( 'riff-sign-in/v1' ),
					'fields'     => array( 'attachment.riff_lyrics', 'post.riff_mood' ),
					'public'     => array( 'riff-sign-in/v1/code' => 'Three codes an email in fifteen minutes.' ),
				),
				'spawn'        => array( 'ffmpeg' ),
				'capabilities' => array( 'edit_post', 'upload_files', 'update_plugins', 'some_custom_cap' ),
			)
		);
		$this->assertSame(
			array(
				array( 'Stores settings under riff_sign_in_*', '' ),
				array( 'Stores its own details on posts, tracks and people, under _riff_chords*', '' ),
				array( 'Changes _wp_attachment_metadata, which WordPress keeps', 'The lyrics live in the file.' ),
				array( "Leaves riff_likes behind when it's deleted", 'What a listener liked.' ),
				array( 'Adds its own REST routes, under /wp-json/riff-sign-in/v1', '' ),
				array( 'Adds riff_lyrics to your media in the REST API', '' ),
				array( 'Adds post.riff_mood to the REST API', '' ),
				array( 'Lets anyone, signed in or not, use /wp-json/riff-sign-in/v1/code', 'Three codes an email in fifteen minutes.' ),
				array( 'Runs ffmpeg on your server', '' ),
				array( 'Some of it is only for people who can edit the post, upload media, update plugins or some_custom_cap', '' ),
			),
			array_map( static fn( $l ) => array( $l['text'], $l['why'] ), $lines )
		);
	}

	public function test_a_part_it_does_not_know_is_listed_as_written_never_dropped(): void {
		$texts = $this->texts(
			array(
				'riff'    => array(
					'hooks'  => array( 'riff_track', 'riff_something_new' ),
					'future' => array( 'riff_other' ),
				),
				'devices' => array( 'microphone', 'midi' ),
				'cookies' => array( 'riff_seen' => 'Remembers a visit.' ),
				'wild'    => true,
			)
		);
		$this->assertContains( 'Uses these parts of Riff: riff_something_new, riff_other', $texts );
		$this->assertContains( 'devices: microphone, midi', $texts );
		$this->assertContains( 'cookies: riff_seen', $texts );
		$this->assertContains( 'wild: 1', $texts );
	}

	public function test_a_malformed_manifest_never_breaks_the_list(): void {
		$texts = $this->texts(
			array(
				'data'  => 'riff_',
				'hosts' => array( 42, '', null, 'ok.example.com' ),
				'riff'  => array( 'hooks' => 'riff_track' ),
				'rest'  => array( 'public' => array( 'a/b' => array( 'not a reason' ) ) ),
			)
		);
		$this->assertContains( 'Can contact ok.example.com', $texts );
		$this->assertContains( 'Lets anyone, signed in or not, use /wp-json/a/b', $texts );
		$this->assertNotContains( 'Reads your tracks', $texts );
	}

	public function test_a_folder_without_a_manifest_or_with_a_broken_one_has_none(): void {
		$this->assertNull( Permissions::manifest( $this->plugin( null ) ) );
		$this->assertNull( Permissions::manifest( $this->plugin( '{ not json' ) ) );
		$this->assertNull( Permissions::manifest( $this->plugin( '[ "a list" ]' ) ) );
		$this->assertSame( array( 'hosts' => array() ), Permissions::manifest( $this->plugin( array( 'hosts' => array() ) ) ) );
	}

	public function test_the_list_is_escaped_and_says_when_a_plugin_says_nothing(): void {
		$html = Permissions::render(
			'riff-evil',
			'<script>alert(1)</script>',
			$this->plugin(
				array(
					'hosts' => array( '<img src=x onerror=alert(1)>' ),
					'data'  => array( 'shared' => array( '_x' => '<b>why</b>' ) ),
				)
			)
		);
		$this->assertStringNotContainsString( '<script>', $html );
		$this->assertStringNotContainsString( '<img', $html );
		$this->assertStringNotContainsString( '<b>', $html );
		$this->assertStringContainsString( 'id="riff-permissions-riff-evil"', $html );
		$this->assertStringContainsString( '<span class="description">&lt;b&gt;why&lt;/b&gt;</span>', $html );

		$this->assertStringContainsString( 'doesn&#039;t say what it does', Permissions::render( 'riff-quiet', 'Quiet', $this->plugin( null ) ) );
		$this->assertStringContainsString( 'asks for nothing beyond showing in the player', Permissions::render( 'riff-none', 'None', $this->plugin( array( 'scripts' => array( 'riff-none' ) ) ) ) );
	}

	/**
	 * Each extension in the repository has its list, from its own file, once the files are there.
	 */
	public function test_every_extension_in_the_repository_reads_as_plain_words(): void {
		$found = 0;
		foreach ( array( 'riff', 'riff-lyrics', 'riff-chords', 'riff-sign-in', 'riff-sing', 'riff-meters' ) as $slug ) {
			$manifest = Permissions::manifest( dirname( RIFF_DIR ) . '/' . $slug );
			if ( null === $manifest ) {
				continue;
			}
			++$found;
			foreach ( Permissions::lines( $manifest ) as $line ) {
				$this->assertDoesNotMatchRegularExpression( '/^[a-z_$]+: /', $line['text'], "{$slug} has a part the list doesn't know: {$line['text']}" );
			}
		}
		if ( ! $found ) {
			$this->markTestSkipped( 'No plugin in this checkout has an isolation.json yet.' );
		}
	}

	public function test_settings_riff_lists_riff_itself(): void {
		$this->assertArrayHasKey( 'riff', Permissions::plugins() );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		ob_start();
		Extensions::page();
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'What each plugin can do', $html );
		$this->assertStringContainsString( 'id="riff-permissions-riff"', $html );
	}

	public function test_a_riff_plugin_activated_is_listed_once_in_a_notice(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		if ( is_multisite() ) {
			grant_super_admin( get_current_user_id() );
		}
		Permissions::activated( 'hello.php' );
		Permissions::activated( 'akismet/akismet.php' );
		$this->assertFalse( get_transient( 'riff_permissions_pending_' . get_current_user_id() ), 'neither requires Riff' );

		Permissions::activated( 'riff-meters/riff-meters.php' );
		ob_start();
		Permissions::notice();
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'Riff Meters (Experimental) is on. Here is what it can do.', $html );
		$this->assertStringContainsString( 'riff-permissions-notice', $html );

		ob_start();
		Permissions::notice();
		$this->assertSame( '', (string) ob_get_clean(), 'once' );
	}

	public function test_an_extension_turned_on_in_settings_gets_the_notice_too(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		Permissions::turned_on( array( 'riff-lyrics' => 'on' ), array( 'riff-lyrics' => 'on' ) );
		$this->assertFalse( get_transient( 'riff_permissions_pending_' . get_current_user_id() ), 'it was on already' );
		Permissions::turned_on( array( 'riff-lyrics' => 'off' ), array( 'riff-lyrics' => 'on' ) );
		$this->assertArrayHasKey( 'riff-lyrics', (array) get_transient( 'riff_permissions_pending_' . get_current_user_id() ) );
	}

	public function test_a_riff_plugin_row_links_to_its_list(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$meta = Permissions::row_meta( array( 'Version 1' ), 'riff/riff.php' );
		$this->assertCount( 2, $meta );
		$this->assertStringContainsString( 'options-general.php?page=riff#riff-permissions-riff', $meta[1] );
		$this->assertSame( array( 'Version 1' ), Permissions::row_meta( array( 'Version 1' ), 'akismet/akismet.php' ) );
	}
}
