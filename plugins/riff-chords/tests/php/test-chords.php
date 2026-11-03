<?php
/**
 * Riff Chords.
 *
 * @package Riff\Chords
 */

use Riff\Chords\Chords;

/**
 * Riff\Chords\Chords. The charts are placeholder words, not songs.
 */
class Test_Riff_Chords extends Riff_TestCase {

	private const CHART = "{key: G}\n{start_of_verse: Verse 1}\n[00:01.00][G]First line [C]here\n[00:03.00][D]Second line\n{end_of_verse}";

	public function set_up(): void {
		parent::set_up();
		// Hooked per test; the suite restores every hook afterwards.
		Chords::register();
		// init has run before a test, so the meta is registered here.
		Chords::meta();
	}

	public function test_the_view_is_registered_on_the_server_as_a_screen_of_now_playing(): void {
		$views = Riff\Registry::views( 'screen' );
		$this->assertArrayHasKey( 'chords', $views, 'a screen of Now Playing, registered as Riff registers its own' );
		$this->assertSame( 'Chords', $views['chords']['label'] );
		$this->assertSame( array( 'album', 'turntable', 'chords' ), array_keys( $views ), 'its button after the turntable\'s' );
		$this->assertArrayNotHasKey( 'chords', Riff\Registry::views( 'side' ) );
	}

	public function test_audio_gets_a_chords_field_and_images_do_not(): void {
		$id = self::attach( '02 - Underground [underground].mp3' );
		update_post_meta( $id, Chords::KEY, self::CHART );
		$fields = apply_filters( 'attachment_fields_to_edit', array(), get_post( $id ) );
		$this->assertStringContainsString( esc_textarea( self::CHART ) . '</textarea>', $fields['riff_chords']['html'] );

		$image = self::attach( 'cover.png' );
		$this->assertArrayNotHasKey( 'riff_chords', apply_filters( 'attachment_fields_to_edit', array(), get_post( $image ) ) );
	}

	public function test_the_field_saves_the_chart_as_the_files_meta_and_empty_clears_it(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$id = self::attach( '02 - Underground [underground].mp3' );

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_chords' => wp_slash( self::CHART . "\n<b>Bold</b>" ) ) );
		$this->assertSame( self::CHART . "\nBold", get_post_meta( $id, Chords::KEY, true ), 'kept as typed, line breaks and all, without markup' );
		$this->assertSame( 'Compositions', wp_get_attachment_metadata( $id )['album'], 'the file\'s own metadata is left alone' );

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_chords' => '' ) );
		$this->assertSame( '', get_post_meta( $id, Chords::KEY, true ) );
		$this->assertFalse( metadata_exists( 'post', $id, Chords::KEY ), 'an empty chart is no meta at all' );
	}

	public function test_someone_who_cannot_edit_the_file_cannot_change_its_chart(): void {
		$id = self::attach( '02 - Underground [underground].mp3' );
		update_post_meta( $id, Chords::KEY, self::CHART );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_chords' => 'Vandalised' ) );

		$this->assertSame( self::CHART, get_post_meta( $id, Chords::KEY, true ) );
		$this->assertFalse( current_user_can( 'edit_post_meta', $id, Chords::KEY ), 'and the meta itself says so' );
	}

	public function test_the_chart_is_a_rest_field_on_the_media_item_and_a_field_of_the_entity(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		do_action( 'rest_api_init' );
		$id      = self::attach( '02 - Underground [underground].mp3' );
		$request = new WP_REST_Request( 'POST', '/wp/v2/media/' . $id );
		$request->set_body_params( array( 'riff_chords' => self::CHART ) );
		$this->assertSame( 200, rest_do_request( $request )->get_status() );
		$this->assertSame( self::CHART, get_post_meta( $id, Chords::KEY, true ) );

		// What the tab reads, as a visitor.
		wp_set_current_user( 0 );
		$read = new WP_REST_Request( 'GET', '/wp/v2/media/' . $id );
		$read->set_query_params( array( '_fields' => 'riff_chords' ) );
		$this->assertSame( self::CHART, rest_do_request( $read )->get_data()['riff_chords'] );
		$this->assertNull( rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . self::attach( 'cover.png' ) ) )->get_data()['riff_chords'], 'an image has no chart' );

		// Only someone who can edit the file writes it, and only to a song.
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertContains( rest_do_request( $request )->get_status(), array( 401, 403 ) );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$image = new WP_REST_Request( 'POST', '/wp/v2/media/' . self::attach( 'cover.png' ) );
		$image->set_body_params( array( 'riff_chords' => self::CHART ) );
		$this->assertSame( 400, rest_do_request( $image )->get_status() );

		if ( function_exists( 'wp_get_registered_entity_fields' ) ) {
			// The registry fills itself once per request, on first read; Chords::register() ran after
			// that in this suite, so it is emptied and reads again with the plugin's hook in place.
			$registry = WP_Entity_Fields_Registry::get_instance();
			foreach ( array( 'initialized' => false, 'fields' => array(), 'field_modules' => array() ) as $name => $value ) { // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
				$property = new ReflectionProperty( $registry, $name );
				$property->setValue( $registry, $value );
			}
			$fields = array_column( wp_get_registered_entity_fields( 'postType', 'attachment' ), null, 'id' );
			$this->assertSame( 'text', $fields['riff_chords']['type'] ?? null, 'and a field of the attachment entity on 7.2' );
		}
	}

	public function test_the_scripts_load_only_where_the_player_renders(): void {
		$this->assertFalse( wp_script_is( 'riff-chords', 'enqueued' ) );

		do_action( 'riff_before_player' );

		$this->assertTrue( wp_script_is( 'riff-chords', 'enqueued' ) );
		$this->assertTrue( wp_script_is( 'riff-chords-chart', 'enqueued' ), 'the chart reader comes with it' );
		$this->assertTrue( wp_script_is( 'riff-chords-timing', 'enqueued' ), 'and the timing both read' );
		$config = wp_scripts()->get_inline_script_data( 'riff-chords', 'before' );
		$this->assertStringContainsString( 'wp\/v2\/media\/', $config );
		$this->assertStringNotContainsString( '"edit"', $config, 'a visitor is not shown the way to the field' );
	}
}
