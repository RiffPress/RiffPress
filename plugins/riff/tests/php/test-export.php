<?php
/**
 * Download your Riff: the archive Export writes.
 *
 * @package Riff
 */

use Riff\Archive;
use Riff\Export;
use Riff\Protected_Files;

/**
 * @covers \Riff\Export
 */
class Test_Riff_Export extends Riff_TestCase {

	/**
	 * A folder outside the web root, for protected files.
	 *
	 * @var string
	 */
	private string $outside = '';

	/**
	 * The path riff_protected_path gives, or empty for uploads.
	 *
	 * @var string
	 */
	private string $path = '';

	/**
	 * Files a test protected.
	 *
	 * @var int[]
	 */
	private array $files = array();

	/**
	 * The archive a test wrote.
	 *
	 * @var string
	 */
	private string $zip = '';

	public function set_up(): void {
		parent::set_up();
		if ( is_wp_error( Archive::supported() ) ) {
			$this->markTestSkipped( 'this PHP cannot write an archive' );
		}
		$this->outside = sys_get_temp_dir() . '/riff-phpunit-export-protected';
		wp_mkdir_p( $this->outside );
		$this->path = '';
		add_filter( 'riff_protected_path', array( $this, 'path' ) );
		$this->zip = get_temp_dir() . 'riff-phpunit-export-' . wp_generate_password( 8, false ) . '.zip';
	}

