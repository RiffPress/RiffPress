<?php
/**
 * Extensions: the plugins Riff ships inside it, which of them load, and who chooses.
 *
 * @package Riff
 */

use Riff\Extensions;

/**
 * Riff\Extensions.
 */
class Test_Riff_Extensions extends Riff_TestCase {

	/**
	 * A plugin beside Riff that needs a Riff from the future, made for one test.
	 *
	 * @var string
	 */
	private string $later = '';

	public function set_up(): void {
		parent::set_up();
		// The suite's bootstrap leaves Riff alone (no extensions); these tests name their own.
		add_filter( 'riff_extensions', array( $this, 'named' ), 20 );
	}

	public function tear_down(): void {
		remove_filter( 'riff_extensions', array( $this, 'named' ), 20 );
		if ( '' !== $this->later && is_dir( $this->later ) ) {
			wp_delete_file( $this->later . '/riff-test-later.php' );
			rmdir( $this->later );
		}
		parent::tear_down();
	}

	/**
	 * The extensions these tests load: Riff Lyrics, and the one from the future when it is made.
	 *
	 * @return string[]
	 */
	public function named(): array {
		return '' !== $this->later ? array( 'riff-lyrics', 'riff-test-later' ) : array( 'riff-lyrics' );
	}

	public function test_the_manifest_names_lyrics_and_never_sign_in(): void {
		$manifest = json_decode( (string) file_get_contents( RIFF_DIR . 'extensions.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Riff's own manifest.
		$this->assertContains( 'riff-lyrics', $manifest['extensions'] );
		$this->assertNotContains( 'riff-sign-in', $manifest['extensions'], 'installed on its own' );
	}

	public function test_a_checkout_finds_an_extension_beside_riff(): void {
		$this->assertDirectoryDoesNotExist( RIFF_DIR . 'extensions', 'only a release has the folder' );
		$this->assertSame( trailingslashit( dirname( RIFF_DIR ) ) . 'riff-lyrics/riff-lyrics.php', Extensions::file( 'riff-lyrics' ) );
		$this->assertNull( Extensions::file( 'riff-nothing' ) );
	}

	public function test_an_extension_loads_unless_it_runs_as_its_own_plugin_or_is_off(): void {
		$this->assertSame( array( 'riff-lyrics' ), array_keys( Extensions::loadable() ) );

		update_option( 'active_plugins', array( 'riff-lyrics/riff-lyrics.php' ) );
		$this->assertSame( array(), Extensions::loadable(), 'WordPress loads it, once' );
		$this->assertTrue( Extensions::standalone( 'riff-lyrics' ) );
		update_option( 'active_plugins', array() );

		update_option( Extensions::OPTION, array( 'riff-lyrics' => 'off' ) );
		$this->assertSame( array(), Extensions::loadable(), 'off is not loaded at all' );
		update_option( Extensions::OPTION, array( 'riff-lyrics' => 'on' ) );
		$this->assertSame( array( 'riff-lyrics' ), array_keys( Extensions::loadable() ) );
	}

	public function test_an_extension_that_needs_a_newer_riff_is_not_loaded(): void {
		$this->later = trailingslashit( dirname( RIFF_DIR ) ) . 'riff-test-later';
		wp_mkdir_p( $this->later );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- a fixture plugin, removed after.
		file_put_contents( $this->later . '/riff-test-later.php', "<?php\n/**\n * Plugin Name: Later\n * Requires Riff: 99.0\n */\n" );

		$this->assertSame( array( 'riff-lyrics' ), array_keys( Extensions::loadable() ) );
	}

	public function test_a_name_that_is_not_a_folder_name_is_never_loaded(): void {
		$odd = static fn() => array( '../riff-lyrics', 'riff-lyrics' );
		add_filter( 'riff_extensions', $odd, 30 );
		$this->assertSame( array( 'riff-lyrics' ), Extensions::bundled() );
		remove_filter( 'riff_extensions', $odd, 30 );
	}

	public function test_a_site_saves_only_the_bundled_extensions_each_on_or_off(): void {
		$this->assertSame(
			array( 'riff-lyrics' => 'off' ),
			Extensions::sanitize(
				array(
					'riff-lyrics'  => 'yes please',
					'riff-sign-in' => 'on',
				)
			)
		);
		$this->assertSame( array(), Extensions::sanitize( 'on' ) );
		$this->assertSame(
			array(
				'riff-lyrics' => array(
					'state'  => 'off',
					'locked' => true,
				),
			),
			Extensions::sanitize_network(
				array(
					'riff-lyrics' => array(
						'state'  => 'off',
						'locked' => '1',
					),
				)
			)
		);
	}

	public function test_a_network_can_lock_an_extension_for_every_site(): void {
		if ( ! is_multisite() ) {
			$this->markTestSkipped( 'A network choice is multisite\'s.' );
		}
		update_option( Extensions::OPTION, array( 'riff-lyrics' => 'on' ) );
		update_site_option(
			Extensions::NETWORK,
			array(
				'riff-lyrics' => array(
					'state'  => 'off',
					'locked' => true,
				),
			)
		);
		$this->assertTrue( Extensions::locked( 'riff-lyrics' ) );
		$this->assertFalse( Extensions::on( 'riff-lyrics' ), 'the network\'s choice while it is locked' );

		update_site_option(
			Extensions::NETWORK,
			array(
				'riff-lyrics' => array(
					'state'  => 'off',
					'locked' => false,
				),
			)
		);
		$this->assertTrue( Extensions::on( 'riff-lyrics' ), 'unlocked, the site\'s own choice comes first' );
		delete_option( Extensions::OPTION );
		$this->assertFalse( Extensions::on( 'riff-lyrics' ), 'and without one, the network\'s' );
		delete_site_option( Extensions::NETWORK );
		$this->assertTrue( Extensions::on( 'riff-lyrics' ), 'on, when no one has chosen' );
	}
}
