<?php
/**
 * Boots the WordPress test suite with Riff loaded.
 *
 * WP_TESTS_DIR is where wp-env mounts core's PHPUnit library inside the tests container
 * (/wordpress-phpunit). Nothing here is specific to wp-env beyond that default, so the same
 * bootstrap works against a suite installed by install-wp-tests.sh.
 *
 * @package Riff
 */

$riff_tests_dir = getenv( 'WP_TESTS_DIR' ) ?: '/wordpress-phpunit';

if ( ! file_exists( $riff_tests_dir . '/includes/functions.php' ) ) {
	fwrite( STDERR, "Could not find the WordPress test suite at {$riff_tests_dir}.\nRun `npm run test:php`, which runs this inside the wp-env tests container.\n" );
	exit( 1 );
}

// Our own database configuration, so the suite gets its own table prefix rather than emptying the
// tests site. Core reads this as a constant, not an environment variable.
if ( ! defined( 'WP_TESTS_CONFIG_FILE_PATH' ) ) {
	define( 'WP_TESTS_CONFIG_FILE_PATH', __DIR__ . '/wp-tests-config.php' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- core's own constant name, read by the test suite's bootstrap.
}

// `WP_TESTS_MULTISITE=1 ./vendor/bin/phpunit` runs the suite as a multisite network (npm run test:php:multisite).
if ( getenv( 'WP_TESTS_MULTISITE' ) && ! defined( 'WP_TESTS_MULTISITE' ) ) {
	define( 'WP_TESTS_MULTISITE', true ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- core's own constant name, read by the test suite's bootstrap.
}

require_once $riff_tests_dir . '/includes/functions.php';

// Somewhere disposable for anything the tests attach: the suite hard-deletes every attachment it
// created between tests, files included, and the tests site's uploads are not ours to delete.
$riff_uploads = sys_get_temp_dir() . '/riff-phpunit-uploads';

// Every upload a test makes lands in the suite's own folder, and the suite does not delete the
// files, so the folder is emptied when a run starts and again when it ends: a run leaves nothing.
$riff_empty = static function ( string $dir ): void {
	if ( ! is_dir( $dir ) ) {
		return;
	}
	$items = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
	foreach ( $items as $item ) {
		$item->isDir() ? rmdir( $item->getPathname() ) : unlink( $item->getPathname() ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- test scratch, before and after WordPress.
	}
};
$riff_empty( $riff_uploads );
register_shutdown_function( $riff_empty, $riff_uploads );

tests_add_filter(
	'muplugins_loaded',
	static function () use ( $riff_uploads ) {
		if ( ! is_dir( $riff_uploads ) ) {
			mkdir( $riff_uploads, 0777, true );
		}
		add_filter(
			'upload_dir',
			static function ( array $dirs ) use ( $riff_uploads ): array {
				$dirs['basedir'] = $riff_uploads;
				$dirs['baseurl'] = 'http://example.org/wp-content/uploads';
				$dirs['path']    = $riff_uploads . ( $dirs['subdir'] ?? '' );
				$dirs['url']     = $dirs['baseurl'] . ( $dirs['subdir'] ?? '' );
				return $dirs;
			}
		);
		require dirname( __DIR__, 2 ) . '/riff.php';
		// The reference extension next to it, tested in the same suite against the same Riff. Only
		// its class loads here; its own tests hook it in, so Riff's tests see Riff alone.
		define( 'RIFF_LYRICS_VERSION', 'test' );
		define( 'RIFF_LYRICS_URL', 'http://example.org/wp-content/plugins/riff-lyrics/' );
		require dirname( __DIR__, 3 ) . '/riff-lyrics/src/class-lyrics.php';
		// Riff Sign In the same way: its classes, hooked by each test that needs them.
		define( 'RIFF_SIGN_IN_VERSION', '0.0.0' );
		define( 'RIFF_SIGN_IN_URL', 'http://example.org/wp-content/plugins/riff-sign-in/' );
		foreach ( array( 'cbor', 'passkeys', 'codes', 'routes', 'listeners', 'sign-in' ) as $riff_sign_in_class ) {
			require dirname( __DIR__, 3 ) . "/riff-sign-in/src/class-{$riff_sign_in_class}.php";
		}
		// The Presence API, where wp-env installs it, for listening together; its tests skip without it.
		if ( is_readable( WP_PLUGIN_DIR . '/presence-api/presence-api.php' ) ) {
			require WP_PLUGIN_DIR . '/presence-api/presence-api.php';
		}
	}
);

require $riff_tests_dir . '/includes/bootstrap.php';

// The suite reinstalls WordPress, which leaves the Presence API's table without its schema version,
// so the site is provisioned as activation does.
if ( function_exists( 'wp_presence_provision_site' ) ) {
	wp_presence_provision_site();
}

/**
 * Shared helpers for the suite.
 */
abstract class Riff_TestCase extends WP_UnitTestCase {

	/**
	 * The public-domain fixtures, one folder up from the plugin.
	 *
	 * @param string $file File name inside packages/fixtures/compositions.
	 * @return string
	 */
	protected static function fixture( string $file ): string {
		return dirname( __DIR__, 4 ) . '/packages/fixtures/compositions/' . $file;
	}

	/**
	 * An attachment from a fixture file, with WordPress's own metadata (duration, tags) generated,
	 * and titled from the tags the way an upload through the Media Library is: the factory only
	 * names it after the file.
	 *
	 * @param string $file   Fixture file name.
	 * @param int    $post_id The post it belongs to, or 0.
	 * @return int
	 */
	protected static function attach( string $file, int $post_id = 0 ): int {
		$id = self::factory()->attachment->create_upload_object( self::fixture( $file ), $post_id );
		self::assertIsInt( $id );
		self::assertGreaterThan( 0, $id );
		if ( str_starts_with( (string) get_post_mime_type( $id ), 'audio/' ) ) {
			$tags = wp_read_audio_metadata( get_attached_file( $id ) );
			if ( ! empty( $tags['title'] ) ) {
				wp_update_post(
					array(
						'ID'         => $id,
						'post_title' => $tags['title'],
					)
				);
			}
		}
		return $id;
	}
}