	public function tear_down(): void {
		foreach ( $this->files as $id ) {
			Protected_Files::unprotect( $id );
		}
		remove_filter( 'riff_protected_path', array( $this, 'path' ) );
		wp_delete_file( $this->zip );
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
	 * A track on a published post, protected.
	 *
	 * @return int Attachment ID.
	 */
	private function protected_track(): int {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		$this->assertTrue( Protected_Files::protect( $id ) );
		$this->files[] = $id;
		return $id;
	}

	/**
	 * The archive's entries.
	 *
	 * @return string[]
	 */
	private function entries(): array {
		$zip = new ZipArchive();
		$this->assertTrue( $zip->open( $this->zip ) );
		$names = array();
		$count = $zip->count();
		for ( $i = 0; $i < $count; $i++ ) {
			$names[] = (string) $zip->getNameIndex( $i );
		}
		$zip->close();
		return $names;
	}

	/**
	 * Where a protected file goes in the archive: under uploads, at the place it had before it was protected.
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	private static function kept_as( int $id ): string {
		return Archive::UPLOADS . ltrim( (string) get_post_meta( $id, Protected_Files::META, true ), '/' );
	}

	public function test_a_protected_file_under_uploads_is_in_the_archive(): void {
		$id   = $this->protected_track();
		$done = Export::to_file( $this->zip, array( 'plugins' => false ) );

		$this->assertIsArray( $done );
		$this->assertSame( array(), $done['skipped'] );
		$this->assertContains( self::kept_as( $id ), $this->entries() );
	}

	public function test_a_protected_file_kept_outside_the_web_root_is_in_the_archive_too(): void {
		$this->path = $this->outside;
		$id         = $this->protected_track();
		$this->assertStringStartsWith( $this->outside, (string) get_attached_file( $id ), 'kept outside uploads' );

		$done = Export::to_file( $this->zip, array( 'plugins' => false ) );

		$this->assertIsArray( $done );
		$this->assertSame( array(), $done['skipped'], 'the download holds every protected file, wherever the site keeps it' );
		$this->assertContains( self::kept_as( $id ), $this->entries() );
	}

	public function test_a_file_outside_uploads_and_the_protected_folder_stays_out(): void {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		$away = $this->outside . '/elsewhere.mp3';
		copy( (string) get_attached_file( $id ), $away ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- test scratch.
		update_post_meta( $id, '_wp_attached_file', $away );

		$done = Export::to_file( $this->zip, array( 'plugins' => false ) );

		$this->assertIsArray( $done );
		$this->assertContains( $away, $done['skipped'], 'only uploads and the protected folder are read from' );
		wp_delete_file( $away );
	}

	public function test_a_second_archive_in_the_same_process_holds_what_was_added_since_the_first(): void {
		$post  = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$first = self::attach( '02 - Underground [underground].mp3', $post );
		$done  = Export::to_file( $this->zip, array( 'plugins' => false ) );
		$this->assertIsArray( $done );
		$this->assertContains( $first, $this->attachments_in( $this->zip ) );

		$second = self::attach( '03 - Trombone Detritus [detritus].mp3', $post );
		$again  = get_temp_dir() . 'riff-phpunit-export-' . wp_generate_password( 8, false ) . '.zip';
		$next   = Export::to_file( $again, array( 'plugins' => false ) );

		$this->assertIsArray( $next );
		$this->assertSame( $done['counts']['tracks'] + 1, $next['counts']['tracks'] );
		$this->assertContains( $second, $this->attachments_in( $again ), 'written on its own database, with what was added since' );
		wp_delete_file( $again );
	}

	public function test_a_public_archive_names_its_authors_without_a_login_or_an_email(): void {
		$author = self::factory()->user->create(
			array(
				'user_login'   => 'hmerrill',
				'user_email'   => 'hannah@example.test',
				'display_name' => 'Hannah Merrill',
			)
		);
		self::factory()->post->create(
			array(
				'post_status' => 'publish',
				'post_author' => $author,
			)
		);
		$done = Export::to_file(
			$this->zip,
			array(
				'public'  => true,
				'plugins' => false,
			)
		);

		$this->assertIsArray( $done );
		$users = $this->users_in( $this->zip );
		$this->assertSame( array( 'Hannah Merrill' ), array_column( $users, 'display_name' ) );
		$this->assertStringNotContainsString( '@', (string) wp_json_encode( $users ), 'a link that is shared carries no address' );
		$this->assertStringNotContainsString( 'hmerrill', (string) wp_json_encode( $users ), 'nor a login' );
	}

	public function test_the_download_keeps_its_authors_email(): void {
		$author = self::factory()->user->create(
			array(
				'user_login'   => 'hmerrill',
				'user_email'   => 'hannah@example.test',
				'display_name' => 'Hannah Merrill',
			)
		);
		self::factory()->post->create(
			array(
				'post_status' => 'publish',
				'post_author' => $author,
			)
		);
		$done = Export::to_file( $this->zip, array( 'plugins' => false ) );

		$this->assertIsArray( $done );
		$this->assertSame( array( 'hannah@example.test' ), array_column( $this->users_in( $this->zip ), 'user_email' ), "the owner's own export" );
	}

	/**
	 * The users an archive's database holds.
	 *
	 * @param string $zip The archive.
	 * @return array<int, array<string, string>> Rows.
	 */
	private function users_in( string $zip ): array {
		$archive = new ZipArchive();
		$this->assertTrue( $archive->open( $zip ) );
		$file = get_temp_dir() . 'riff-phpunit-export-' . wp_generate_password( 8, false ) . '.sqlite';
		file_put_contents( $file, (string) $archive->getFromName( Archive::DATABASE ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- test scratch.
		$archive->close();
		$db    = Archive::database( $file );
		$users = (array) $db->query( 'SELECT * FROM ' . Archive::PREFIX . 'users' )->fetchAll();
		$db    = null;
		wp_delete_file( $file );
		return $users;
	}

	/**
	 * The attachments an archive's database holds.
	 *
	 * @param string $zip The archive.
	 * @return int[] Attachment IDs.
	 */
	private function attachments_in( string $zip ): array {
		$archive = new ZipArchive();
		$this->assertTrue( $archive->open( $zip ) );
		$file = get_temp_dir() . 'riff-phpunit-export-' . wp_generate_password( 8, false ) . '.sqlite';
		file_put_contents( $file, (string) $archive->getFromName( Archive::DATABASE ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- test scratch.
		$archive->close();
		$db  = Archive::database( $file );
		$ids = array_map( static fn( array $row ): int => (int) $row['ID'], (array) $db->query( 'SELECT ID FROM ' . Archive::PREFIX . "posts WHERE post_type = 'attachment'" )->fetchAll() );
		$db  = null;
		wp_delete_file( $file );
		return $ids;
	}
}
