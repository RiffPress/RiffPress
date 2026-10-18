<?php
/**
 * Folder import.
 *
 * @package Riff
 */

use Riff\Import;
use Riff\Media;

/**
 * Riff\Import.
 */
class Test_Riff_Import extends Riff_TestCase {

	/**
	 * Folders made for a test, removed after it.
	 *
	 * @var string[]
	 */
	private array $dirs = array();

	public function tear_down(): void {
		foreach ( $this->dirs as $dir ) {
			$this->remove( $dir );
		}
		$this->dirs = array();
		parent::tear_down();
	}

	/**
	 * A folder of fixture files under a fresh temporary folder.
	 *
	 * @param string   $name  The folder's name, which may hold a subfolder ("label/album").
	 * @param string[] $files Fixture file names to copy in.
	 * @return string The folder.
	 */
	private function album_dir( string $name, array $files ): string {
		$root = sys_get_temp_dir() . '/riff-import-' . wp_generate_password( 8, false );
		$dir  = $root . '/' . $name;
		mkdir( $dir, 0777, true );
		foreach ( $files as $file ) {
			copy( self::fixture( $file ), $dir . '/' . $file );
		}
		$this->dirs[] = $root;
		return $dir;
	}

	/**
	 * Removes a folder and everything in it.
	 *
	 * @param string $dir Folder.
	 */
	private function remove( string $dir ): void {
		foreach ( array_diff( (array) scandir( $dir ), array( '.', '..' ) ) as $name ) {
			$path = $dir . '/' . $name;
			is_dir( $path ) ? $this->remove( $path ) : unlink( $path );
		}
		rmdir( $dir );
	}

	/**
	 * Audio attachment IDs, oldest first.
	 *
	 * @return int[]
	 */
	private function tracks(): array {
		return get_posts(
			array(
				'post_type'      => 'attachment',
				'post_mime_type' => 'audio',
				'post_status'    => 'any',
				'fields'         => 'ids',
				'posts_per_page' => -1,
				'orderby'        => 'ID',
				'order'          => 'ASC',
			)
		);
	}

	public function test_a_folder_becomes_an_album_of_attachments_and_a_post(): void {
		$dir    = $this->album_dir(
			'compositions',
			array(
				'01 - Intensities in Ten Cities [intensities].mp3',
				'01 - Intensities in Ten Cities [intensities].webm',
				'02 - Underground [underground].mp3',
				'03 - Trombone Detritus [detritus].mp3',
				'cover.png',
			)
		);
		$result = Import::folder( $dir );

		$this->assertIsArray( $result );
		$this->assertCount( 1, $result['albums'] );
		$album = $result['albums'][0];
		$this->assertCount( 3, $album['imported'] );
		$this->assertSame( array(), $album['failed'] );

		$tracks = $this->tracks();
		$this->assertCount( 3, $tracks );
		$this->assertSame(
			array( 'Intensities in Ten Cities', 'Underground', 'Trombone Detritus' ),
			array_map( 'get_the_title', $tracks ),
			'titled from the tags, or from the file name without its number and id'
		);

		$post = get_post( $album['post'] );
		$this->assertSame( 'publish', $post->post_status );
		$this->assertSame( 3, substr_count( $post->post_content, '<!-- wp:audio {"id":' ) );
		$this->assertLessThan(
			strpos( $post->post_content, '"id":' . $tracks[1] ),
			strpos( $post->post_content, '"id":' . $tracks[0] ),
			'the blocks follow the album order'
		);

		$cover = (int) get_post_thumbnail_id( $post );
		$this->assertGreaterThan( 0, $cover, 'the folder cover is the post artwork' );
		foreach ( $tracks as $id ) {
			$this->assertSame( $post->ID, (int) get_post( $id )->post_parent, 'each track is uploaded to its album post' );
			$this->assertGreaterThan( 0, (int) get_post_thumbnail_id( $id ), 'each track has artwork' );
		}

		$video = (int) get_post_meta( $tracks[0], Media::VIDEO_META, true );
		$this->assertGreaterThan( 0, $video, 'the video with the same name is the track video version' );
		$this->assertSame( 'video/webm', get_post_mime_type( $video ) );
	}

