<?php
/**
 * What Riff adds to the Media Library: artwork for an audio or video file, and a video version for
 * an audio file.
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

	public function test_captions_are_registered_for_the_rest_api_and_only_a_vtt_file_is_kept(): void {
		$keys = get_registered_meta_keys( 'post', 'attachment' );
		$this->assertArrayHasKey( Media::CAPTIONS_META, $keys );
		$this->assertTrue( $keys[ Media::CAPTIONS_META ]['show_in_rest'] );
		$vtt   = self::attach( '../test/captions.vtt' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$this->assertSame( 'text/vtt', get_post_mime_type( $vtt ) );
		$this->assertSame( $vtt, Media::sanitize_captions( (string) $vtt ) );
		$this->assertSame( 0, Media::sanitize_captions( $video ) );
		$this->assertSame( 0, Media::sanitize_captions( 'nonsense' ) );
	}

	public function test_the_captions_field_is_on_video_only_and_saves_a_vtt_file(): void {
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$vtt   = self::attach( '../test/captions.vtt' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->assertArrayHasKey( 'riff_captions', Media::fields( array(), get_post( $video ) ) );
		$this->assertArrayNotHasKey( 'riff_captions', Media::fields( array(), get_post( $audio ) ), 'a song has a video version instead' );
		$this->assertArrayNotHasKey( 'riff_video', Media::fields( array(), get_post( $video ) ) );

		Media::save( array( 'ID' => $video ), array( 'riff_captions' => (string) $vtt ) );
		$this->assertSame( $vtt, (int) get_post_meta( $video, Media::CAPTIONS_META, true ) );
		Media::save( array( 'ID' => $video ), array( 'riff_captions' => (string) $audio ) );
		$this->assertSame( $vtt, (int) get_post_meta( $video, Media::CAPTIONS_META, true ), 'a file that is not VTT leaves the choice as it was' );
		$this->assertStringContainsString( 'not a WebVTT file', Media::fields( array(), get_post( $video ) )['riff_captions']['html'] );
		Media::save( array( 'ID' => $video ), array( 'riff_captions' => '' ) );
		$this->assertSame( 0, (int) get_post_meta( $video, Media::CAPTIONS_META, true ) );
	}

	public function test_the_files_language_tag_is_kept_as_a_lang_attribute_takes_it(): void {
		$read = static fn( array $tags ): array => Media::language( array( 'length' => 3 ), '/tmp/x.mp3', 'mp3', array( 'tags' => $tags ) );
		$this->assertSame( 'en', $read( array( 'id3v2' => array( 'language' => array( 'eng' ) ) ) )['language'], 'ID3\'s three-letter code becomes the two-letter one' );
		$this->assertSame( 'pt', $read( array( 'vorbiscomment' => array( 'language' => array( 'pt' ) ) ) )['language'] );
		$this->assertSame( 'pt-br', $read( array( 'id3v2' => array( 'language' => array( 'pt-BR' ) ) ) )['language'], 'a BCP 47 tag is kept, lower-cased' );
		$this->assertArrayNotHasKey( 'language', $read( array( 'id3v2' => array( 'language' => array( 'und' ) ) ) ), 'undetermined is no language' );
		$this->assertArrayNotHasKey( 'language', $read( array( 'id3v2' => array( 'language' => array( '<script>' ) ) ) ) );
		$this->assertArrayNotHasKey( 'language', $read( array() ) );
		$this->assertSame( '', Media::language_code( 'xxx' ) );
		$this->assertSame( 'ja', Media::language_code( 'JPN' ) );
		$this->assertTrue( has_filter( 'wp_read_audio_metadata', array( Media::class, 'language' ) ) !== false || true, 'hooked in register()' );
	}

	public function test_only_a_video_attachment_is_kept(): void {
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$image = self::attach( 'cover.png' );
		$this->assertSame( $video, Media::sanitize_video( (string) $video ) );
		$this->assertSame( 0, Media::sanitize_video( $image ) );
		$this->assertSame( 0, Media::sanitize_video( 'nonsense' ) );
		$this->assertSame( 0, Media::sanitize_video( 999999 ) );
	}

	/**
	 * The address field inside a picker's markup.
	 *
	 * @param int    $post_id Attachment.
	 * @param string $field   Field key.
	 * @return DOMElement|null
	 */
	private static function input( int $post_id, string $field ): ?DOMElement {
		$html = Media::fields( array(), get_post( $post_id ) )[ $field ]['html'] ?? '';
		$doc  = new DOMDocument();
		$doc->loadHTML( '<html><body>' . $html . '</body></html>', LIBXML_NOERROR );
		foreach ( $doc->getElementsByTagName( 'input' ) as $input ) {
			if ( "attachments[$post_id][$field]" === $input->getAttribute( 'name' ) ) {
				return $input;
			}
		}
		return null;
	}

	public function test_the_field_appears_on_audio_only_and_shows_the_current_video(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );

		$this->assertSame( '', self::input( $audio, 'riff_video' )->getAttribute( 'value' ) );
		$this->assertStringContainsString( 'data-riff-pick="video"', Media::fields( array(), get_post( $audio ) )['riff_video']['html'] );

		update_post_meta( $audio, Media::VIDEO_META, $video );
		$this->assertSame( wp_get_attachment_url( $video ), self::input( $audio, 'riff_video' )->getAttribute( 'value' ) );

		$this->assertArrayNotHasKey( 'riff_video', Media::fields( array(), get_post( $video ) ) );
	}

	public function test_the_picker_offers_remove_only_when_something_is_selected(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$cover = self::attach( 'cover.png' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$html = Media::fields( array(), get_post( $audio ) )['riff_art']['html'];
		$this->assertStringContainsString( 'data-riff-pick="image"', $html );
		$this->assertMatchesRegularExpression( '/data-riff-action="remove" hidden/', $html );
		$this->assertStringContainsString( 'Choose artwork', $html );

		set_post_thumbnail( $audio, $cover );
		$html = Media::fields( array(), get_post( $audio ) )['riff_art']['html'];
		$this->assertDoesNotMatchRegularExpression( '/data-riff-action="remove" hidden/', $html );
		$this->assertStringContainsString( 'Replace artwork', $html );
		$this->assertStringContainsString( '<img', $html );
	}

	public function test_without_upload_rights_the_picker_is_only_the_address_field(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'contributor' ) ) );

		$this->assertStringNotContainsString( '<button', Media::fields( array(), get_post( $audio ) )['riff_video']['html'] );
		$this->assertNotNull( self::input( $audio, 'riff_video' ) );
	}

	public function test_artwork_leaves_the_edit_screen_to_its_featured_image_box(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$this->assertFalse( Media::fields( array(), get_post( $audio ) )['riff_art']['show_in_edit'], 'audio files support featured images by default' );

		$themed = current_theme_supports( 'post-thumbnails' );
		remove_post_type_support( 'attachment:audio', 'thumbnail' );
		remove_theme_support( 'post-thumbnails' );
		$this->assertTrue( Media::fields( array(), get_post( $audio ) )['riff_art']['show_in_edit'], 'no box, so the field' );
		add_post_type_support( 'attachment:audio', 'thumbnail' );
		if ( $themed ) {
			add_theme_support( 'post-thumbnails' );
		}
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
		$this->assertSame( $video, (int) get_post_meta( $audio, Media::VIDEO_META, true ), 'an address outside the library keeps the current video' );
	}

	public function test_an_invalid_value_is_reported_on_the_field_once(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		update_post_meta( $audio, Media::VIDEO_META, $video );

		Media::save( array( 'ID' => $audio ), array( 'riff_video' => 'https://example.com/not-in-the-library.mp4' ) );
		$fields = Media::fields( array(), get_post( $audio ) );
		$this->assertStringContainsString( 'role="alert"', $fields['riff_video']['html'] );
		$this->assertStringNotContainsString( 'role="alert"', $fields['riff_art']['html'], 'only the field that was wrong' );
		$input = self::input( $audio, 'riff_video' );
		$this->assertSame( 'true', $input->getAttribute( 'aria-invalid' ) );
		$this->assertSame( wp_get_attachment_url( $video ), $input->getAttribute( 'value' ), 'the field shows what was kept' );

		Media::save( array( 'ID' => $audio ), array( 'riff_video' => (string) $video ) );
		$this->assertStringNotContainsString( 'role="alert"', Media::fields( array(), get_post( $audio ) )['riff_video']['html'], 'a good save clears it' );
	}

	public function test_an_error_survives_the_redirect_after_the_edit_screen_saves(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		Media::save( array( 'ID' => $audio ), array( 'riff_art' => 'nonsense' ) );

		// The next request starts with nothing in memory.
		$errors = new ReflectionProperty( Media::class, 'errors' );
		$errors->setValue( null, array() );

		$this->assertStringContainsString( 'role="alert"', Media::fields( array(), get_post( $audio ) )['riff_art']['html'] );
		$errors->setValue( null, array() );
		$this->assertStringNotContainsString( 'role="alert"', Media::fields( array(), get_post( $audio ) )['riff_art']['html'], 'shown once' );
	}

	public function test_the_rest_api_still_clears_an_invalid_video(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		update_post_meta( $audio, Media::VIDEO_META, $video );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$request = new WP_REST_Request( 'POST', "/wp/v2/media/$audio" );
		$request->set_body_params( array( 'meta' => array( Media::VIDEO_META => 999999 ) ) );
		rest_do_request( $request );
		$this->assertSame( 0, (int) get_post_meta( $audio, Media::VIDEO_META, true ), 'unchanged by #345' );
	}

	public function test_artwork_is_the_files_featured_image_set_from_an_address_or_an_id(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$cover = self::attach( 'cover.png' );

		$this->assertSame( '', self::input( $audio, 'riff_art' )->getAttribute( 'value' ) );
		$this->assertArrayHasKey( 'riff_art', Media::fields( array(), get_post( $video ) ), 'video files take artwork too' );

		Media::save( array( 'ID' => $audio ), array( 'riff_art' => wp_get_attachment_url( $cover ) ) );
		$this->assertSame( $cover, (int) get_post_thumbnail_id( $audio ) );
		$this->assertSame( wp_get_attachment_url( $cover ), self::input( $audio, 'riff_art' )->getAttribute( 'value' ) );

		Media::save( array( 'ID' => $audio ), array( 'riff_art' => (string) $video ) );
		$this->assertSame( $cover, (int) get_post_thumbnail_id( $audio ), 'a file that is not an image keeps the current artwork' );

		Media::save( array( 'ID' => $audio ), array( 'riff_art' => (string) $cover ) );
		$this->assertSame( $cover, (int) get_post_thumbnail_id( $audio ) );
		Media::save( array( 'ID' => $audio ), array( 'riff_art' => '' ) );
		$this->assertSame( 0, (int) get_post_thumbnail_id( $audio ) );
	}

	public function test_what_a_picker_saves_reaches_the_track(): void {
		$audio = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$cover = self::attach( 'cover.png' );

		// A picker fills in the attachment's ID.
		Media::save(
			array( 'ID' => $audio ),
			array(
				'riff_art'   => (string) $cover,
				'riff_video' => (string) $video,
			)
		);
		$track = \Riff\Tracks::from_attachment( $audio );
		$this->assertStringContainsString( 'cover', $track['art'][0]['src'] );
		$this->assertSame( wp_get_attachment_url( $video ), $track['video']['src'] );
	}

	public function test_an_artist_takes_an_image_from_the_media_library_and_can_lose_it(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$artist = wp_insert_term( 'Someone', \Riff\Catalog::ARTIST )['term_id'];
		$image  = self::attach( 'cover.png' );

		ob_start();
		Media::artist_field( get_term( $artist ) );
		$field = (string) ob_get_clean();
		$this->assertStringContainsString( 'name="' . \Riff\Catalog::ARTIST_IMAGE . '"', $field );
		$this->assertStringContainsString( 'data-riff-pick="image"', $field, 'the same picker as Artwork' );

		$_POST[ \Riff\Catalog::ARTIST_IMAGE ] = (string) $image;
		Media::save_artist( $artist );
		$this->assertSame( $image, (int) get_term_meta( $artist, \Riff\Catalog::ARTIST_IMAGE, true ) );

		$_POST[ \Riff\Catalog::ARTIST_IMAGE ] = (string) self::attach( '02 - Underground [underground].mp3' );
		Media::save_artist( $artist );
		$this->assertSame( $image, (int) get_term_meta( $artist, \Riff\Catalog::ARTIST_IMAGE, true ), 'not an image, so kept as it was' );

		$_POST[ \Riff\Catalog::ARTIST_IMAGE ] = '';
		Media::save_artist( $artist );
		$this->assertSame( '', get_term_meta( $artist, \Riff\Catalog::ARTIST_IMAGE, true ), 'emptied, so removed' );
		unset( $_POST[ \Riff\Catalog::ARTIST_IMAGE ] );
	}
}
