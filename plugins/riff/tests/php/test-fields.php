<?php
/**
 * Riff's fields on a media item, over REST and the Entity Fields API.
 *
 * @package Riff
 */

use Riff\Fields;
use Riff\Media;
use Riff\Protect;

/**
 * Riff's fields on a media item: REST fields on wp/v2/media, and on WordPress 7.2 the same fields
 * registered for the attachment entity, which the Media Library's views and forms show.
 */
class Test_Riff_Fields extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		Media::register_meta();
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		do_action( 'rest_api_init' );
	}

	private function item( int $id, string $context = 'edit' ): array {
		$request = new WP_REST_Request( 'GET', '/wp/v2/media/' . $id );
		$request->set_param( 'context', $context );
		return rest_do_request( $request )->get_data();
	}

	private function save( int $id, array $fields ): WP_REST_Response {
		$request = new WP_REST_Request( 'POST', '/wp/v2/media/' . $id );
		$request->set_body_params( $fields );
		return rest_do_request( $request );
	}

	public function test_a_songs_artist_album_and_video_version_are_rest_fields_read_and_written_as_the_item(): void {
		$song  = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$item  = $this->item( $song );
		$this->assertSame( 'Airmen of Note, United States Air Force Band', $item['riff_artist'], 'from the file\'s tags' );
		$this->assertSame( 'Compositions', $item['riff_album'] );
		$this->assertSame( 0, $item['riff_video'] );
		$this->assertFalse( $item['riff_protected'] );
		$this->assertNull( $this->item( $video )['riff_artist'], 'a video has no artist field' );
		$this->assertNull( $this->item( self::attach( 'cover.png' ) )['riff_protected'], 'an image is not a track' );

		$response = $this->save( $song, array( 'riff_artist' => 'The Airmen of Note', 'riff_album' => 'Live', 'riff_video' => $video ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$this->assertSame( 200, $response->get_status(), (string) wp_json_encode( $response->get_data() ) );
		$meta = wp_get_attachment_metadata( $song );
		$this->assertSame( 'The Airmen of Note', $meta['artist'], 'written where WordPress keeps the tag' );
		$this->assertSame( 'Live', $meta['album'] );
		$this->assertSame( $video, (int) get_post_meta( $song, Media::VIDEO_META, true ) );
		$this->assertSame( $video, $this->item( $song )['riff_video'] );
		$this->assertContains( 'Live', wp_get_object_terms( $song, \Riff\Catalog::ALBUM, array( 'fields' => 'names' ) ), 'the catalogue files the new tag' );

		$this->assertSame( 400, $this->save( $song, array( 'riff_video' => self::attach( 'cover.png' ) ) )->get_status(), 'an image is not a video' );
		$this->assertSame( $video, (int) get_post_meta( $song, Media::VIDEO_META, true ), 'and the choice stays' );
		$this->assertSame( 200, $this->save( $song, array( 'riff_video' => 0 ) )->get_status() );
		$this->assertSame( 0, (int) get_post_meta( $song, Media::VIDEO_META, true ) );
	}

	public function test_a_video_takes_no_video_version_and_a_subscriber_may_write_nothing(): void {
		$song  = self::attach( '02 - Underground [underground].mp3' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );
		$this->assertSame( 400, $this->save( $video, array( 'riff_video' => $song ) )->get_status(), 'the field is not for a video' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertContains( $this->save( $song, array( 'riff_artist' => 'Nobody' ) )->get_status(), array( 401, 403 ) );
		$this->assertSame( 'Airmen of Note, United States Air Force Band', wp_get_attachment_metadata( $song )['artist'] );
	}

	public function test_protected_is_a_boolean_field_that_moves_the_file(): void {
		$song = self::attach( '02 - Underground [underground].mp3' );
		$this->assertSame( 200, $this->save( $song, array( 'riff_protected' => true ) )->get_status() );
		$this->assertTrue( Protect::is( $song ) );
		$this->assertTrue( $this->item( $song )['riff_protected'] );
		$this->assertSame( 200, $this->save( $song, array( 'riff_protected' => false ) )->get_status() );
		$this->assertFalse( Protect::is( $song ) );
	}

	public function test_on_wordpress_7_2_the_fields_are_registered_for_the_attachment_entity(): void {
		if ( ! function_exists( 'wp_get_registered_entity_fields' ) ) {
			$this->markTestSkipped( 'The Entity Fields API is WordPress 7.2\'s.' );
		}
		$fields = array_column( wp_get_registered_entity_fields( 'postType', 'attachment' ), null, 'id' );
		$ids    = array_keys( Fields::fields() );
		foreach ( $ids as $id ) {
			$this->assertArrayHasKey( $id, $fields, "$id is a field of the attachment entity" );
			$this->assertSame( Fields::fields()[ $id ]['type'], $fields[ $id ]['type'] );
			$this->assertSame( Fields::fields()[ $id ]['label'], $fields[ $id ]['label'] );
		}
		$this->assertArrayHasKey( 'alt_text', $fields, 'beside core\'s own' );
		$route = new WP_REST_Request( 'GET', '/wp/v2/entity-fields' );
		$route->set_query_params( array( 'kind' => 'postType', 'name' => 'attachment' ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$response = rest_do_request( $route );
		$this->assertStringContainsString( 'riff_artist', wp_json_encode( $response->get_data() ), 'and on the route DataViews reads' );
	}
}
