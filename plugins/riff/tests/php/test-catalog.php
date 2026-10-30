<?php
/**
 * Albums and artists as taxonomies on attachments.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Tracks;

/**
 * Riff\Catalog.
 */
class Test_Riff_Catalog extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		// The suite resets registered meta between tests; the taxonomies register theirs on init.
		Catalog::taxonomies();
	}

	/**
	 * Term names on an attachment.
	 *
	 * @param int    $id       Attachment ID.
	 * @param string $taxonomy Taxonomy.
	 * @return string[]
	 */
	private function names( int $id, string $taxonomy ): array {
		$terms = wp_get_object_terms( $id, $taxonomy, array( 'fields' => 'names' ) );
		return is_array( $terms ) ? $terms : array();
	}

	public function test_both_taxonomies_are_on_attachments_and_in_rest(): void {
		foreach ( array( Catalog::ALBUM, Catalog::ARTIST ) as $taxonomy ) {
			$this->assertTrue( taxonomy_exists( $taxonomy ) );
			$object = get_taxonomy( $taxonomy );
			$this->assertSame( array( 'attachment' ), $object->object_type );
			$this->assertTrue( $object->show_in_rest );
			$this->assertTrue( $object->show_admin_column, 'a column in the Media Library list' );
			$this->assertFalse( $object->public, 'no archive pages of its own; Listen is where they are browsed' );
			$this->assertFalse( $object->meta_box_cb, 'no tag box on a track\'s edit screen, which would split a name on its commas' );
		}
	}

	public function test_saving_a_track_s_edit_screen_keeps_a_name_with_a_comma_whole(): void {
		require_once ABSPATH . 'wp-admin/includes/post.php';
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$id = self::attach( '02 - Underground [underground].mp3' );

		edit_post(
			array(
				'post_ID'        => $id,
				'post_type'      => 'attachment',
				'post_mime_type' => 'audio/mpeg',
				'post_title'     => 'Underground',
				'id3_artist'     => 'The Diplomats, U.S. Air Force Band',
				'id3_album'      => 'Blues Queens, 1920-1925',
			)
		);

		$this->assertSame( array( 'The Diplomats, U.S. Air Force Band' ), $this->names( $id, Catalog::ARTIST ) );
		$this->assertSame( array( 'Blues Queens, 1920-1925' ), $this->names( $id, Catalog::ALBUM ) );
	}

	public function test_an_upload_is_filed_under_its_album_and_artist_from_its_tags(): void {
		$id = self::attach( '02 - Underground [underground].mp3' );

		$this->assertSame( array( 'Compositions' ), $this->names( $id, Catalog::ALBUM ) );
		$this->assertSame( array( 'Airmen of Note, United States Air Force Band' ), $this->names( $id, Catalog::ARTIST ) );
		$album = wp_get_object_terms( $id, Catalog::ALBUM )[0];
		$this->assertSame( 'The Airmen of Note', get_term_meta( $album->term_id, Catalog::ALBUM_ARTIST, true ), 'the album artist comes from the band tag' );
		$this->assertSame( Catalog::VERSION, (int) get_post_meta( $id, Catalog::FILED, true ) );
	}

	public function test_a_tag_with_angle_brackets_is_filed_under_its_whole_name(): void {
		$id = self::attach( '02 - Underground [underground].mp3' );
		wp_update_attachment_metadata(
			$id,
			array(
				'artist' => 'AC/DC & <Friends>',
				'album'  => '<Untitled> & Other Songs',
			)
		);

		$artist = wp_get_object_terms( $id, Catalog::ARTIST )[0];
		$album  = wp_get_object_terms( $id, Catalog::ALBUM )[0];
		$this->assertSame( 'AC/DC & <Friends>', Catalog::name( $artist->name ), 'nothing read as a tag and stripped' );
		$this->assertSame( '<Untitled> & Other Songs', Catalog::name( $album->name ) );
		$this->assertSame( 'ac-dc-friends', $artist->slug );
		$this->assertSame( '<Untitled> & Other Songs', Catalog::name( get_term_by( 'slug', 'untitled-other-songs-ac-dc-friends', Catalog::ALBUM )->name ), 'the slug keeps every word' );

		$again = self::attach( '03 - Trombone Detritus [detritus].mp3' );
		wp_update_attachment_metadata(
			$again,
			array(
				'artist' => 'AC/DC & <Friends>',
				'album'  => '<Untitled> & Other Songs',
			)
		);
		$this->assertSame( $artist->term_id, wp_get_object_terms( $again, Catalog::ARTIST )[0]->term_id, 'a second track joins the same artist' );
		$this->assertSame( $album->term_id, wp_get_object_terms( $again, Catalog::ALBUM )[0]->term_id );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );
		$artists = rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/artists' ) )->get_data();
		$albums  = rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/albums' ) )->get_data();
		$this->assertSame( 'AC/DC & <Friends>', $artists['items'][0]['name'], 'the route says the whole name, as the track rows do' );
		$this->assertSame( '<Untitled> & Other Songs', $albums['items'][0]['name'] );
		$this->assertSame( 'AC/DC & <Friends>', Tracks::from_attachment( $id )['artist'] );
	}

	public function test_tracks_of_one_album_share_its_term_and_same_named_albums_by_others_do_not(): void {
		$one   = self::attach( '02 - Underground [underground].mp3' );
		$two   = self::attach( '03 - Trombone Detritus [detritus].mp3' );
		$other = self::attach( '02 - Underground [underground].mp3' );
		wp_update_attachment_metadata(
			$other,
			array(
				'album'  => 'Compositions',
				'artist' => 'Someone Else',
			)
		);

		$album = static fn( int $id ): int => wp_get_object_terms( $id, Catalog::ALBUM )[0]->term_id;
		$this->assertSame( $album( $one ), $album( $two ) );
		$this->assertNotSame( $album( $one ), $album( $other ), 'a different artist\'s Compositions is a different album' );
		$this->assertSame( 2, (int) get_term( $album( $one ), Catalog::ALBUM )->count );
	}

	public function test_an_album_made_before_its_artist_was_known_learns_it(): void {
		$made = wp_insert_term( 'Compositions', Catalog::ALBUM, array( 'slug' => 'compositions-the-airmen-of-note' ) );

		self::attach( '02 - Underground [underground].mp3' );

		$this->assertSame( 'The Airmen of Note', get_term_meta( $made['term_id'], Catalog::ALBUM_ARTIST, true ) );
	}

	public function test_editing_the_tags_moves_the_file_and_clearing_them_removes_it(): void {
		$id = self::attach( '02 - Underground [underground].mp3' );

		wp_update_attachment_metadata(
			$id,
			array(
				'album'  => 'Retagged',
				'artist' => 'New Artist',
			)
		);
		$this->assertSame( array( 'Retagged' ), $this->names( $id, Catalog::ALBUM ) );
		$this->assertSame( array( 'New Artist' ), $this->names( $id, Catalog::ARTIST ) );

		wp_update_attachment_metadata( $id, array( 'length' => 10 ) );
		$this->assertSame( array(), $this->names( $id, Catalog::ALBUM ) );
		$this->assertSame( array(), $this->names( $id, Catalog::ARTIST ) );
	}

	public function test_images_and_video_are_left_alone(): void {
		$image = self::attach( 'cover.png' );
		$video = self::attach( '01 - Intensities in Ten Cities [intensities].webm' );

		foreach ( array( $image, $video ) as $id ) {
			$this->assertSame( array(), $this->names( $id, Catalog::ALBUM ) );
			$this->assertSame( '', get_post_meta( $id, Catalog::FILED, true ) );
		}
	}

	public function test_a_library_from_before_is_filed_in_batches_until_done(): void {
		$ids = array( self::attach( '02 - Underground [underground].mp3' ), self::attach( '03 - Trombone Detritus [detritus].mp3' ) );
		foreach ( $ids as $id ) {
			delete_post_meta( $id, Catalog::FILED );
			wp_set_object_terms( $id, array(), Catalog::ALBUM );
			wp_set_object_terms( $id, array(), Catalog::ARTIST );
		}
		delete_option( Catalog::BACKFILL );
		wp_clear_scheduled_hook( Catalog::BACKFILL );

		$this->assertSame( 1, Catalog::backfill( 1 ) );
		$this->assertNotFalse( wp_next_scheduled( Catalog::BACKFILL ), 'a full batch schedules the next one' );
		$this->assertFalse( get_option( Catalog::BACKFILL ) );

		wp_clear_scheduled_hook( Catalog::BACKFILL );
		$this->assertSame( 1, Catalog::backfill( 2 ) );
		$this->assertSame( Catalog::VERSION, (int) get_option( Catalog::BACKFILL ), 'a short batch means the library is done' );
		$this->assertFalse( wp_next_scheduled( Catalog::BACKFILL ) );
		foreach ( $ids as $id ) {
			$this->assertSame( array( 'Compositions' ), $this->names( $id, Catalog::ALBUM ) );
		}
	}

	public function test_each_batch_starts_where_the_last_stopped_and_skips_what_is_filed(): void {
		$ids = array(
			self::attach( '02 - Underground [underground].mp3' ),
			self::attach( '03 - Trombone Detritus [detritus].mp3' ),
			self::attach( '02 - Underground [underground].mp3' ),
		);
		foreach ( array( $ids[0], $ids[2] ) as $id ) {
			delete_post_meta( $id, Catalog::FILED );
		}
		delete_option( Catalog::BACKFILL );
		delete_option( Catalog::BACKFILL_FROM );
		wp_clear_scheduled_hook( Catalog::BACKFILL );

		$this->assertSame( 1, Catalog::backfill( 1 ) );
		$this->assertSame( $ids[0], (int) get_option( Catalog::BACKFILL_FROM )['after'] );
		delete_post_meta( $ids[0], Catalog::FILED );

		$this->assertSame( 1, Catalog::backfill( 5 ), 'the next batch does not look back, and passes over what is filed' );
		$this->assertSame( '', get_post_meta( $ids[0], Catalog::FILED, true ) );
		$this->assertSame( Catalog::VERSION, (int) get_post_meta( $ids[2], Catalog::FILED, true ) );
		$this->assertTrue( Catalog::filed() );
		$this->assertFalse( get_option( Catalog::BACKFILL_FROM ), 'and the walk is forgotten once it reaches the end' );
		wp_clear_scheduled_hook( Catalog::BACKFILL );
	}

	public function test_wp_riff_catalog_files_the_whole_library_from_the_start(): void {
		require_once __DIR__ . '/class-riff-test-wp-cli.php';
		WP_CLI::$lines = array();
		$id            = self::attach( '02 - Underground [underground].mp3' );
		delete_post_meta( $id, Catalog::FILED );
		update_option( Catalog::BACKFILL, Catalog::VERSION );

		( new Riff\Cli() )->catalog( array(), array() );

		$this->assertSame( Catalog::VERSION, (int) get_post_meta( $id, Catalog::FILED, true ), 'found though the background filing had finished' );
		$this->assertSame( 'Filed 1 audio files under their albums and artists.', WP_CLI::$lines[0][1] );
		wp_clear_scheduled_hook( Catalog::BACKFILL );
	}

	public function test_the_backfill_is_scheduled_only_until_it_has_finished(): void {
		delete_option( Catalog::BACKFILL );
		wp_clear_scheduled_hook( Catalog::BACKFILL );
		Catalog::schedule();
		$this->assertNotFalse( wp_next_scheduled( Catalog::BACKFILL ) );

		wp_clear_scheduled_hook( Catalog::BACKFILL );
		update_option( Catalog::BACKFILL, Catalog::VERSION );
		Catalog::schedule();
		$this->assertFalse( wp_next_scheduled( Catalog::BACKFILL ) );
	}

	public function test_an_imported_folder_is_filed_too(): void {
		$dir = sys_get_temp_dir() . '/riff-catalog-' . wp_generate_password( 8, false );
		mkdir( $dir );
		copy( self::fixture( '02 - Underground [underground].mp3' ), $dir . '/02 - Underground [underground].mp3' );

		$album = Riff\Import::folder( $dir )['albums'][0];
		unlink( $dir . '/02 - Underground [underground].mp3' );
		rmdir( $dir );

		$track = (int) get_posts(
			array(
				'post_type'      => 'attachment',
				'post_mime_type' => 'audio',
				'post_status'    => 'any',
				'fields'         => 'ids',
			)
		)[0];
		$this->assertSame( array( '02 - Underground [underground].mp3' ), $album['imported'] );
		$this->assertSame( array( 'Compositions' ), $this->names( $track, Catalog::ALBUM ) );
	}

	public function test_a_visitor_cannot_list_album_or_artist_names_through_the_core_routes(): void {
		$GLOBALS['wp_rest_server'] = null;
		self::attach( '02 - Underground [underground].mp3' );
		wp_set_current_user( 0 );

		foreach ( array( '/wp/v2/riff_albums', '/wp/v2/riff_artists', '/wp/v2/riff_albums/1' ) as $route ) {
			$response = rest_do_request( new WP_REST_Request( 'GET', $route ) );
			$this->assertSame( 401, $response->get_status(), $route );
		}
	}

	public function test_rest_lists_albums_and_names_them_on_the_attachment(): void {
		$id = self::attach( '02 - Underground [underground].mp3' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );

		$albums = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/riff_albums' ) )->get_data();
		$this->assertSame( 'Compositions', $albums[0]['name'] );
		$this->assertSame( 'The Airmen of Note', $albums[0]['meta'][ Catalog::ALBUM_ARTIST ] );

		$media = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . $id ) )->get_data();
		$this->assertSame( array( $albums[0]['id'] ), $media['riff_albums'] );
	}
}