	public function test_running_it_again_imports_nothing_twice(): void {
		$dir   = $this->album_dir( 'compositions', array( '02 - Underground [underground].mp3', 'cover.png' ) );
		$first = Import::folder( $dir );
		$count = count( get_posts( array( 'post_type' => 'attachment', 'post_status' => 'any', 'posts_per_page' => -1, 'fields' => 'ids' ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound

		$again = Import::folder( $dir );

		$this->assertSame( array(), $again['albums'][0]['imported'] );
		$this->assertSame( array( '02 - Underground [underground].mp3' ), $again['albums'][0]['skipped'] );
		$this->assertSame( $first['albums'][0]['post'], $again['albums'][0]['post'] );
		$this->assertCount( $count, get_posts( array( 'post_type' => 'attachment', 'post_status' => 'any', 'posts_per_page' => -1, 'fields' => 'ids' ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$this->assertCount( 1, get_posts( array( 'post_status' => 'any' ) ), 'one album post' );
	}

	public function test_a_track_added_later_joins_the_end_of_its_album(): void {
		$dir   = $this->album_dir( 'compositions', array( '02 - Underground [underground].mp3' ) );
		$first = Import::folder( $dir );
		copy( self::fixture( '03 - Trombone Detritus [detritus].mp3' ), $dir . '/03 - Trombone Detritus [detritus].mp3' );

		$again = Import::folder( $dir );

		$this->assertSame( array( '03 - Trombone Detritus [detritus].mp3' ), $again['albums'][0]['imported'] );
		$this->assertSame( $first['albums'][0]['post'], $again['albums'][0]['post'] );
		$this->assertSame( 2, substr_count( get_post_field( 'post_content', $again['albums'][0]['post'] ), '<!-- wp:audio' ) );
	}

	public function test_a_file_that_is_not_really_audio_is_reported_and_the_rest_imported(): void {
		$dir = $this->album_dir( 'compositions', array( '02 - Underground [underground].mp3' ) );
		file_put_contents( $dir . '/04 - Broken.mp3', 'not audio at all' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $dir . '/notes.txt', 'liner notes' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

		$album = Import::folder( $dir )['albums'][0];

		$this->assertSame( array( '02 - Underground [underground].mp3' ), $album['imported'] );
		$this->assertArrayHasKey( '04 - Broken.mp3', $album['failed'], 'the broken file is reported with core\'s reason' );
		$this->assertNotSame( '', $album['failed']['04 - Broken.mp3'] );
		$this->assertCount( 1, $this->tracks(), 'only the real track is in the Media Library; the notes are left alone' );
	}

	public function test_each_folder_with_audio_inside_it_is_its_own_album(): void {
		$dir = $this->album_dir( 'label/one', array( '02 - Underground [underground].mp3' ) );
		mkdir( dirname( $dir ) . '/two' );
		copy( self::fixture( '03 - Trombone Detritus [detritus].mp3' ), dirname( $dir ) . '/two/03 - Trombone Detritus [detritus].mp3' );

		$result = Import::folder( dirname( $dir ) );

		$this->assertCount( 2, $result['albums'] );
		$this->assertNotSame( $result['albums'][0]['post'], $result['albums'][1]['post'] );
	}

	public function test_a_dry_run_lists_the_files_and_imports_nothing(): void {
		$dir = $this->album_dir( 'compositions', array( '02 - Underground [underground].mp3' ) );

		$album = Import::folder( $dir, array( 'dry_run' => true ) )['albums'][0];

		$this->assertSame( array( '02 - Underground [underground].mp3' ), $album['imported'] );
		$this->assertSame( 0, $album['post'] );
		$this->assertCount( 0, $this->tracks() );
	}

	public function test_a_folder_that_does_not_exist_is_an_error(): void {
		$this->assertWPError( Import::folder( '/no/such/folder' ) );
	}

	public function test_wp_riff_import_reports_each_album_and_a_summary(): void {
		require_once __DIR__ . '/class-riff-test-wp-cli.php';
		WP_CLI::$lines = array();
		$dir           = $this->album_dir( 'compositions', array( '02 - Underground [underground].mp3' ) );

		( new Riff\Cli() )->import( array( $dir ), array( 'status' => 'draft' ) );
		( new Riff\Cli() )->import( array( $dir ), array() );

		$this->assertSame(
			array( 'log', 'success', 'log', 'success' ),
			array_column( WP_CLI::$lines, 0 )
		);
		$this->assertStringEndsWith( ': 1 imported, 0 skipped, 0 failed', WP_CLI::$lines[0][1] );
		$this->assertSame( '1 albums: 1 tracks imported, 0 skipped, 0 failed.', WP_CLI::$lines[1][1] );
		$this->assertSame( '1 albums: 0 tracks imported, 1 skipped, 0 failed.', WP_CLI::$lines[3][1], 'the second run skips it' );
		$this->assertSame( 'draft', get_post_status( get_posts( array( 'post_status' => 'any' ) )[0] ) );
	}

	public function test_wp_riff_import_stops_on_a_missing_folder(): void {
		require_once __DIR__ . '/class-riff-test-wp-cli.php';
		WP_CLI::$lines = array();
		$this->expectException( RuntimeException::class );
		( new Riff\Cli() )->import( array( '/no/such/folder' ), array() );
	}
}
