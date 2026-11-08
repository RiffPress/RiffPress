<?php
/**
 * Protected files kept outside the web root: the path, the move, and the self-check.
 *
 * @package Riff
 */

use Riff\Protect;
use Riff\Protected_Cli;
use Riff\Protected_Files;
use Riff\Protected_Path;

/**
 * @covers \Riff\Protected_Files
 * @covers \Riff\Protected_Path
 * @covers \Riff\Protected_Cli
 */
class Test_Riff_Protected_Path extends Riff_TestCase {

	/**
	 * A folder outside the web root, for the tests' own use.
	 *
	 * @var string
	 */
	private string $base = '';

	/**
	 * The path the filter gives, or empty.
	 *
	 * @var string
	 */
	private string $path = '';

	/**
	 * A published post.
	 *
	 * @var int
	 */
	private int $post = 0;

	/**
	 * Files a test protected.
	 *
	 * @var int[]
	 */
	private array $files = array();

	public function set_up(): void {
		parent::set_up();
		$this->base = sys_get_temp_dir() . '/riff-phpunit-protected';
		$this->path = '';
		self::empty( $this->base );
		add_filter( 'riff_protected_path', array( $this, 'path' ) );
		$this->post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
	}

	public function tear_down(): void {
		foreach ( $this->files as $id ) {
			Protected_Files::unprotect( $id );
		}
		remove_filter( 'riff_protected_path', array( $this, 'path' ) );
		wp_clear_scheduled_hook( Protected_Files::JOB );
		wp_clear_scheduled_hook( Protect::PROBE );
		self::empty( $this->base );
		parent::tear_down();
	}

	/**
	 * The filter: the path the test set.
	 *
	 * @return string
	 */
	public function path(): string {
		return $this->path;
	}

