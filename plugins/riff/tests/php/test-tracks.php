<?php
/**
 * The track: what the player is handed for an attachment or a bare file address.
 *
 * @package Riff
 */

use Riff\Media;
use Riff\Tracks;

/**
 * @covers \Riff\Tracks
 */
class Test_Riff_Tracks extends Riff_TestCase {

	public function test_an_audio_attachment_becomes_a_track_with_its_tags_and_duration(): void {
		$id    = self::attach( '02 - Underground [underground].mp3' );
		$track = Tracks::from_attachment( $id );

		$this->assertSame( (string) $id, $track['id'] );
		$this->assertSame( 'audio', $track['type'] );
		$this->assertSame( wp_get_attachment_url( $id ), $track['src'] );
		$this->assertSame( 'Underground', $track['title'] );
		$this->assertSame( 'Airmen of Note, United States Air Force Band', $track['artist'] );
		$this->assertSame( 'Compositions', $track['album'] );
		$this->assertEqualsWithDelta( 538, $track['duration'], 1 );
		// The quality fields are what WordPress read from the file on upload, nothing re-measured.
		$this->assertSame( 'mp3', $track['format'] );
		$this->assertSame( (int) round( wp_get_attachment_metadata( $id )['bitrate'] / 1000 ), $track['bitrate'] );
		$this->assertGreaterThan( 0, $track['bitrate'] );
		$this->assertFalse( $track['lossless'] );
		$this->assertSame( array(), $track['art'] );
		$this->assertNull( $track['video'] );
		$this->assertNull( $track['post'] );
	}

