<?php
/**
 * Riff\Archive: where it may write what it takes out of an archive.
 *
 * @package Riff
 */

use Riff\Archive;

/**
 * @covers \Riff\Archive
 */
class Test_Riff_Archive extends Riff_TestCase {

	public function test_an_entry_is_written_only_in_the_temp_folder_or_under_uploads(): void {
		$uploads = wp_get_upload_dir()['basedir'];
		wp_mkdir_p( $uploads );
		$this->assertTrue( Archive::writable_at( get_temp_dir() . 'riff-test-entry' ) );
		$this->assertTrue( Archive::writable_at( $uploads . '/riff-test-entry' ) );
		$this->assertFalse( Archive::writable_at( ABSPATH . 'riff-test-entry' ), 'not WordPress\'s own folder' );
		$this->assertFalse( Archive::writable_at( get_temp_dir() . '../riff-test-entry' ), 'not out of the temp folder by ..' );
		$this->assertFalse( Archive::writable_at( get_temp_dir() . 'no-such-folder/riff-test-entry' ), 'not a folder that is not there' );
	}
}
