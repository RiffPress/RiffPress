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

	public function test_lyrics_are_a_rest_field_on_the_media_item_and_a_field_of_the_entity(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		do_action( 'rest_api_init' );
		$id      = self::attach( '02 - Underground [underground].mp3' );
		$request = new WP_REST_Request( 'POST', '/wp/v2/media/' . $id );
		$request->set_body_params( array( 'riff_lyrics' => "First line\nSecond line" ) );
		$this->assertSame( 200, rest_do_request( $request )->get_status() );
		$this->assertSame( "First line\nSecond line", wp_get_attachment_metadata( $id )[ Lyrics::KEY ], 'written where WordPress keeps the file\'s own' );
		$read = new WP_REST_Request( 'GET', '/wp/v2/media/' . $id );
		$read->set_param( 'context', 'edit' );
		$this->assertSame( "First line\nSecond line", rest_do_request( $read )->get_data()['riff_lyrics'] );
		$this->assertNull( rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . self::attach( 'cover.png' ) ) )->get_data()['riff_lyrics'], 'an image has no lyrics' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertContains( rest_do_request( $request )->get_status(), array( 401, 403 ) );
		if ( function_exists( 'wp_get_registered_entity_fields' ) ) {
			// The registry fills itself once per request, on first read; Lyrics::register() ran after
			// that in this suite, so it is emptied and reads again with the plugin's hook in place.
			$registry = WP_Entity_Fields_Registry::get_instance();
			foreach ( array( 'initialized' => false, 'fields' => array(), 'field_modules' => array() ) as $name => $value ) { // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
				$property = new ReflectionProperty( $registry, $name );
				$property->setAccessible( true );
				$property->setValue( $registry, $value );
			}
			$fields = array_column( wp_get_registered_entity_fields( 'postType', 'attachment' ), null, 'id' );
			$this->assertSame( 'text', $fields['riff_lyrics']['type'] ?? null, 'and a field of the attachment entity on 7.2' );
		}
	}

	public function test_the_script_loads_only_where_the_player_renders(): void {
		$this->assertFalse( wp_script_is( 'riff-lyrics', 'enqueued' ) );

		do_action( 'riff_before_player' );

		$this->assertTrue( wp_script_is( 'riff-lyrics', 'enqueued' ) );
		$this->assertStringContainsString( 'wp\/v2\/media\/', wp_scripts()->get_inline_script_data( 'riff-lyrics', 'before' ) );
	}
}
