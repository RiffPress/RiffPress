<?php
/**
 * Riff Sing.
 *
 * @package Riff\Sing
 */

use Riff\Sing\Sing;

/**
 * Riff\Sing\Sing.
 */
class Test_Riff_Sing extends Riff_TestCase {

	/**
	 * Two notes, one phrase: a chart small enough to read at a glance.
	 */
	private const CHART = "#TITLE:Test\n#BPM:120\n#GAP:0\n: 0 4 0 Do\n: 4 4 2 Re\nE";

	public function set_up(): void {
		parent::set_up();
		// Hooked per test; the suite restores every hook afterwards. The meta is registered on init,
		// which has run, so it is registered here.
		Sing::register();
		Sing::register_meta();
	}

	private static function song(): int {
		return self::attach( '02 - Underground [underground].mp3' );
	}

	public function test_the_view_is_registered_on_the_server_as_a_screen_of_now_playing(): void {
		$views = Riff\Registry::views( 'screen' );
		$this->assertArrayHasKey( 'sing', $views, 'a screen of Now Playing, registered as Riff registers its own' );
		$this->assertSame( 'Sing', $views['sing']['label'] );
		$this->assertSame( array( 'album', 'turntable', 'sing' ), array_keys( $views ), 'its button after the turntable\'s' );
		$this->assertArrayNotHasKey( 'sing', Riff\Registry::views( 'side' ) );
	}

	public function test_audio_gets_a_melody_field_and_images_do_not(): void {
		$id = self::song();
		update_post_meta( $id, Sing::KEY, self::CHART );
		$fields = apply_filters( 'attachment_fields_to_edit', array(), get_post( $id ) );
		$this->assertStringContainsString( esc_textarea( self::CHART ) . '</textarea>', $fields['riff_sing_melody']['html'] );
		$this->assertStringContainsString( 'name="attachments[' . $id . '][riff_sing_melody]"', $fields['riff_sing_melody']['html'] );

		$image = self::attach( 'cover.png' );
		$this->assertArrayNotHasKey( 'riff_sing_melody', apply_filters( 'attachment_fields_to_edit', array(), get_post( $image ) ) );
	}

	public function test_the_field_saves_plain_text_and_empty_clears_it(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$id = self::song();

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_sing_melody' => wp_slash( str_replace( "\n", "\r\n", self::CHART ) . '<script>alert(1)</script> <b>x</b>' ) ) );
		$this->assertSame( self::CHART . ' x', Sing::melody( $id ), 'Unix line ends, markup stripped' );

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_sing_melody' => '' ) );
		$this->assertSame( '', Sing::melody( $id ) );
		$this->assertFalse( metadata_exists( 'post', $id, Sing::KEY ), 'nothing is kept for no melody' );
	}

	public function test_someone_who_cannot_edit_the_file_cannot_change_its_melody(): void {
		$id = self::song();
		update_post_meta( $id, Sing::KEY, self::CHART );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		apply_filters( 'attachment_fields_to_save', array( 'ID' => $id ), array( 'riff_sing_melody' => 'Vandalised' ) );

		$this->assertSame( self::CHART, Sing::melody( $id ) );
	}

	public function test_a_melody_keeps_what_ultrastar_writes(): void {
		$chart = "#MP3:My%20Song.mp3\n#BPM:120\n: 0 4 0 I\n: 4 4 2  <3\n: 8 4 4  <oh\n: 12 4 4 ->";
		$this->assertSame( $chart, Sing::clean( $chart ), 'a %xx pair, the space that starts a word, and a lone < or > on different lines' );
	}

	public function test_a_melody_is_kept_to_a_songs_length(): void {
		$this->assertSame( Sing::MAX, mb_strlen( Sing::clean( str_repeat( ': 0 1 0 la' . "\n", Sing::MAX ) ) ) );
		$this->assertSame( '', Sing::clean( array( 'not text' ) ) );
	}

	public function test_the_melody_is_a_rest_field_visitors_read_and_editors_write(): void {
		$GLOBALS['wp_rest_server'] = null;
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		do_action( 'rest_api_init' );
		$id      = self::song();
		$request = new WP_REST_Request( 'POST', '/wp/v2/media/' . $id );
		$request->set_body_params( array( 'riff_sing_melody' => self::CHART ) );
		$this->assertSame( 200, rest_do_request( $request )->get_status() );
		$this->assertSame( self::CHART, Sing::melody( $id ), 'kept as the attachment\'s meta' );

		$image = self::attach( 'cover.png' );
		$this->assertNull( rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . $image ) )->get_data()['riff_sing_melody'], 'an image has no melody' );
		$onto = new WP_REST_Request( 'POST', '/wp/v2/media/' . $image );
		$onto->set_body_params( array( 'riff_sing_melody' => self::CHART ) );
		$this->assertSame( 400, rest_do_request( $onto )->get_status(), 'nor can one be given one' );
		$onto->set_body_params( array( 'riff_sing_melody' => '' ) );
		$this->assertSame( 200, rest_do_request( $onto )->get_status(), 'though an empty one, as a form sends, saves' );

		// What the tab reads, as a visitor.
		wp_set_current_user( 0 );
		$read = new WP_REST_Request( 'GET', '/wp/v2/media/' . $id );
		$read->set_query_params( array( '_fields' => 'riff_sing_melody' ) );
		$this->assertSame( self::CHART, rest_do_request( $read )->get_data()['riff_sing_melody'] );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$request->set_body_params( array( 'riff_sing_melody' => 'Vandalised' ) );
		$this->assertContains( rest_do_request( $request )->get_status(), array( 401, 403 ) );
		$this->assertSame( self::CHART, Sing::melody( $id ) );
	}

	public function test_the_melody_is_not_core_meta_over_rest(): void {
		$GLOBALS['wp_rest_server'] = null;
		do_action( 'rest_api_init' );
		$id = self::song();
		update_post_meta( $id, Sing::KEY, self::CHART );
		$meta = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . $id ) )->get_data()['meta'] ?? array();
		$this->assertArrayNotHasKey( Sing::KEY, (array) $meta, 'one way in and out: the riff_sing_melody field' );
	}

	public function test_the_script_loads_only_where_the_player_renders_and_says_where_its_worklet_is(): void {
		$this->assertFalse( wp_script_is( 'riff-sing', 'enqueued' ) );

		do_action( 'riff_before_player' );

		$this->assertTrue( wp_script_is( 'riff-sing', 'enqueued' ) );
		$this->assertTrue( wp_script_is( 'riff-sing-melody', 'enqueued' ), 'its melody reader with it' );
		$this->assertTrue( wp_script_is( 'riff-sing-timing', 'enqueued' ), 'and the timing it follows the song with' );
		$this->assertContains( 'riff-tokens', wp_styles()->registered['riff-sing']->deps );
		$data = wp_scripts()->get_inline_script_data( 'riff-sing', 'before' );
		$this->assertStringContainsString( 'wp\/v2\/media\/', $data );
		$this->assertStringContainsString( 'riff-sing\/assets\/pitch.js', $data );
		$this->assertStringContainsString( 'nothing is recorded or sent', $data, 'the panel says the voice stays on the device' );
		$this->assertStringNotContainsString( '"nonce"', $data, 'a visitor has no nonce' );
		$this->assertStringNotContainsString( '"edit"', $data, 'nor a way to the Media Library' );
	}
}