	/**
	 * Removes a folder and everything in it.
	 *
	 * @param string $dir Folder.
	 */
	private static function empty( string $dir ): void {
		if ( is_file( $dir ) ) {
			unlink( $dir ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- test scratch.
		}
		if ( ! is_dir( $dir ) ) {
			return;
		}
		$items = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
		foreach ( $items as $item ) {
			// A link is removed, never what it leads to.
			$item->isDir() && ! $item->isLink() ? rmdir( $item->getPathname() ) : unlink( $item->getPathname() ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- test scratch.
		}
		rmdir( $dir ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- test scratch.
	}

	/**
	 * The name of the site's folder inside a host's path: the site's ID on a network, the random
	 * name otherwise.
	 *
	 * @return string
	 */
	private static function site_folder(): string {
		return is_multisite() ? (string) get_current_blog_id() : (string) get_option( Protected_Files::DIR );
	}

	/**
	 * A track on the post, protected.
	 *
	 * @param string $file Fixture.
	 * @return int Attachment ID.
	 */
	private function protected_track( string $file = '02 - Underground [underground].mp3' ): int {
		$id = self::attach( $file, $this->post );
		$this->assertTrue( Protected_Files::protect( $id ) );
		$this->files[] = $id;
		return $id;
	}

	/**
	 * Every pass of the move, until none are left.
	 *
	 * @return array<int, string> Why any didn't move.
	 */
	private static function move_all(): array {
		$errors = array();
		do {
			$done   = Protected_Files::migrate();
			$errors = $errors + $done['errors'];
		} while ( $done['left'] );
		return $errors;
	}

	public function test_a_host_keeps_protected_files_outside_the_web_root(): void {
		$this->path = $this->base . '/';
		$id         = self::attach( '02 - Underground [underground].mp3', $this->post );
		$public     = (string) get_attached_file( $id );
		$under      = (string) get_post_meta( $id, '_wp_attached_file', true );

		$this->assertTrue( Protected_Files::protect( $id ) );
		$this->files[] = $id;

		$file = (string) get_attached_file( $id );
		$this->assertSame( $this->base, Protected_Files::base(), 'without the trailing slash' );
		$this->assertSame( $this->base . '/' . self::site_folder(), Protected_Files::dir(), 'the site\'s own folder inside the path' );
		$this->assertSame( Protected_Files::dir() . '/' . $under, $file, 'in the same folders as under uploads' );
		$this->assertFileExists( $file );
		$this->assertFileDoesNotExist( $public );
		$this->assertSame( $file, (string) get_post_meta( $id, '_wp_attached_file', true ), 'WordPress keeps a path outside uploads whole' );
		$this->assertSame( $under, get_post_meta( $id, Protected_Files::META, true ), 'its place under uploads, to go back to' );
		$this->assertSame( Protect::address( $id ), wp_get_attachment_url( $id ) );
		$this->assertSame( '', Protected_Files::url( Protected_Files::dir() ), 'no address the web server answers at' );

		$this->assertTrue( Protected_Files::unprotect( $id ) );
		$this->assertSame( $public, (string) get_attached_file( $id ), 'back where it was' );
		$this->assertFileExists( $public );
	}

	public function test_the_constant_names_the_path_and_the_filter_starts_from_it(): void {
		$seen = null;
		$spy  = static function ( $path ) use ( &$seen ) {
			$seen = $path;
			return $path;
		};
		add_filter( 'riff_protected_path', $spy, 5 );
		Protected_Files::configured();
		remove_filter( 'riff_protected_path', $spy, 5 );
		$this->assertSame( defined( 'RIFF_PROTECTED_PATH' ) ? RIFF_PROTECTED_PATH : '', $seen, 'the constant, or nothing' );
		$this->assertSame( '', Protected_Files::base(), 'uploads, by default' );
		$this->assertStringStartsWith( wp_upload_dir( null, false )['basedir'] . '/riff-protected-', Protected_Files::path() );
	}

	public function test_x_accel_redirect_names_the_file_under_its_own_location_for_a_custom_path(): void {
		$id   = $this->protected_track();
		$file = (string) get_attached_file( $id );
		$this->assertSame( '/wp-content/uploads/' . Protected_Files::relative( $file ), Protect::accel( $file ), 'under uploads, as it always was' );

		$this->path = $this->base;
		$this->assertSame( '', Protect::accel( $file ), 'a file not yet moved goes from PHP' );
		self::move_all();
		$file = (string) get_attached_file( $id );
		$this->assertSame( '/riff-protected/' . Protected_Files::relative( $file, $this->base ), Protect::accel( $file ) );
		$this->assertStringStartsWith( '/riff-protected/' . self::site_folder() . '/', Protect::accel( $file ) );
	}

	/**
	 * Paths inside the web root, which are refused.
	 *
	 * @return array<string, array{0: string, 1: string}>
	 */
	public static function inside(): array {
		return array(
			'WordPress'  => array( 'abspath', 'web' ),
			'wp-content' => array( 'content', 'web' ),
			'uploads'    => array( 'uploads', 'web' ),
			'relative'   => array( 'relative', 'relative' ),
			'climbing'   => array( 'climbing', 'relative' ),
		);
	}

	/**
	 * @dataProvider inside
	 *
	 * @param string $where Where the path is.
	 * @param string $why   Why it is refused.
	 */
	public function test_a_path_inside_the_web_root_is_refused_with_a_notice_and_uploads_kept( string $where, string $why ): void {
		$this->path = array(
			'abspath'  => ABSPATH . 'private',
			'content'  => WP_CONTENT_DIR . '/riff-protected',
			'uploads'  => wp_upload_dir( null, false )['basedir'] . '/private',
			'relative' => 'private/riff',
			'climbing' => $this->base . '/../riff',
		)[ $where ];

		$this->assertSame( $why, Protected_Files::refusal() );
		$this->assertSame( '', Protected_Files::base() );
		$this->assertStringStartsWith( wp_upload_dir( null, false )['basedir'] . '/riff-protected-', Protected_Files::path(), 'the default, under uploads' );
		$messages = Protected_Path::messages();
		$this->assertArrayHasKey( 'error', $messages );
		$this->assertStringContainsString( "Riff can't keep protected files in", $messages['error'] );
		$this->assertStringContainsString( 'RIFF_PROTECTED_PATH', $messages['error'] );
	}

	public function test_a_link_into_the_web_root_is_refused_as_the_folder_it_leads_to(): void {
		wp_mkdir_p( $this->base );
		$link = $this->base . '/into-uploads';
		if ( ! @symlink( wp_upload_dir( null, false )['basedir'], $link ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a filesystem without links skips.
			$this->markTestSkipped( 'This filesystem has no symbolic links.' );
		}
		$this->path = $link . '/riff';
		$this->assertSame( 'web', Protected_Files::refusal() );
	}

	public function test_wp_engines_private_folder_is_the_one_inside_the_site_root_allowed(): void {
		$this->path = ABSPATH . '_wpeprivate/riff-protected';
		$this->assertNull( Protected_Files::refusal() );
		$this->assertSame( untrailingslashit( ABSPATH ) . '/_wpeprivate/riff-protected', Protected_Files::base() );
		$folder = Protected_Files::path();
		$this->assertSame( site_url( '/_wpeprivate/riff-protected/' . self::site_folder() ), Protected_Files::url( $folder ), 'still in the web root, so still asked about' );
		$this->assertArrayNotHasKey( 'error', Protected_Path::messages() );

		$this->path = ABSPATH . '_wpeprivateer';
		$this->assertSame( 'web', Protected_Files::refusal(), 'only that folder' );
	}

	public function test_each_site_on_a_network_keeps_a_folder_of_its_own(): void {
		if ( ! is_multisite() ) {
			$this->markTestSkipped( 'A network only.' );
		}
		$this->path = $this->base;
		$main       = Protected_Files::dir();
		$site       = self::factory()->blog->create();
		switch_to_blog( $site );
		$theirs = Protected_Files::dir();
		$id     = self::attach( '03 - Trombone Detritus [detritus].mp3' );
		$this->assertTrue( Protected_Files::protect( $id ) );
		$file = (string) get_attached_file( $id );
		$this->assertTrue( Protected_Files::unprotect( $id ) );
		restore_current_blog();

		$this->assertSame( $this->base . '/' . get_current_blog_id(), $main, 'the site\'s ID' );
		$this->assertSame( $this->base . '/' . $site, $theirs );
		$this->assertStringStartsWith( $theirs . '/', $file );
		$this->assertNotSame( $main, $theirs, 'never shared' );
	}

	public function test_files_move_to_a_new_path_and_back_keeping_their_address(): void {
		$id      = $this->protected_track();
		$address = (string) wp_get_attachment_url( $id );
		$under   = (string) get_post_meta( $id, Protected_Files::META, true );
		$old     = (string) get_attached_file( $id );
		$bytes   = md5_file( $old );
		$this->assertFalse( Protected_Files::pending(), 'nowhere else to be' );

		$this->path = $this->base;
		$this->assertTrue( Protected_Files::pending() );
		$this->assertSame( array(), self::move_all() );

		$file = (string) get_attached_file( $id );
		$this->assertStringStartsWith( Protected_Files::dir() . '/', $file );
		$this->assertFileDoesNotExist( $old, 'gone from uploads' );
		$this->assertSame( $bytes, md5_file( $file ), 'the whole file' );
		$this->assertSame( $address, wp_get_attachment_url( $id ), 'the same address, so no post changes' );
		$this->assertSame( $under, get_post_meta( $id, Protected_Files::META, true ), 'and the same place to go back to' );
		$this->assertSame( array( Protected_Files::dir() ), Protected_Files::folders(), 'the old folder forgotten' );
		$this->assertFalse( Protected_Files::pending() );

		$this->path = '';
		$this->assertTrue( Protected_Files::pending() );
		self::move_all();
		$back = (string) get_attached_file( $id );
		$this->assertStringStartsWith( wp_upload_dir( null, false )['basedir'] . '/riff-protected-', $back, 'back in the folder under uploads' );
		$this->assertFileDoesNotExist( $file );
		$this->assertSame( $bytes, md5_file( $back ) );
		$this->assertFalse( Protected_Files::pending() );
	}

	public function test_a_file_protected_before_the_move_finishes_unprotects_from_where_it_is(): void {
		$first      = $this->protected_track();
		$second     = $this->protected_track( '03 - Trombone Detritus [detritus].mp3' );
		$public     = (string) get_post_meta( $second, Protected_Files::META, true );
		$this->path = $this->base;

		$done = Protected_Files::migrate( 1 );
		$this->assertTrue( $done['left'], 'a batch of one, cut short' );
		$this->assertStringStartsWith( $this->base . '/', (string) get_attached_file( $first ) );
		$this->assertStringStartsWith( wp_upload_dir( null, false )['basedir'] . '/riff-protected-', (string) get_attached_file( $second ), 'still in the old folder, still protected' );
		$this->assertTrue( Protect::is( $second ) );

		$this->assertTrue( Protected_Files::unprotect( $second ), 'from the folder it is still in' );
		$this->assertSame( wp_upload_dir( null, false )['basedir'] . '/' . $public, (string) get_attached_file( $second ) );

		$third = $this->protected_track( '01 - Intensities in Ten Cities [intensities].mp3' );
		$this->assertStringStartsWith( Protected_Files::dir() . '/', (string) get_attached_file( $third ), 'a file protected now goes to the new folder at once' );
		self::move_all();
		$this->assertFalse( Protected_Files::pending() );
	}

	public function test_a_move_cut_short_after_the_rename_is_finished(): void {
		$id         = $this->protected_track();
		$from       = (string) get_attached_file( $id );
		$this->path = $this->base;
		// As relocate() leaves it when the request ends between moving the file and telling WordPress.
		$to = Protected_Files::dir() . '/' . Protected_Files::relative( $from, dirname( $from, 3 ) );
		wp_mkdir_p( dirname( $to ) );
		rename( $from, $to ); // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename -- the state a cut-short move leaves.
		update_post_meta( $id, Protected_Files::MOVING, $to );

		$this->assertSame( array(), self::move_all() );
		$this->assertSame( $to, (string) get_attached_file( $id ), 'WordPress is told where it went' );
		$this->assertFileExists( $to );
		$this->assertSame( '', get_post_meta( $id, Protected_Files::MOVING, true ) );
	}

	public function test_a_copy_cut_short_is_thrown_away_and_the_file_moved_whole(): void {
		$id         = $this->protected_track();
		$from       = (string) get_attached_file( $id );
		$bytes      = md5_file( $from );
		$this->path = $this->base;
		// As a move across disks leaves it when the request ends partway through the copy.
		$to = Protected_Files::dir() . '/' . Protected_Files::relative( $from, dirname( $from, 3 ) );
		wp_mkdir_p( dirname( $to ) );
		file_put_contents( $to . '.riff-part', 'half' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- the state a cut-short copy leaves.
		file_put_contents( $to, 'half' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- the state a cut-short copy leaves.
		update_post_meta( $id, Protected_Files::MOVING, $to );

		$this->assertSame( array(), self::move_all() );
		$file = (string) get_attached_file( $id );
		$this->assertSame( $to, $file, 'into the name the copy had, not one numbered beside it' );
		$this->assertSame( $bytes, md5_file( $file ), 'whole' );
		$this->assertFileDoesNotExist( $to . '.riff-part' );
		$this->assertFileDoesNotExist( $from );
	}

	public function test_a_file_protected_again_where_a_cut_short_move_was_headed_is_never_taken_for_its_copy(): void {
		$id         = $this->protected_track();
		$from       = (string) get_attached_file( $id );
		$this->path = $this->base;
		$to         = Protected_Files::dir() . '/' . Protected_Files::relative( $from, dirname( $from, 3 ) );
		// Cut short partway through a copy across disks: only the part copy is there.
		wp_mkdir_p( dirname( $to ) );
		file_put_contents( $to . '.abc.riff-part', 'half' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- the state a cut-short copy leaves.
		update_post_meta( $id, Protected_Files::MOVING, $to );

		// Then unprotected and protected again before the next pass: it lands on the very name.
		$this->assertTrue( Protected_Files::unprotect( $id ) );
		$this->assertFileDoesNotExist( $to . '.abc.riff-part', 'the part copy goes with the note' );
		$this->assertTrue( Protected_Files::protect( $id ) );
		$this->assertSame( $to, (string) get_attached_file( $id ) );
		$bytes = md5_file( $to );

		self::move_all();
		$this->assertFileExists( $to, 'never deleted as a copy' );
		$this->assertSame( $bytes, md5_file( $to ) );
		$this->assertSame( $to, (string) get_attached_file( $id ) );
	}

	public function test_one_pass_moves_at_a_time_and_a_lock_left_by_a_pass_cut_short_is_taken_over(): void {
		$id         = $this->protected_track();
		$from       = (string) get_attached_file( $id );
		$this->path = $this->base;

		add_option( Protected_Files::LOCK, time() );
		$done = Protected_Files::migrate();
		$this->assertTrue( $done['busy'] );
		$this->assertSame( $from, (string) get_attached_file( $id ), 'left to the pass that holds it' );

		update_option( Protected_Files::LOCK, time() - HOUR_IN_SECONDS );
		$this->assertFalse( Protected_Files::migrate()['busy'], 'a lock nobody has touched for a quarter of an hour' );
		$this->assertStringStartsWith( $this->base . '/', (string) get_attached_file( $id ) );
		$this->assertFalse( get_option( Protected_Files::LOCK ), 'let go once the pass is done' );
	}

	public function test_deleting_a_protected_file_kept_outside_uploads_deletes_its_file(): void {
		$this->path = $this->base;
		$id         = $this->protected_track();
		$file       = (string) get_attached_file( $id );
		$this->assertFileExists( $file );
		wp_delete_attachment( $id, true );
		$this->files = array();
		$this->assertFileDoesNotExist( $file, 'as core deletes a file under uploads' );
	}

	public function test_the_warning_stays_while_files_wait_in_an_open_folder_under_uploads(): void {
		$this->protected_track();
		$this->protected_track( '03 - Trombone Detritus [detritus].mp3' );
		$old        = Protected_Files::dir();
		$this->path = $this->base;
		Protected_Files::migrate( 1 );
		$this->assertTrue( Protected_Files::pending() );
		$this->assertSame( $old, Protected_Files::exposed(), 'the folder still holding files, in the web root' );

		$asked = 0;
		$serve = static function () use ( &$asked ) {
			++$asked;
			return self::answer( true );
		};
		add_filter( 'pre_http_request', $serve );
		delete_transient( Protect::OPEN );
		$this->assertTrue( Protect::probe() );
		$this->assertTrue( Protect::open() );
		$this->assertStringContainsString( '/wp-content/uploads/' . basename( $old ) . '/ { internal; }', Protect::advice() );

		self::move_all();
		$this->assertSame( '', Protected_Files::exposed() );
		$this->assertFalse( Protect::open(), 'once they have all moved out of the web root' );
		$this->assertSame( 1, $asked );
		remove_filter( 'pre_http_request', $serve );
	}

	public function test_a_file_that_cant_be_moved_stays_protected_where_it_is_and_is_tried_again(): void {
		$id   = $this->protected_track();
		$from = (string) get_attached_file( $id );
		// A file where a folder must go, so the path can't be made.
		wp_mkdir_p( dirname( $this->base ) );
		file_put_contents( $this->base, 'not a folder' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- a path that can't be made.
		$this->path = $this->base . '/inside';

		$errors = self::move_all();
		$this->assertCount( 1, $errors );
		$this->assertSame( $from, (string) get_attached_file( $id ), 'where it was' );
		$this->assertFileExists( $from );
		$this->assertTrue( Protect::is( $id ) );
		$this->assertTrue( Protected_Files::pending(), 'the old folder still known' );
		$this->assertStringContainsString( "couldn't move 1 protected file", Protected_Path::messages()['error'] );

		Protected_Path::check();
		$this->assertFalse( wp_next_scheduled( Protected_Files::JOB ), 'not again on every screen' );
		$state          = get_option( Protected_Files::MOVE );
		$state['tried'] = time() - HOUR_IN_SECONDS - 1;
		update_option( Protected_Files::MOVE, $state );
		Protected_Path::check();
		$this->assertNotFalse( wp_next_scheduled( Protected_Files::JOB ), 'an hour on' );

		unlink( $this->base ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- test scratch.
		Protected_Path::sweep();
		$this->assertStringStartsWith( $this->base . '/inside/', (string) get_attached_file( $id ), 'moved once it can be' );
		$this->assertArrayNotHasKey( 'error', Protected_Path::messages() );
	}

	public function test_a_move_across_disks_copies_the_whole_file_before_the_old_one_goes(): void {
		$other = '/dev/shm';
		$here  = (int) stat( sys_get_temp_dir() )['dev'];
		$apart = is_dir( $other ) && wp_is_writable( $other ) && (int) stat( $other )['dev'] !== $here;
		if ( ! $apart ) {
			$this->markTestSkipped( 'No second disk to move to.' );
		}
		$this->base = $other . '/riff-phpunit-protected';
		$id         = $this->protected_track();
		$from       = (string) get_attached_file( $id );
		$bytes      = md5_file( $from );
		$this->path = $this->base;

		$this->assertSame( array(), self::move_all() );
		$file = (string) get_attached_file( $id );
		$this->assertStringStartsWith( $this->base . '/', $file );
		$this->assertSame( $bytes, md5_file( $file ) );
		$this->assertFileDoesNotExist( $from );
		$this->assertFileDoesNotExist( $file . '.riff-part' );
	}

	public function test_the_move_runs_in_the_background_only_while_there_is_something_to_move(): void {
		Protected_Path::check();
		$this->assertFalse( wp_next_scheduled( Protected_Files::JOB ), 'nothing was ever protected' );

		$id         = $this->protected_track();
		$this->path = $this->base;
		Protected_Path::check();
		$this->assertNotFalse( wp_next_scheduled( Protected_Files::JOB ) );

		wp_clear_scheduled_hook( Protected_Files::JOB );
		Protected_Path::sweep();
		$this->assertStringStartsWith( $this->base . '/', (string) get_attached_file( $id ) );
		$this->assertFalse( wp_next_scheduled( Protected_Files::JOB ), 'done in one batch' );
		Protected_Path::check();
		$this->assertFalse( wp_next_scheduled( Protected_Files::JOB ) );
	}

	public function test_wp_cli_moves_every_file_at_once(): void {
		require_once __DIR__ . '/class-riff-test-wp-cli.php';
		$first      = $this->protected_track();
		$second     = $this->protected_track( '03 - Trombone Detritus [detritus].mp3' );
		$this->path = $this->base;

		WP_CLI::$lines = array();
		( new Protected_Cli() )->move( array(), array( 'batch' => 1 ) );
		$this->assertSame( array( 'success', sprintf( 'Moved 2 protected files to %s.', Protected_Files::dir() ) ), end( WP_CLI::$lines ) );
		$this->assertStringStartsWith( $this->base . '/', (string) get_attached_file( $first ) );
		$this->assertStringStartsWith( $this->base . '/', (string) get_attached_file( $second ) );

		WP_CLI::$lines = array();
		( new Protected_Cli() )->move( array(), array() );
		$this->assertStringStartsWith( 'Protected files are already in', WP_CLI::$lines[0][1] );
	}

	/**
	 * A response to the probe: the file, as an open folder sends it, or a refusal.
	 *
	 * @param bool $open Whether the folder is open.
	 * @return array
	 */
	private static function answer( bool $open ): array {
		return array(
			'headers'  => array(),
			'body'     => $open ? 'riff' : '',
			'response' => array( 'code' => $open ? 200 : 403 ),
			'cookies'  => array(),
		);
	}

	public function test_settings_asks_the_server_once_a_day_and_the_notice_says_how_it_stands(): void {
		$this->protected_track();
		delete_transient( Protect::OPEN );
		$asked = 0;
		$open  = true;
		$serve = static function () use ( &$asked, &$open ) {
			++$asked;
			return self::answer( $open );
		};
		add_filter( 'pre_http_request', $serve );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		Protected_Path::ask();
		$this->assertSame( 1, $asked, 'asked when nobody has' );
		$this->assertSame( '1', get_transient( Protect::OPEN ) );
		$warning = Protected_Path::messages()['warning'] ?? '';
		$this->assertStringContainsString( 'Protected files can be downloaded directly on this server.', $warning );
		$this->assertStringContainsString( 'RIFF_PROTECTED_PATH', $warning, 'the path setting' );
		$this->assertStringContainsString( '/wp-content/uploads/' . get_option( Protected_Files::DIR ) . '/ { internal; }', $warning, 'or the Nginx rule' );

		Protected_Path::ask();
		$this->assertSame( 1, $asked, 'kept, not asked again' );

		delete_transient( Protect::OPEN );
		$open = false;
		Protected_Path::ask();
		$this->assertSame( 2, $asked );
		$this->assertSame( '0', get_transient( Protect::OPEN ) );
		$this->assertArrayNotHasKey( 'warning', Protected_Path::messages(), 'closed' );

		$this->path = $this->base;
		self::move_all();
		$this->assertFalse( get_transient( Protect::OPEN ), 'a new folder is asked about afresh' );
		Protected_Path::ask();
		$this->assertFalse( Protect::open() );
		$this->assertSame( 2, $asked, 'never for a folder outside the web root' );
		remove_filter( 'pre_http_request', $serve );
	}

	public function test_nothing_is_asked_before_a_file_was_protected_or_without_the_right_to_see_it(): void {
		$asked = false;
		$spy   = static function () use ( &$asked ) {
			$asked = true;
			return self::answer( true );
		};
		add_filter( 'pre_http_request', $spy );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		Protected_Path::ask();
		$this->assertFalse( $asked, 'no folder yet' );
		$this->assertFalse( Protect::open() );
		$this->assertFalse( wp_next_scheduled( Protect::PROBE ), 'nor left to cron' );

		$this->protected_track();
		delete_transient( Protect::OPEN );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		Protected_Path::ask();
		$this->assertFalse( $asked, 'an editor\'s visit asks nothing' );
		remove_filter( 'pre_http_request', $spy );
	}
}
