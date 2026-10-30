<?php
/**
 * A song's streaming version: a smaller copy the player streams in its place.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Media;
use Riff\Protect;
use Riff\Protected_Files;
use Riff\Tracks;
use Riff\Transcode;

/**
 * Riff\Media's streaming version, as Tracks plays it, the catalogue files it and Protect signs it.
 */
class Test_Riff_Stream extends Riff_TestCase {

	/**
	 * A published post.
	 *
	 * @var int
	 */
	private int $post = 0;

	/**
	 * The song.
	 *
	 * @var int
	 */
	private int $song = 0;

	/**
	 * A smaller copy of it.
	 *
	 * @var int
	 */
	private int $version = 0;

	public function set_up(): void {
		parent::set_up();
		Media::register_meta();
		$this->post    = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->song    = self::attach( '02 - Underground [underground].mp3', $this->post );
		$this->version = self::attach( '03 - Trombone Detritus [detritus].mp3', $this->post );
	}

	public function tear_down(): void {
		Protected_Files::unprotect( $this->song );
		Protected_Files::unprotect( $this->version );
		parent::tear_down();
	}

	public function test_the_version_plays_in_the_songs_place_and_says_what_it_is(): void {
		$meta = wp_get_attachment_metadata( $this->song );
		$meta = array_merge(
			$meta,
			array(
				'lossless'    => true,
				'riff_levels' => '0123456789',
			)
		);
		wp_update_attachment_metadata( $this->song, $meta );

		Media::link_stream( $this->song, $this->version );
		$track = Tracks::from_attachment( $this->song, $this->post );

		$this->assertSame( wp_get_attachment_url( $this->version ), $track['src'], 'the version streams' );
		$this->assertSame( (string) $this->song, $track['id'], 'and the track is still the song' );
		$this->assertSame( 'Underground', $track['title'] );
		$this->assertSame( (float) $meta['length'], (float) $track['duration'] );
		$this->assertSame( '0123456789', $track['levels'], 'its levels the song\'s' );
		$this->assertFalse( $track['lossless'], 'its quality the version\'s, which is what plays' );

		Media::link_stream( $this->song, 0 );
		$this->assertSame( wp_get_attachment_url( $this->song ), Tracks::from_attachment( $this->song, $this->post )['src'] );
	}

	public function test_a_version_is_not_a_track_of_its_own_until_it_is_no_longer_one(): void {
		$this->assertNotEmpty( wp_get_object_terms( $this->version, Catalog::ALBUM ) );

		Media::link_stream( $this->song, $this->version );

		$this->assertTrue( Media::streamed( $this->version ) );
		$this->assertFalse( Media::streamed( $this->song ) );
		$this->assertSame( array(), wp_get_object_terms( $this->version, Catalog::ALBUM ), 'off its album' );
		$this->assertSame( array(), wp_get_object_terms( $this->version, Catalog::ARTIST ), 'and its artist' );
		do_action( 'rest_api_init' );
		$ids = wp_list_pluck( rest_do_request( new WP_REST_Request( 'GET', '/' . \Riff\Library::REST . '/tracks' ) )->get_data()['items'], 'id' );
		$this->assertContains( (string) $this->song, $ids );
		$this->assertNotContains( (string) $this->version, $ids, 'not listed beside the song it is' );

		Media::link_stream( $this->song, 0 );
		$this->assertNotEmpty( wp_get_object_terms( $this->version, Catalog::ALBUM ), 'filed again' );
	}

	public function test_a_protected_song_streams_only_a_protected_version_signed_for_the_listener(): void {
		Media::link_stream( $this->song, $this->version );
		Protected_Files::protect( $this->song );

		$this->assertSame( 0, Media::stream( $this->song ), 'not from a file anyone can load' );
		$this->assertStringContainsString( 'riff-file=' . $this->song . '&', Tracks::from_attachment( $this->song, $this->post )['src'] );

		Protected_Files::protect( $this->version );
		$this->assertSame( $this->version, Media::stream( $this->song ) );
		$this->assertStringContainsString( 'riff-file=' . $this->version . '&', Tracks::from_attachment( $this->song, $this->post )['src'], 'the version, signed' );
	}

	public function test_an_address_a_filter_puts_in_place_is_left_as_it_is(): void {
		Protected_Files::protect( $this->song );
		$service = static function ( $track ) {
			$track['src'] = 'https://stream.example.org/underground.m3u8';
			return $track;
		};
		add_filter( 'riff_track', $service );
		$src = Tracks::from_attachment( $this->song, $this->post )['src'];
		remove_filter( 'riff_track', $service );

		$this->assertSame( 'https://stream.example.org/underground.m3u8', $src, 'a service\'s own, not signed over' );
		$this->assertTrue( Protect::is( $this->song ) );
	}

	public function test_the_media_library_field_takes_another_audio_file_only(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$fields = Media::fields( array(), get_post( $this->song ) );
		$this->assertArrayHasKey( 'riff_stream', $fields );
		$this->assertArrayNotHasKey( 'riff_stream', Media::fields( array(), get_post( self::attach( '01 - Intensities in Ten Cities [intensities].webm' ) ) ), 'a video has none' );

		Media::save( array( 'ID' => $this->song ), array( 'riff_stream' => (string) $this->version ) );
		$this->assertSame( $this->version, Media::stream( $this->song ) );

		Media::save( array( 'ID' => $this->song ), array( 'riff_stream' => (string) $this->song ) );
		$this->assertSame( $this->version, Media::stream( $this->song ), 'not itself' );
		Media::save( array( 'ID' => $this->song ), array( 'riff_stream' => (string) self::attach( 'cover.png' ) ) );
		$this->assertSame( $this->version, Media::stream( $this->song ), 'nor an image' );

		Media::save( array( 'ID' => $this->song ), array( 'riff_stream' => '' ) );
		$this->assertSame( 0, Media::stream( $this->song ) );
	}

	public function test_a_lossless_song_or_one_sent_well_above_the_versions_rate_is_worth_one(): void {
		$meta = wp_get_attachment_metadata( $this->song );
		wp_update_attachment_metadata( $this->song, array_merge( $meta, array( 'bitrate' => 128000 ) ) );
		$this->assertFalse( Transcode::worth( $this->song, 192 ) );
		wp_update_attachment_metadata( $this->song, array_merge( $meta, array( 'bitrate' => 320000 ) ) );
		$this->assertTrue( Transcode::worth( $this->song, 192 ) );
		wp_update_attachment_metadata( $this->song, array_merge( $meta, array( 'lossless' => true ) ) );
		$this->assertTrue( Transcode::worth( $this->song, 192 ) );
	}

	public function test_a_version_is_made_with_ffmpeg_or_not_at_all(): void {
		if ( '' === Transcode::ffmpeg() ) {
			$made = Transcode::make( $this->song );
			$this->assertWPError( $made );
			$this->assertSame( 'riff_transcode_ffmpeg', $made->get_error_code(), 'without ffmpeg, it says so and makes nothing' );
			$this->assertSame( 0, Media::stream( $this->song ) );
			return;
		}
		$version = Transcode::make( $this->song, 96 );

		$this->assertIsInt( $version );
		$this->assertSame( $version, Media::stream( $this->song ) );
		$this->assertSame( 'audio/mpeg', get_post_mime_type( $version ) );
		$this->assertSame( $this->post, (int) get_post_field( 'post_parent', $version ), 'on the song\'s post, so the same listeners may play it' );
		$this->assertSame( array(), wp_get_object_terms( $version, Catalog::ALBUM ), 'never filed as a track of its own' );
	}
}
