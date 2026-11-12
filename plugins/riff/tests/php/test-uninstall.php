<?php
/**
 * Deleting Riff: uninstall.php removes what isolation.json says Riff owns, and keeps what it says to keep.
 *
 * @package Riff
 */

/**
 * Riff's uninstall.php, against its manifest.
 */
class Test_Riff_Uninstall extends Riff_TestCase {

	/**
	 * The prefixes the other plugins here own, which are longer than Riff's and so not Riff's.
	 *
	 * @return string[]
	 */
	private static function others(): array {
		$prefixes = array();
		foreach ( (array) glob( dirname( RIFF_DIR ) . '/*/isolation.json' ) as $file ) {
			$manifest = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a manifest in the repository.
			if ( 'riff' === ( $manifest['plugin'] ?? '' ) ) {
				continue;
			}
			$prefixes = array_merge( $prefixes, (array) ( $manifest['data']['options'] ?? array() ), (array) ( $manifest['data']['meta'] ?? array() ) );
		}
		return $prefixes;
	}

	/**
	 * Whether a key is Riff's: under its prefix, and not under a longer one another plugin owns.
	 *
	 * @param string $key Key.
	 * @return bool
	 */
	private static function riffs( string $key ): bool {
		if ( ! str_starts_with( $key, 'riff_' ) && ! str_starts_with( $key, '_riff_' ) ) {
			return false;
		}
		foreach ( self::others() as $prefix ) {
			if ( str_starts_with( $key, $prefix ) ) {
				return false;
			}
		}
		return true;
	}

	public function test_every_setting_job_and_note_riff_keeps_goes_but_what_listeners_made(): void {
		global $wpdb;
		$user = self::factory()->user->create();
		// What a site and its listeners set, through Riff's own settings and choices.
		update_option( Riff\Mcp::OPTION, '1' );
		update_option( Riff\Navigation::OPTION, '1' );
		update_option( Riff\Listen\Standalone::AT_ROOT, '1' );
		update_option( Riff\Private_Site::OPTION, '1' );
		update_user_option( $user, Riff\Shortcuts::OPTION, 'off' );
		update_user_option( $user, Riff\Listen\Together::SHARE, 'on' );
		update_user_option( $user, Riff\Likes::OPTION, array( 'kept' ) );
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'hourly', Riff\Private_Site::JOB );
		// What Riff keeps between requests, and the stamp a change to the library moves.
		Riff\Cache::settle();
		self::factory()->post->create();
		Riff\Cache::settle();
		Riff\Cache::set( 'uninstall', 1 );

		$manifest = json_decode( (string) file_get_contents( RIFF_DIR . 'isolation.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- the plugin's own manifest.
		$keep     = array_keys( (array) ( $manifest['data']['keep'] ?? array() ) );

		if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
			define( 'WP_UNINSTALL_PLUGIN', 'riff/riff.php' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- core's own constant.
		}
		include RIFF_DIR . 'uninstall.php';
		wp_cache_flush();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- what is left, as the database has it.
		$options = array_filter( $wpdb->get_col( "SELECT option_name FROM {$wpdb->options}" ), array( self::class, 'riffs' ) );
		$options = array_filter( $options, static fn( $name ) => ! str_starts_with( $name, '_transient_' ) );
		// Core's roles, named by the table prefix, which the test suite's starts with riff_.
		$options = array_diff( $options, array( $wpdb->get_blog_prefix() . 'user_roles' ) );
		$this->assertSame( array(), array_values( $options ), 'no setting of Riff\'s is left' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- what is left, as the database has it.
		$kept = $wpdb->get_col( $wpdb->prepare( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", '%' . $wpdb->esc_like( 'riff_kept_' ) . '%' ) );
		$this->assertSame( array(), $kept, 'nothing Riff kept between requests is left' );

		$prefix = $wpdb->get_blog_prefix();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- what is left, as the database has it.
		$meta = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT meta_key FROM {$wpdb->usermeta} WHERE user_id = %d", $user ) );
		$meta = array_map( static fn( $key ) => str_starts_with( $key, $prefix ) ? substr( $key, strlen( $prefix ) ) : $key, $meta );
		$left = array_values( array_diff( array_filter( $meta, array( self::class, 'riffs' ) ), $keep ) );
		$this->assertSame( array(), $left, 'no listener\'s choice is left but what the manifest keeps' );
		$this->assertSame( array( 'kept' ), get_user_option( Riff\Likes::OPTION, $user ), 'a listener\'s likes stay' );

		$jobs = array();
		foreach ( (array) _get_cron_array() as $hooks ) {
			$jobs = array_merge( $jobs, array_filter( array_keys( (array) $hooks ), array( self::class, 'riffs' ) ) );
		}
		$this->assertSame( array(), $jobs, 'no job of Riff\'s is left scheduled' );
	}
}
