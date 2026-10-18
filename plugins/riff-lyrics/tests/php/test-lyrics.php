<?php
/**
 * Riff Lyrics.
 *
 * @package Riff\Lyrics
 */

use Riff\Lyrics\Lyrics;

/**
 * Riff\Lyrics\Lyrics.
 */
class Test_Riff_Lyrics extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		// Hooked per test; the suite restores every hook afterwards.
		Lyrics::register();
	}

	/**
	 * An audio file whose ID3 tag carries lyrics (a USLT frame), as an upload.
	 *
	 * @return int Attachment ID.
	 */
	private static function with_lyrics(): int {
		$id = self::factory()->attachment->create_upload_object( dirname( __DIR__, 4 ) . '/packages/fixtures/test/lyrics.mp3' );
		self::assertIsInt( $id );
		return $id;
	}

	public function test_the_tab_comes_after_up_next(): void {
		$this->assertSame( array( 'queue', 'lyrics' ), array_keys( Riff\Player::tabs() ) );
		$this->assertSame( 'Lyrics', Riff\Player::tabs()['lyrics']['label'] );
	}

	public function test_wordpress_keeps_the_files_lyrics_and_the_media_route_returns_them(): void {
		$GLOBALS['wp_rest_server'] = null;
		$id                        = self::with_lyrics();

		$this->assertSame( "First line\nSecond line", wp_get_attachment_metadata( $id )[ Lyrics::KEY ], 'core read the USLT frame on upload' );

		wp_set_current_user( 0 );
		$request = new WP_REST_Request( 'GET', '/wp/v2/media/' . $id );
		$request->set_query_params( array( '_fields' => 'media_details' ) );
		$data = rest_do_request( $request )->get_data();
		$this->assertSame( "First line\nSecond line", $data['media_details'][ Lyrics::KEY ], 'what the tab reads, as a visitor' );
	}

	public function test_audio_gets_a_lyrics_field_holding_the_files_lyrics_and_images_do_not(): void {
		$id     = self::with_lyrics();
		$fields = apply_filters( 'attachment_fields_to_edit', array(), get_post( $id ) );
		$this->assertStringContainsString( "First line\nSecond line</textarea>", $fields['riff_lyrics']['html'] );

		$image = self::attach( 'cover.png' );
		$this->assertArrayNotHasKey( 'riff_lyrics', apply_filters( 'attachment_fields_to_edit', array(), get_post( $image ) ) );
	}

	public function test_the_field_saves_into_the_same_metadata_and_empty_clears_it(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$id = self::attach( '02 - Underground [underground].mp3' );

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_lyrics' => "Typed\nby hand <b>" ) );
		$this->assertSame( "Typed\nby hand", wp_get_attachment_metadata( $id )[ Lyrics::KEY ], 'stored where core keeps a file\'s lyrics, tags stripped' );
		$this->assertSame( 'Compositions', wp_get_attachment_metadata( $id )['album'], 'the rest of the metadata stays' );

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_lyrics' => '' ) );
		$this->assertArrayNotHasKey( Lyrics::KEY, wp_get_attachment_metadata( $id ) );
	}

	public function test_someone_who_cannot_edit_the_file_cannot_change_its_lyrics(): void {
		$id = self::with_lyrics();
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_lyrics' => 'Vandalised' ) );

		$this->assertSame( "First line\nSecond line", wp_get_attachment_metadata( $id )[ Lyrics::KEY ] );
	}

	public function test_the_script_loads_only_where_the_player_renders(): void {
		$this->assertFalse( wp_script_is( 'riff-lyrics', 'enqueued' ) );

		do_action( 'riff_before_player' );

		$this->assertTrue( wp_script_is( 'riff-lyrics', 'enqueued' ) );
		$this->assertStringContainsString( 'wp\/v2\/media\/', (string) wp_scripts()->get_data( 'riff-lyrics', 'before' )[1] );
	}
}