	public function test_an_upload_named_after_its_file_takes_its_title_from_the_tags(): void {
		$id = self::factory()->attachment->create_upload_object( self::fixture( '02 - Underground [underground].mp3' ) );
		$this->assertStringContainsString( 'Underground-underground', get_post_field( 'post_title', $id, 'raw' ), 'named after the file, as the block editor leaves it' );
		$this->assertSame( 'Underground', Tracks::from_attachment( $id )['title'] );

		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => 'Underground (rehearsal take)',
			)
		);
		$this->assertSame( 'Underground (rehearsal take)', Tracks::from_attachment( $id )['title'], 'an edited title stays' );
	}

	public function test_a_second_upload_of_the_same_file_still_takes_its_title_from_the_tags(): void {
		self::factory()->attachment->create_upload_object( self::fixture( '02 - Underground [underground].mp3' ) );
		$again = self::factory()->attachment->create_upload_object( self::fixture( '02 - Underground [underground].mp3' ) );
		$this->assertMatchesRegularExpression( '/-\d+\.mp3$/', (string) get_attached_file( $again ), 'the file is numbered' );
		$this->assertSame( 'Underground', Tracks::from_attachment( $again )['title'] );
	}

	public function test_artwork_comes_from_the_attachment_then_the_post(): void {
		$post  = self::factory()->post->create();
		$cover = self::attach( 'cover.png', $post );
		$id    = self::attach( '03 - Trombone Detritus [detritus].mp3', $post );

		$this->assertStringContainsString( 'riff-art=' . $post, Tracks::from_attachment( $id, $post )['art'][0]['src'], 'no image anywhere yet, so the post\'s drawn cover' );

		set_post_thumbnail( $post, $cover );
		$art = Tracks::from_attachment( $id, $post )['art'];
		$this->assertNotEmpty( $art, 'the post\'s featured image stands in' );
		$this->assertMatchesRegularExpression( '/^\d+x\d+$/', $art[0]['sizes'] );
		$this->assertStringContainsString( 'cover', $art[0]['src'] );
		$this->assertSame( $post, Tracks::from_attachment( $id, $post )['post']['url'] ? $post : 0 );

		$own = self::attach( 'cover.png' );
		set_post_thumbnail( $id, $own );
		$this->assertStringContainsString( basename( get_attached_file( $own ), '.png' ), Tracks::from_attachment( $id, $post )['art'][0]['src'], 'the attachment\'s own image wins' );
	}

	public function test_a_linked_video_becomes_the_video_version_with_a_poster(): void {
		$post  = self::factory()->post->create();
		$cover = self::attach( 'cover.png', $post );
		set_post_thumbnail( $post, $cover );
		$audio = self::attach( '01 - Intensities in Ten Cities [intensities].mp3', $post );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm', $post );
		update_post_meta( $audio, Media::VIDEO_META, $video );

		$track = Tracks::from_attachment( $audio, $post );
		$this->assertSame( 'audio', $track['type'] );
		$this->assertSame( wp_get_attachment_url( $video ), $track['video']['src'] );
		$this->assertStringContainsString( 'cover', $track['video']['poster'], 'the poster falls back to the track\'s art' );

		update_post_meta( $audio, Media::VIDEO_META, $cover );
		$this->assertNull( Tracks::from_attachment( $audio, $post )['video'], 'an image is not a video' );
	}

	public function test_a_video_attachment_is_a_video_track(): void {
		$id    = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$track = Tracks::from_attachment( $id );
		$this->assertSame( 'video', $track['type'] );
		$this->assertNull( $track['video'] );
	}

	public function test_anything_but_audio_or_video_is_not_a_track(): void {
		$this->assertNull( Tracks::from_attachment( self::attach( 'cover.png' ) ) );
		$this->assertNull( Tracks::from_attachment( 999999 ) );
	}

	public function test_a_playlist_track_block_is_its_attachment_read_fresh(): void {
		$post = self::factory()->post->create();
		$id   = self::attach( '02 - Underground [underground].mp3', $post );

		$track = Tracks::from_block(
			array(
				'blockName' => 'core/playlist-track',
				'attrs'     => array(
					'id'    => $id,
					'title' => 'Stale title copied when picked',
				),
			),
			$post
		);

		$this->assertSame( (string) $id, $track['id'] );
		$this->assertSame( 'Underground', $track['title'], 'the attachment, not the copy on the block' );
		$this->assertNull(
			Tracks::from_block(
				array(
					'blockName' => 'core/playlist-track',
					'attrs'     => array( 'src' => 'https://example.com/a.mp3' ),
				),
				$post
			),
			'no file, no track'
		);
	}

	public function test_a_lossless_file_carries_its_bit_depth_and_sample_rate(): void {
		$flac  = self::attach( '../test/tone-24-96.flac' );
		$mp3   = self::attach( '02 - Underground [underground].mp3' );
		$track = Tracks::from_attachment( $flac );

		$this->assertSame( 'flac', $track['format'] );
		$this->assertTrue( $track['lossless'] );
		$this->assertSame( 24, $track['bits'] );
		$this->assertSame( 96000, $track['rate'] );

		$lossy = Tracks::from_attachment( $mp3 );
		$this->assertFalse( $lossy['lossless'] );
		$this->assertSame( 0, $lossy['bits'], 'an MP3 has no bit depth to report' );
		$this->assertSame( 44100, $lossy['rate'] );
	}

	public function test_a_bare_address_is_titled_from_the_caption_then_the_file_name(): void {
		$post = self::factory()->post->create( array( 'post_title' => 'A post' ) );

		$track = Tracks::from_url( 'https://example.com/music/03%20-%20Take%20Five.mp3', 'audio', '', $post );
		$this->assertSame( '03 - Take Five', $track['title'] );
		$this->assertSame( 'url:' . md5( 'https://example.com/music/03%20-%20Take%20Five.mp3' ), $track['id'] );
		$this->assertSame( 'A post', $track['post']['title'] );
		$this->assertSame( get_permalink( $post ), $track['post']['url'] );

		$this->assertSame( 'Take Five', Tracks::from_url( 'https://example.com/x.mp3', 'audio', ' Take Five ' )['title'] );
		$this->assertNull( Tracks::from_url( 'https://example.com/x.mp3', 'image' ) );
		$this->assertNull( Tracks::from_url( 'javascript:alert(1)', 'audio' ) );
	}

	public function test_a_filtered_track_is_held_to_its_shape(): void {
		$post   = self::factory()->post->create();
		$id     = self::attach( '02 - Underground [underground].mp3', $post );
		$mangle = static function ( array $track ): array {
			$track['duration'] = 'forty';
			$track['art']      = array(
				'not-an-image',
				array(
					'src'   => 'https://example.org/cover.png',
					'sizes' => '100x100',
				),
			);
			$track['video']    = array( 'poster' => 'no-src.png' );
			$track['mood']     = 'late night';
			unset( $track['album'] );
			return $track;
		};
		add_filter( 'riff_track', $mangle );
		$track = Tracks::from_attachment( $id, $post );
		remove_filter( 'riff_track', $mangle );

		$this->assertSame( 0.0, $track['duration'], 'a duration that is not a number is unknown' );
		$this->assertCount( 1, $track['art'], 'only real artwork survives' );
		$this->assertNull( $track['video'], 'a video without a source is no video' );
		$this->assertSame( '', $track['album'], 'a missing key comes back empty' );
		$this->assertSame( 'late night', $track['mood'], 'extra keys stay for whoever added them' );
		$this->assertSame( $post, $track['post']['id'] );
	}

	public function test_the_schema_names_every_key_a_track_has(): void {
		$post   = self::factory()->post->create();
		$id     = self::attach( '02 - Underground [underground].mp3', $post );
		$track  = Tracks::from_attachment( $id, $post );
		$schema = Tracks::schema();
		$this->assertSame( 1, Tracks::SCHEMA_VERSION );
		$this->assertSame( array_keys( $schema['properties'] ), array_keys( $track ) );
	}

	public function test_a_title_in_another_script_is_not_mistaken_for_the_file_name(): void {
		// A Cyrillic file name and a Cyrillic title that differ: with Latin-only comparison both collapse
		// to nothing, look equal, and the tag's title overwrites what the author typed.
		$copy = get_temp_dir() . 'песня-' . wp_generate_password( 6, false ) . '.mp3';
		copy( self::fixture( '02 - Underground [underground].mp3' ), $copy );
		$id = self::factory()->attachment->create_upload_object( $copy );
		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => 'Другая',
			)
		);
		$meta          = (array) wp_get_attachment_metadata( $id );
		$meta['title'] = 'Песня';
		wp_update_attachment_metadata( $id, $meta );
		$this->assertSame( 'Другая', Tracks::from_attachment( $id )['title'] );
	}

	public function test_level_data_stored_on_the_attachment_rides_on_the_track(): void {
		$id   = self::attach( '02 - Underground [underground].mp3' );
		$meta = (array) wp_get_attachment_metadata( $id );
		$this->assertSame( '', Tracks::from_attachment( $id )['levels'], 'nothing measured, nothing claimed' );
		$meta['riff_levels'] = '01234567899876543210';
		wp_update_attachment_metadata( $id, $meta );
		$this->assertSame( '01234567899876543210', Tracks::from_attachment( $id )['levels'] );
	}
}
