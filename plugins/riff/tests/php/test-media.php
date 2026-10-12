<?php
/**
 * The one field Riff adds to the Media Library: the video version of an audio file.
 *
 * @package Riff
 */

use Riff\Media;

/**
 * @covers \Riff\Media
 */
class Test_Riff_Media extends Riff_TestCase {

	/**
	 * WP_UnitTestCase unregisters every meta key in its teardown, so only the first test in a run
	 * would otherwise see the registration. Put it back before each one.
	 */
	public function set_up(): void {
		parent::set_up();
		Media::register_meta();
	}

	public function test_the_video_link_is_registered_for_the_rest_api(): void {
		$keys = get_registered_meta_keys( 'post', 'attachment' );
		$this->assertArrayHasKey( Media::VIDEO_META, $keys );
		$this->assertTrue( $keys[ Media::VIDEO_META ]['show_in_rest'] );
		$this->assertSame( 'integer', $keys[ Media::VIDEO_META ]['type'] );
	}

	public function test_only_a_video_attachment_is_kept(): void {
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$image = self::attach( 'cover.png' );
		$this->assertSame( $video, Media::sanitize_video( (string) $video ) );
		$this->assertSame( 0, Media::sanitize_video( $image ) );
		$this->assertSame( 0, Media::sanitize_video( 'nonsense' ) );
		$this->assertSame( 0, Media::sanitize_video( 999999 ) );
	}

	public function test_the_field_appears_on_audio_only_and_shows_the_current_video(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );

		$fields = Media::fields( array(), get_post( $audio ) );
		$this->assertSame( '', $fields['riff_video']['value'] );

		update_post_meta( $audio, Media::VIDEO_META, $video );
		$this->assertSame( wp_get_attachment_url( $video ), Media::fields( array(), get_post( $audio ) )['riff_video']['value'] );

		$this->assertArrayNotHasKey( 'riff_video', Media::fields( array(), get_post( $video ) ) );
	}

	public function test_saving_accepts_an_address_or_an_id_and_clears_on_empty(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$post  = array( 'ID' => $audio );

		Media::save( $post, array( 'riff_video' => wp_get_attachment_url( $video ) ) );
		$this->assertSame( $video, (int) get_post_meta( $audio, Media::VIDEO_META, true ) );

		Media::save( $post, array( 'riff_video' => '' ) );
		$this->assertFalse( metadata_exists( 'post', $audio, Media::VIDEO_META ) );

		Media::save( $post, array( 'riff_video' => (string) $video ) );
		$this->assertSame( $video, (int) get_post_meta( $audio, Media::VIDEO_META, true ) );

		Media::save( $post, array( 'riff_video' => 'https://example.com/not-in-the-library.mp4' ) );
		$this->assertFalse( metadata_exists( 'post', $audio, Media::VIDEO_META ), 'an address outside the library clears it' );
	}
}
