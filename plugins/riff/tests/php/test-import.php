<?php
/**
 * Folder import.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Import;
use Riff\Media;
use Riff\Protect;

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
	 * @param string                    $name  The folder's name, which may hold a subfolder ("label/album").
	 * @param array<int|string, string> $files Fixture file names to copy in, each under its own name,
	 *                                         or under the name given as its key.
	 * @return string The folder.
	 */
	private function album_dir( string $name, array $files ): string {
		$root = sys_get_temp_dir() . '/riff-import-' . wp_generate_password( 8, false );
		$dir  = $root . '/' . $name;
		mkdir( $dir, 0777, true );
		foreach ( $files as $as => $file ) {
			copy( self::fixture( $file ), $dir . '/' . ( is_string( $as ) ? $as : $file ) );
		}
		$this->dirs[] = $root;
		return $dir;
	}

	/**
	 * A zip under a fresh temporary folder.
	 *
	 * @param array<string, string> $entries Each entry's name in the zip, and the fixture file it
	 *                                       holds, or its contents when no fixture has that name.
	 * @return string The zip.
	 */
	private function zip_of( array $entries ): string {
		$root = sys_get_temp_dir() . '/riff-import-' . wp_generate_password( 8, false );
		mkdir( $root );
		$this->dirs[] = $root;
		$file         = $root . '/Compositions.zip';
		$zip          = new ZipArchive();
		$zip->open( $file, ZipArchive::CREATE );
		foreach ( $entries as $name => $source ) {
			if ( is_file( self::fixture( $source ) ) ) {
				$zip->addFile( self::fixture( $source ), $name );
			} else {
				$zip->addFromString( $name, $source );
			}
		}
		$zip->close();
		return $file;
	}

	/**
	 * The folders zip() unpacks into, left in the temporary folder.
	 *
	 * @return string[]
	 */
	private function unpacked(): array {
		return (array) glob( get_temp_dir() . 'riff-zip-*' );
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
				'01 - Intensities in Ten Cities [intensities].webm' => '../test/pattern.webm',
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

	public function test_a_name_in_a_folder_or_a_file_never_reaches_a_title_as_markup(): void {
		// Someone allowed unfiltered HTML is who core's own filtering would let it past.
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$strip = static function ( $meta ) {
			unset( $meta['title'], $meta['album'] );
			return $meta;
		};
		add_filter( 'wp_read_audio_metadata', $strip );
		$result = Import::folder( $this->album_dir( '<svg onload=alert(1)>Album', array( '<svg onload=alert(1)>Song.mp3' => '02 - Underground [underground].mp3' ) ) );
		remove_filter( 'wp_read_audio_metadata', $strip );

		$this->assertIsArray( $result );
		$album = $result['albums'][0];
		$this->assertStringNotContainsString( '<', get_the_title( $album['post'] ) );
		$this->assertNotSame( '', get_the_title( $album['post'] ) );
		foreach ( get_attached_media( 'audio', $album['post'] ) as $track ) {
			$this->assertStringNotContainsString( '<', $track->post_title );
		}
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

	public function test_the_same_file_in_two_folders_of_one_run_is_imported_once(): void {
		$dir = $this->album_dir( 'label/one', array( '02 - Underground [underground].mp3' ) );
		mkdir( dirname( $dir ) . '/two' );
		copy( self::fixture( '02 - Underground [underground].mp3' ), dirname( $dir ) . '/two/02 - Underground [underground].mp3' );

		$result = Import::folder( dirname( $dir ) );

		$this->assertSame( array( '02 - Underground [underground].mp3' ), $result['albums'][0]['imported'] );
		$this->assertSame( array( '02 - Underground [underground].mp3' ), $result['albums'][1]['skipped'], 'found among what this run imported' );
		$this->assertCount( 1, $this->tracks() );
	}

	public function test_an_albums_tracks_are_counted_once_the_run_is_done(): void {
		$dir = $this->album_dir( 'compositions', array( '02 - Underground [underground].mp3', '03 - Trombone Detritus [detritus].mp3' ) );

		Import::folder( $dir );

		$this->assertFalse( wp_defer_term_counting(), 'counting is not left put off' );
		$album = wp_get_object_terms( $this->tracks()[0], Catalog::ALBUM )[0];
		$this->assertSame( 2, (int) get_term( $album->term_id, Catalog::ALBUM )->count );
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

	public function test_a_zip_is_imported_as_its_folder_would_be_and_unpacked_nowhere_after(): void {
		$before = $this->unpacked();
		$zip    = $this->zip_of(
			array(
				'Compositions/02 - Underground [underground].mp3' => '02 - Underground [underground].mp3',
				'Compositions/cover.png'            => 'cover.png',
				'Compositions/notes.txt'            => 'liner notes',
				'__MACOSX/Compositions/._cover.png' => 'resource fork',
			)
		);

		$result = Import::zip( $zip );

		$this->assertIsArray( $result );
		$this->assertCount( 1, $result['albums'] );
		$album = $result['albums'][0];
		$this->assertSame( array( '02 - Underground [underground].mp3' ), $album['imported'] );
		$this->assertSame( realpath( $zip ) . '/Compositions', $album['folder'], 'named by the zip, not where it was unpacked' );
		$this->assertGreaterThan( 0, (int) get_post_thumbnail_id( $album['post'] ), 'the cover in the zip is the artwork' );
		$this->assertCount( 1, $this->tracks(), 'only the audio is imported; the notes and the resource fork are not' );
		$this->assertSame( $before, $this->unpacked(), 'the folder it was unpacked into is gone' );
	}

	public function test_a_zip_is_private_its_tracks_and_videos_protected_and_its_post_private(): void {
		$zip = $this->zip_of(
			array(
				'01 - Intensities in Ten Cities [intensities].mp3' => '01 - Intensities in Ten Cities [intensities].mp3',
				'01 - Intensities in Ten Cities [intensities].webm' => '../test/pattern.webm',
				'cover.png' => 'cover.png',
			)
		);

		$album = Import::zip( $zip )['albums'][0];

		$this->assertSame( array(), $album['failed'] );
		$track = $this->tracks()[0];
		$video = (int) get_post_meta( $track, Media::VIDEO_META, true );
		$this->assertGreaterThan( 0, $video, 'paired' );
		$this->assertSame( 'private', get_post_status( $album['post'] ) );
		$this->assertTrue( Protect::is( $track ) );
		$this->assertTrue( Protect::is( $video ), 'its video too' );
		$this->assertSame( Protect::address( $track ), wp_get_attachment_url( $track ) );
		$this->assertStringContainsString( Protect::address( $track ), get_post_field( 'post_content', $album['post'] ), 'the post plays it at its protected address' );
		$this->assertFalse( Protect::is( (int) get_post_thumbnail_id( $album['post'] ) ), 'a cover keeps its public address, as on a private site' );
	}

	public function test_a_zip_imported_as_public_is_public(): void {
		$zip = $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) );

		$album = Import::zip( $zip, array( 'private' => false ) )['albums'][0];

		$this->assertSame( 'publish', get_post_status( $album['post'] ) );
		$this->assertFalse( Protect::is( $this->tracks()[0] ) );
	}

	public function test_a_track_that_cannot_be_protected_is_not_left_public(): void {
		$refuse = static fn() => new WP_Error( 'riff_test_storage', 'The storage cannot make it private.' );
		add_filter( 'riff_protect_storage', $refuse );
		$zip    = $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) );

		$album = Import::zip( $zip )['albums'][0];
		remove_filter( 'riff_protect_storage', $refuse );

		$this->assertSame( array( '02 - Underground [underground].mp3' => 'The storage cannot make it private.' ), $album['failed'] );
		$this->assertCount( 0, $this->tracks(), 'deleted again, not left at a public address' );
		$this->assertSame( 0, $album['post'] );
	}

	public function test_a_zip_imported_again_finds_its_album_and_imports_nothing_twice(): void {
		$zip   = $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) );
		$first = Import::zip( $zip );

		$again = Import::zip( $zip );

		$this->assertSame( array( '02 - Underground [underground].mp3' ), $again['albums'][0]['skipped'] );
		$this->assertSame( $first['albums'][0]['post'], $again['albums'][0]['post'], 'the same post, found by the zip' );
		$this->assertCount( 1, $this->tracks() );
		$this->assertCount( 1, get_posts( array( 'post_status' => 'any' ) ) );
	}

	public function test_files_at_the_top_of_a_zip_are_named_by_the_zip(): void {
		$zip = $this->zip_of( array( 'Broken.mp3' => 'not audio at all' ) );

		$album = Import::zip( $zip )['albums'][0];

		$this->assertSame( realpath( $zip ), $album['folder'] );
		$this->assertArrayHasKey( 'Broken.mp3', $album['failed'] );
	}

	public function test_a_zip_cannot_write_outside_the_folder_it_is_unpacked_into(): void {
		$before = $this->unpacked();
		$name   = 'riff-escaped-' . wp_generate_password( 8, false ) . '.php';
		$zip    = $this->zip_of(
			array(
				'../' . $name                        => '<?php echo "escaped";',
				'../../' . $name                     => '<?php echo "escaped";',
				'02 - Underground [underground].mp3' => '02 - Underground [underground].mp3',
			)
		);

		$result = Import::zip( $zip );

		$this->assertIsArray( $result );
		$this->assertFileDoesNotExist( get_temp_dir() . $name );
		$this->assertFileDoesNotExist( dirname( get_temp_dir() ) . '/' . $name );
		$this->assertSame( array( '02 - Underground [underground].mp3' ), $result['albums'][0]['imported'], 'the rest is imported' );
		$this->assertSame( $before, $this->unpacked() );
	}

	public function test_a_zip_that_unpacks_to_far_more_than_it_holds_is_refused(): void {
		$before = $this->unpacked();
		$zip    = $this->zip_of( array( '01 - Silence.wav' => str_repeat( "\0", 4 * MB_IN_BYTES ) ) );

		$result = Import::zip( $zip );

		$this->assertWPError( $result );
		$this->assertSame( 'riff_import_zip', $result->get_error_code() );
		$this->assertCount( 0, $this->tracks() );
		$this->assertSame( $before, $this->unpacked() );
	}

	public function test_a_file_that_is_not_a_zip_is_an_error(): void {
		$dir = $this->album_dir( 'compositions', array( '02 - Underground [underground].mp3' ) );

		$this->assertWPError( Import::zip( $dir . '/02 - Underground [underground].mp3' ) );
		$this->assertWPError( Import::zip( '/no/such/file.zip' ) );
		$this->assertCount( 0, $this->tracks() );
	}

	public function test_a_zip_uploaded_to_the_media_library_is_imported_in_the_background_privately(): void {
		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		wp_set_current_user( $editor );
		$id = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ) );

		$this->assertNotFalse( wp_next_scheduled( Import::ZIP_JOB, array( $id ) ), 'queued, not imported during the upload' );
		$this->assertCount( 0, $this->tracks() );

		wp_set_current_user( 0 );
		$result = Import::uploaded_zip( $id );

		$this->assertIsArray( $result );
		$post = get_post( $result['albums'][0]['post'] );
		$this->assertSame( 'private', $post->post_status, 'private, for the person who uploaded it to publish if it is theirs to' );
		$this->assertSame( $editor, (int) $post->post_author );
		$this->assertCount( 1, $this->tracks() );
		$this->assertTrue( Protect::is( $this->tracks()[0] ), 'the track is Protected' );
		$this->assertSame( $post->ID, (int) get_post( $id )->post_parent, 'the zip stays, attached to its album' );
		$this->assertSame( 0, get_current_user_id(), 'the job puts back who was signed in' );
	}

	public function test_a_host_can_have_a_zip_uploaded_to_the_media_library_import_publicly(): void {
		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		wp_set_current_user( $editor );
		$id   = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ) );
		$seen = array();
		$ask  = static function ( $private_by_default, $zip, $author ) use ( &$seen ) {
			$seen = array( $private_by_default, $zip, $author );
			return false;
		};
		add_filter( 'riff_import_private', $ask, 10, 3 );

		$result = Import::uploaded_zip( $id );
		remove_filter( 'riff_import_private', $ask, 10 );

		$this->assertSame( array( true, $id, $editor ), $seen, 'asked with the default, the zip and its uploader' );
		$this->assertSame( 'publish', get_post_status( $result['albums'][0]['post'] ) );
		$this->assertFalse( Protect::is( $this->tracks()[0] ), 'the track is not Protected' );
	}

	public function test_a_zip_a_storage_plugin_keeps_elsewhere_is_brought_here_and_imported(): void {
		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		wp_set_current_user( $editor );
		$id = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ) );

		// As an offloading plugin leaves it: the attachment's path is a stream, which ZipArchive can't open.
		require_once __DIR__ . '/class-riff-test-elsewhere.php';
		stream_wrapper_register( 'riffelsewhere', Riff_Test_Elsewhere::class );
		$elsewhere = static fn( $file, $attachment ) => $attachment === $id ? 'riffelsewhere://' . $file : $file;
		add_filter( 'get_attached_file', $elsewhere, 10, 2 );
		$before    = glob( get_temp_dir() . '*' );
		try {
			$result = Import::uploaded_zip( $id );
		} finally {
			remove_filter( 'get_attached_file', $elsewhere, 10 );
			stream_wrapper_unregister( 'riffelsewhere' );
		}

		$this->assertIsArray( $result );
		$this->assertSame( 'private', get_post_status( $result['albums'][0]['post'] ) );
		$this->assertCount( 1, $this->tracks() );
		$this->assertSame( $result['albums'][0]['post'], (int) get_post( $id )->post_parent, 'the zip is attached to its album' );
		$this->assertSame( $before, glob( get_temp_dir() . '*' ), 'the copy brought here is removed' );
	}

	public function test_a_zip_kept_elsewhere_that_cannot_be_read_is_an_error(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$id = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ) );

		require_once __DIR__ . '/class-riff-test-elsewhere.php';
		stream_wrapper_register( 'riffelsewhere', Riff_Test_Elsewhere::class );
		$gone = static fn( $file, $attachment ) => $attachment === $id ? 'riffelsewhere:///nowhere/gone.zip' : $file;
		add_filter( 'get_attached_file', $gone, 10, 2 );
		try {
			$result = Import::uploaded_zip( $id );
		} finally {
			remove_filter( 'get_attached_file', $gone, 10 );
			stream_wrapper_unregister( 'riffelsewhere' );
		}

		$this->assertWPError( $result );
		$this->assertCount( 0, $this->tracks() );
	}

	public function test_a_zip_uploaded_to_a_post_or_by_someone_who_cannot_write_posts_is_left_alone(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$post     = self::factory()->post->create();
		$download = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ), $post );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$theirs = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ) );

		$this->assertFalse( wp_next_scheduled( Import::ZIP_JOB, array( $download ) ), 'a File block\'s download stays a download' );
		$this->assertFalse( wp_next_scheduled( Import::ZIP_JOB, array( $theirs ) ) );
		$this->assertNull( Import::uploaded_zip( $download ) );
		$this->assertNull( Import::uploaded_zip( $theirs ) );
		$this->assertCount( 0, $this->tracks() );
	}

	public function test_a_zip_uploaded_by_the_same_name_never_adds_to_someone_elses_album(): void {
		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		wp_set_current_user( $editor );
		$first = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ) );
		$album = Import::uploaded_zip( $first )['albums'][0]['post'];
		// The editor tidies up: the zip goes, and its path in uploads is free again.
		wp_delete_attachment( $first, true );

		$author = self::factory()->user->create( array( 'role' => 'author' ) );
		wp_set_current_user( $author );
		$second = self::factory()->attachment->create_upload_object( $this->zip_of( array( '03 - Trombone Detritus [detritus].mp3' => '03 - Trombone Detritus [detritus].mp3' ) ) );
		$theirs = Import::uploaded_zip( $second )['albums'][0]['post'];

		$this->assertNotSame( $album, $theirs, 'an album of its own' );
		$this->assertSame( $author, (int) get_post( $theirs )->post_author );
		$this->assertSame( 1, substr_count( get_post_field( 'post_content', $album ), '<!-- wp:audio' ), 'the editor\'s album is as it was' );
	}

	public function test_a_zip_imported_by_someone_leaves_a_video_they_cannot_edit_as_it_was(): void {
		$dir = $this->album_dir(
			'compositions',
			array(
				'01 - Intensities in Ten Cities [intensities].mp3',
				'01 - Intensities in Ten Cities [intensities].webm' => '../test/pattern.webm',
			)
		);
		Import::folder( $dir );
		$video = (int) get_post_meta( $this->tracks()[0], Media::VIDEO_META, true );
		$title = get_the_title( $video );
		$this->assertGreaterThan( 0, $video );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$zip = $this->zip_of(
			array(
				'Theirs.mp3'  => '02 - Underground [underground].mp3',
				'Theirs.webm' => '../test/pattern.webm',
			)
		);
		Import::zip( $zip, array( 'status' => 'draft' ) );

		$this->assertSame( $title, get_the_title( $video ), 'not retitled by someone who cannot edit it' );
		$this->assertSame( $video, (int) get_post_meta( $this->tracks()[1], Media::VIDEO_META, true ), 'their track still names it as its video' );
	}

	public function test_wp_riff_import_takes_a_zip(): void {
		require_once __DIR__ . '/class-riff-test-wp-cli.php';
		WP_CLI::$lines = array();
		$zip           = $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) );

		( new Riff\Cli() )->import( array( $zip ), array() );

		$this->assertSame( array( 'log', 'success' ), array_column( WP_CLI::$lines, 0 ) );
		$this->assertSame( '1 albums: 1 tracks imported, 0 skipped, 0 failed.', WP_CLI::$lines[1][1] );
		$this->assertSame( 'private', get_post_status( get_posts( array( 'post_status' => 'any' ) )[0] ), 'a zip is private unless it is said not to be' );
		$this->assertTrue( Protect::is( $this->tracks()[0] ) );
	}

	public function test_wp_riff_import_no_private_imports_an_artists_own_zip_publicly(): void {
		require_once __DIR__ . '/class-riff-test-wp-cli.php';
		WP_CLI::$lines = array();
		$zip           = $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) );

		( new Riff\Cli() )->import( array( $zip ), array( 'private' => false ) );

		$this->assertSame( 'publish', get_post_status( get_posts()[0] ) );
		$this->assertFalse( Protect::is( $this->tracks()[0] ) );
	}

	public function test_wp_riff_import_private_imports_a_folder_privately(): void {
		require_once __DIR__ . '/class-riff-test-wp-cli.php';
		WP_CLI::$lines = array();
		$dir           = $this->album_dir( 'compositions', array( '02 - Underground [underground].mp3' ) );

		( new Riff\Cli() )->import( array( $dir ), array( 'private' => true ) );

		$this->assertSame( 'private', get_post_status( get_posts( array( 'post_status' => 'any' ) )[0] ) );
		$this->assertTrue( Protect::is( $this->tracks()[0] ) );
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

	/**
	 * Asks POST /riff/v1/imports to import an attachment.
	 *
	 * @param int $id Attachment ID.
	 * @return WP_REST_Response
	 */
	private static function queue_over_rest( int $id ): WP_REST_Response {
		$request = new WP_REST_Request( 'POST', '/riff/v1/imports' );
		$request->set_body_params( array( 'attachment' => $id ) );
		return rest_do_request( $request );
	}

	public function test_rest_queues_a_zip_in_the_media_library_once(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$id = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ) );
		// As if uploaded somewhere that did not queue it, as an assistant's upload over REST is.
		wp_clear_scheduled_hook( Import::ZIP_JOB, array( $id ) );

		$first = self::queue_over_rest( $id );
		$this->assertSame( 202, $first->get_status() );
		$this->assertSame( $id, $first->get_data()['attachment'] );
		$this->assertNotFalse( wp_next_scheduled( Import::ZIP_JOB, array( $id ) ) );

		$again = self::queue_over_rest( $id );
		$this->assertSame( $first->get_data()['queued'], $again->get_data()['queued'], 'asked twice, queued once' );
		$this->assertCount( 0, $this->tracks(), 'nothing imported during the request' );
	}

	public function test_rest_refuses_whoever_cannot_write_posts_or_edit_the_zip(): void {
		$owner = self::factory()->user->create( array( 'role' => 'author' ) );
		wp_set_current_user( $owner );
		$id = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ) );
		wp_clear_scheduled_hook( Import::ZIP_JOB, array( $id ) );

		wp_set_current_user( 0 );
		$this->assertSame( 401, self::queue_over_rest( $id )->get_status(), 'a visitor' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertSame( 403, self::queue_over_rest( $id )->get_status(), 'a subscriber' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$this->assertSame( 403, self::queue_over_rest( $id )->get_status(), 'another author, whose zip it isn\'t' );
		$this->assertFalse( wp_next_scheduled( Import::ZIP_JOB, array( $id ) ), 'and nothing was queued' );
	}

	public function test_rest_says_why_for_a_file_that_is_not_a_zip_or_a_zip_on_a_post(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$track = self::attach( '02 - Underground [underground].mp3' );
		$this->assertSame( 400, self::queue_over_rest( $track )->get_status(), 'a track' );
		$this->assertSame( 400, self::queue_over_rest( 999999 )->get_status(), 'nothing at all' );

		$post     = self::factory()->post->create();
		$download = self::factory()->attachment->create_upload_object( $this->zip_of( array( '02 - Underground [underground].mp3' => '02 - Underground [underground].mp3' ) ), $post );
		$attached = self::queue_over_rest( $download );
		$this->assertSame( 409, $attached->get_status(), 'a File block\'s download, or one already imported' );
		$this->assertSame( 'riff_import_zip', $attached->as_error()->get_error_code() );
		$this->assertFalse( wp_next_scheduled( Import::ZIP_JOB, array( $download ) ) );
	}
}
