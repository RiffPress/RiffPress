<?php
/**
 * Playlists people make, over REST.
 *
 * @package Riff
 */

use Riff\Blocks_Source;
use Riff\Catalog;
use Riff\Playlists;

/**
 * Riff\Playlists.
 */
class Test_Riff_Playlists extends Riff_TestCase {

	/**
	 * Three tracks on a published post.
	 *
	 * @var int[]
	 */
	private array $tracks = array();

	/**
	 * A track on a draft.
	 *
	 * @var int
	 */
	private int $secret = 0;

	/**
	 * A subscriber.
	 *
	 * @var int
	 */
	private int $user = 0;

	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		Playlists::post_type();
		$post         = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->tracks = array(
			self::attach( '02 - Underground [underground].mp3', $post ),
			self::attach( '03 - Trombone Detritus [detritus].mp3', $post ),
			self::attach( '05 - Stole Back My Soul [stole-back].mp3', $post ),
		);
		$draft        = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		$this->secret = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $draft );
		$this->user   = self::factory()->user->create( array( 'role' => 'subscriber' ) );
	}

	/**
	 * A request's response.
	 *
	 * @param string $method Method.
	 * @param string $route  Route under /riff/v1/users/me/playlists.
	 * @param array  $body   JSON body.
	 * @return WP_REST_Response
	 */
	private function call( string $method, string $route = '', array $body = array() ): WP_REST_Response {
		$request = new WP_REST_Request( $method, '/riff/v1/users/me/playlists' . $route );
		if ( $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}
		return rest_do_request( $request );
	}

	/**
	 * A playlist the subscriber made.
	 *
	 * @param int[] $tracks Track IDs.
	 * @return int
	 */
	private function made( array $tracks ): int {
		wp_set_current_user( $this->user );
		return (int) $this->call(
			'POST',
			'',
			array(
				'title'  => 'Road trip',
				'tracks' => $tracks,
			)
		)->get_data()['id'];
	}

	/**
	 * A playlist the subscriber made while the draft's track was still published.
	 *
	 * @param int[] $tracks Track IDs.
	 * @return int
	 */
	private function made_before_unpublishing( array $tracks ): int {
		$draft = (int) get_post_field( 'post_parent', $this->secret );
		wp_publish_post( $draft );
		$id = $this->made( $tracks );
		wp_update_post(
			array(
				'ID'          => $draft,
				'post_status' => 'draft',
			)
		);
		return $id;
	}

	public function test_a_visitor_cannot_make_or_see_playlists(): void {
		wp_set_current_user( 0 );
		$this->assertSame( 401, $this->call( 'GET' )->get_status() );
		$this->assertSame( 401, $this->call( 'POST', '', array( 'title' => 'Mine' ) )->get_status() );
	}

	public function test_a_playlist_is_a_private_post_of_its_user_holding_a_playlist_block(): void {
		$id   = $this->made( array( $this->tracks[1], $this->tracks[0] ) );
		$post = get_post( $id );

		$this->assertSame( Playlists::TYPE, $post->post_type );
		$this->assertSame( 'private', $post->post_status, 'private by default' );
		$this->assertSame( $this->user, (int) $post->post_author );
		$this->assertTrue( has_block( 'core/playlist', $post ), 'core\'s own block, so it opens in the editor' );
		$block = parse_blocks( $post->post_content )[0];
		$this->assertSame( array( $this->tracks[1], $this->tracks[0] ), array_map( static fn( $b ) => $b['attrs']['id'], Blocks_Source::playlist_tracks( $block ) ), 'read the way Riff reads any Playlist block' );
	}

	public function test_making_one_answers_with_its_tracks_and_a_mosaic_of_covers(): void {
		wp_set_current_user( $this->user );
		$response = $this->call(
			'POST',
			'',
			array(
				'title'  => '  Road <b>trip</b>  ',
				'tracks' => array( $this->tracks[0], $this->tracks[1] ),
			)
		);
		$data     = $response->get_data();

		$this->assertSame( 201, $response->get_status() );
		$this->assertSame( 'Road trip', $data['title'], 'plain text' );
		$this->assertSame( 2, $data['count'] );
		$this->assertSame( array( 'Underground', 'Trombone Detritus' ), wp_list_pluck( $data['tracks'], 'title' ) );
		$this->assertNotEmpty( $data['covers'] );
		$this->assertLessThanOrEqual( 4, count( $data['covers'] ) );
	}

	public function test_tracks_are_added_reordered_and_removed_by_place_and_it_is_renamed(): void {
		$id = $this->made( array( $this->tracks[0] ) );

		$data = $this->call( 'POST', "/$id/tracks", array( 'tracks' => array( $this->tracks[1], $this->tracks[0] ) ) )->get_data();
		$this->assertSame( array( $this->tracks[0], $this->tracks[1], $this->tracks[0] ), $data['ids'], 'added at the end, a track twice if asked' );

		$data = $this->call( 'DELETE', "/$id/tracks/2" )->get_data();
		$this->assertSame( array( $this->tracks[0], $this->tracks[1] ), $data['ids'], 'the second copy goes, not the first' );

		$data = $this->call(
			'POST',
			"/$id",
			array(
				'title'  => 'Night drive',
				'tracks' => array( $this->tracks[2], $this->tracks[1], $this->tracks[0] ),
			)
		)->get_data();
		$this->assertSame( 'Night drive', $data['title'] );
		$this->assertSame( array( $this->tracks[2], $this->tracks[1], $this->tracks[0] ), $data['ids'] );
		$this->assertSame( array( 0, 1, 2 ), wp_list_pluck( $data['tracks'], 'index' ) );
		$this->assertSame( 400, $this->call( 'DELETE', "/$id/tracks/9" )->get_status(), 'no track there' );
	}

	public function test_only_audio_in_the_media_library_joins_and_a_hidden_track_keeps_its_place(): void {
		$image = self::factory()->attachment->create_upload_object( self::fixture( 'cover.png' ) );
		$later = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$gone  = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $later );
		$id    = $this->made( array( $this->tracks[0], $image, $gone, $this->tracks[1] ) );
		wp_update_post(
			array(
				'ID'          => $later,
				'post_status' => 'draft',
			)
		);
		$data = $this->call( 'GET', "/$id" )->get_data();

		$this->assertSame( array( $this->tracks[0], $gone, $this->tracks[1] ), $data['ids'], 'an image is not a track' );
		$this->assertSame( array( 'Underground', 'Trombone Detritus' ), wp_list_pluck( $data['tracks'], 'title' ), 'a track whose post went back to draft is not shown to a subscriber' );
		$this->assertSame( array( 0, 2 ), wp_list_pluck( $data['tracks'], 'index' ), 'and the others keep their places' );

		$data = $this->call( 'POST', "/$id", array( 'tracks' => array( $this->tracks[1], $gone, $this->tracks[0] ) ) )->get_data();
		$this->assertSame( array( $this->tracks[1], $gone, $this->tracks[0] ), $data['ids'], 'reordering keeps it' );
	}

	public function test_a_track_the_listener_cannot_see_does_not_join(): void {
		$id      = $this->made( array( $this->tracks[0], $this->secret ) );
		$content = (string) get_post_field( 'post_content', $id );

		$this->assertSame( array( $this->tracks[0] ), $this->call( 'GET', "/$id" )->get_data()['ids'] );
		$this->assertStringNotContainsString( (string) wp_get_attachment_url( $this->secret ), $content, 'the draft\'s file address is not written into a post the subscriber can read' );
		$this->assertStringNotContainsString( 'Brand New Day', $content, 'nor its title' );

		$this->assertSame( array( $this->tracks[0] ), $this->call( 'POST', "/$id/tracks", array( 'tracks' => array( $this->secret ) ) )->get_data()['ids'], 'nor by adding it after' );
	}

	public function test_a_list_is_the_users_own_most_recently_changed_first(): void {
		global $wpdb;
		$first  = $this->made( array( $this->tracks[0] ) );
		$second = $this->made( array() );
		// The first was changed last.
		$wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a test setting a time WordPress would set itself.
			$wpdb->posts,
			array(
				'post_modified'     => '2030-01-01 00:00:00',
				'post_modified_gmt' => '2030-01-01 00:00:00',
			),
			array( 'ID' => $first )
		);
		clean_post_cache( $first );
		Playlists::create( self::factory()->user->create( array( 'role' => 'subscriber' ) ), 'Not mine' );

		wp_set_current_user( $this->user );
		$items = $this->call( 'GET' )->get_data()['items'];
		$this->assertSame( array( $first, $second ), wp_list_pluck( $items, 'id' ) );
		$this->assertNotContains( 'Not mine', wp_list_pluck( $items, 'title' ) );
	}

	public function test_someone_elses_playlist_is_not_found_and_an_editor_of_users_may_reach_it(): void {
		$id    = $this->made( array( $this->tracks[0] ) );
		$other = self::factory()->user->create( array( 'role' => 'subscriber' ) );

		wp_set_current_user( $other );
		$this->assertSame( 404, $this->call( 'GET', "/$id" )->get_status(), 'not theirs' );
		$this->assertSame( 404, $this->call( 'DELETE', "/$id" )->get_status() );
		$request = new WP_REST_Request( 'GET', '/riff/v1/users/' . $this->user . '/playlists' );
		$this->assertSame( 403, rest_do_request( $request )->get_status(), 'nor by its owner\'s ID' );

		$admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		if ( is_multisite() ) {
			grant_super_admin( $admin );
		}
		wp_set_current_user( $admin );
		$request = new WP_REST_Request( 'GET', '/riff/v1/users/' . $this->user . '/playlists/' . $id );
		$this->assertSame( 'Road trip', rest_do_request( $request )->get_data()['title'] );
		$this->assertSame( 404, $this->call( 'GET', "/$id" )->get_status(), 'as me, it is not the admin\'s own' );
	}

	public function test_deleting_moves_it_to_the_trash(): void {
		$id = $this->made( array( $this->tracks[0] ) );

		$data = $this->call( 'DELETE', "/$id" )->get_data();
		$this->assertTrue( $data['deleted'] );
		$this->assertSame( 'trash', get_post_status( $id ) );
		$this->assertSame( 404, $this->call( 'GET', "/$id" )->get_status() );
		$this->assertSame( array(), $this->call( 'GET' )->get_data()['items'] );
	}

	/**
	 * The Listen block at an address, as whoever is signed in.
	 *
	 * @param array $args Query arguments.
	 * @return string
	 */
	private function render_at( array $args ): string {
		$page = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
		$this->go_to( add_query_arg( $args, get_permalink( $page ) ) );
		foreach ( $args as $key => $value ) {
			$_GET[ $key ] = (string) $value; // go_to() does not fill $_GET; the block reads it.
		}
		$html = \Riff\Listen\App::render();
		foreach ( array_keys( $args ) as $key ) {
			unset( $_GET[ $key ] );
		}
		return $html;
	}

	public function test_a_playlist_opens_with_its_mosaic_rows_places_rename_and_delete(): void {
		$id   = $this->made_before_unpublishing( array( $this->tracks[0], $this->secret, $this->tracks[1] ) );
		$html = $this->render_at( array( 'riff_playlist' => $id ) );

		$this->assertStringContainsString( '<h2 class="riff-album-title" tabindex="-1">Road trip</h2>', $html );
		$this->assertStringContainsString( '<p class="riff-album-kind">Playlist</p>', $html );
		$this->assertStringContainsString( '3 songs', $html );
		$this->assertStringContainsString( 'data-riff-app-action="rename-playlist" data-riff-playlist="' . $id . '"', $html );
		$this->assertStringContainsString( 'data-riff-app-action="delete-playlist"', $html );
		$this->assertSame( 2, substr_count( $html, 'data-riff-track="' ), 'a row for each of the two the listener can see' );
		$this->assertStringContainsString( 'data-riff-places="[0,2]"', $html, 'their places, the hidden one skipped' );
		$this->assertMatchesRegularExpression( '/<a class="riff-app-tab riff-app-tab-library" href="[^"]*riff_view=library"[^>]*aria-current="page"/', $html, 'under Your Library' );
		// Your Library's list is standalone mode's sidebar; a theme's Listen block has tabs.
		$this->assertStringNotContainsString( 'riff-app-library', $html );
	}

	public function test_standalone_mode_lists_the_playlist_in_your_library_and_marks_it_open(): void {
		$id = $this->made( $this->tracks );
		$this->set_permalink_structure( '/%postname%/' );
		\Riff\Listen\Standalone::endpoint();
		flush_rewrite_rules( false );
		$listen = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_name'    => 'listen',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
		$this->go_to( add_query_arg( 'riff_playlist', $id, \Riff\Listen\Standalone::url( $listen ) ) );
		$_GET['riff_playlist'] = (string) $id; // go_to() does not fill $_GET; the block reads it.
		$html = do_blocks( '<!-- wp:riff/app /-->' );
		unset( $_GET['riff_playlist'] );

		$this->assertStringContainsString( '<a class="riff-app-library-title" id="riff-app-library"', $html );
		$this->assertStringContainsString( 'data-riff-app-action="new-playlist" aria-label="New playlist"', $html, 'New playlist, for someone signed in' );
		$this->assertMatchesRegularExpression( '/<li data-riff-library-kind="playlists"><a class="riff-app-item" href="[^"]*riff_playlist=' . $id . '" aria-current="page">.*?<span class="riff-app-item-title">Road trip<\/span><span class="riff-app-item-sub">Playlist · 3 songs<\/span>/', $html );
		$this->assertMatchesRegularExpression( '/<span class="riff-app-item-title">Liked songs<\/span>/', $html, 'Liked songs is always first' );
	}

	public function test_someone_elses_playlist_does_not_open(): void {
		$id = $this->made( array( $this->tracks[0] ) );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$html = $this->render_at( array( 'riff_playlist' => $id ) );

		$this->assertStringContainsString( 'This playlist isn’t here', $html );
		$this->assertStringNotContainsString( 'Road trip', $html );
	}

	public function test_your_library_has_playlists_behind_their_chip_after_liked_songs_and_a_new_playlist_button(): void {
		$empty = $this->made( array() );
		$full  = $this->made( array( $this->tracks[0] ) );
		$all   = $this->render_at( array( 'riff_view' => 'library' ) );

		$this->assertMatchesRegularExpression( '/riff-card-liked.*data-riff-playlist="' . $full . '".*data-riff-playlist="' . $empty . '"/s', $all, 'right after Liked songs, the most recently changed first' );
		$this->assertStringContainsString( 'data-riff-app-action="new-playlist"', $all );
		$this->assertStringContainsString( 'Playlist · 1 song', $all );
		$this->assertStringNotContainsString( 'data-riff-shelf="start"', $all, 'something of the listener\'s is here, so no albums to start with' );

		$chip = $this->render_at(
			array(
				'riff_view'   => 'library',
				'riff_filter' => 'playlists',
			)
		);
		$this->assertMatchesRegularExpression( '/<a class="riff-chip-link" href="[^"]*riff_filter=playlists"[^>]*aria-current="true">Playlists/', $chip );
		$this->assertSame( 2, substr_count( $chip, 'class="riff-card riff-card-playlist"' ) );
		$this->assertStringContainsString( 'data-riff-app-action="play-playlist" data-riff-playlist="' . $full . '"', $chip, 'a playlist with songs plays from its cover' );

		wp_set_current_user( 0 );
		$visitor = $this->render_at(
			array(
				'riff_view'   => 'library',
				'riff_filter' => 'playlists',
			)
		);
		$this->assertStringContainsString( 'Sign in to make playlists', $visitor );
		$this->assertStringNotContainsString( 'new-playlist', $visitor );
	}

	public function test_the_player_gets_the_users_playlists_and_a_visitor_a_way_to_sign_in(): void {
		$id = $this->made( array( $this->tracks[0] ) );
		wp_set_current_user( $this->user );
		$data = \Riff\Playlists::player_data( array() );

		$this->assertSame(
			array(
				array(
					'id'    => $id,
					'title' => 'Road trip',
					'count' => 1,
				),
			),
			$data['me']['playlists']
		);
		$this->assertStringContainsString( 'riff/v1/users/me/playlists', $data['me']['rest']['playlists'] );

		wp_set_current_user( 0 );
		$data = \Riff\Playlists::player_data( array() );
		$this->assertArrayNotHasKey( 'me', $data );
		$this->assertStringContainsString( 'wp-login.php', $data['signIn'] );
	}

	public function test_a_playlists_covers_come_only_from_tracks_the_listener_can_see(): void {
		$image = self::factory()->attachment->create_upload_object( self::fixture( 'cover.png' ) );
		set_post_thumbnail( $this->secret, $image );
		$cover = (string) wp_get_attachment_image_src( $image, 'large' )[0];
		$draft = (int) get_post_field( 'post_parent', $this->secret );
		// Added while its post was published; the post is a draft again now.
		wp_update_post(
			array(
				'ID'          => $draft,
				'post_status' => 'publish',
			)
		);
		$id = Playlists::create( $this->user, 'Road trip', array( $this->secret, $this->tracks[0] ) );
		wp_update_post(
			array(
				'ID'          => $draft,
				'post_status' => 'draft',
			)
		);

		wp_set_current_user( $this->user );
		$summary = Playlists::summary( get_post( $id ) );
		$this->assertNotEmpty( $summary['covers'] );
		$this->assertNotContains( $cover, $summary['covers'], 'no cover from a track on a post they cannot read' );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->assertContains( $cover, Playlists::summary( get_post( $id ) )['covers'], 'someone who can see it does get it' );
	}

	public function test_a_users_playlists_go_in_their_personal_data_export_and_erasure(): void {
		$id = $this->made_before_unpublishing( array( $this->tracks[0], $this->secret, $this->tracks[1] ) );
		wp_trash_post( $this->made( array( $this->tracks[2] ) ) );
		$email = get_userdata( $this->user )->user_email;
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$export = Playlists::export( $email );
		$this->assertTrue( $export['done'] );
		$this->assertCount( 2, $export['data'], 'the trashed one too' );
		$this->assertSame( 'riff-playlist-' . $id, $export['data'][0]['item_id'] );
		$this->assertSame( 'Road trip', $export['data'][0]['data'][0]['value'] );
		$this->assertSame( "Underground\n#{$this->secret}\nTrombone Detritus", $export['data'][0]['data'][1]['value'], 'in order, and a track on a draft by its ID only' );

		$erased = Playlists::erase( $email );
		$this->assertTrue( $erased['items_removed'] );
		$this->assertTrue( $erased['done'] );
		$this->assertNull( get_post( $id ) );
		$this->assertSame( array(), Playlists::export( $email )['data'] );
		$this->assertFalse( Playlists::erase( $email )['items_removed'] );
	}

	public function test_uninstalling_riff_keeps_what_listeners_made(): void {
		$id = $this->made( array( $this->tracks[0] ) );
		\Riff\Likes::add(
			$this->user,
			array(
				array(
					'kind' => 'track',
					'id'   => $this->tracks[1],
				),
			)
		);
		\Riff\Likes::played( $this->user, array( array( 'id' => $this->tracks[2] ) ) );
		update_user_option( $this->user, 'riff_first_run_dismissed', 1 );
		update_post_meta( $id, '_riff_tint', '#123456' );
		update_post_meta( $id, '_riff_tint_mine', 'kept' );
		update_option( 'riff_rewrite', RIFF_VERSION );

		if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
			define( 'WP_UNINSTALL_PLUGIN', 'riff/riff.php' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- core's own constant.
		}
		include dirname( __DIR__, 2 ) . '/uninstall.php';
		Catalog::taxonomies();

		$this->assertInstanceOf( WP_Post::class, get_post( $id ), 'the playlist' );
		$this->assertCount( 1, \Riff\Likes::get( $this->user ), 'the like' );
		$this->assertCount( 1, \Riff\Likes::history( $this->user ), 'recently played' );
		$this->assertFalse( get_user_option( 'riff_first_run_dismissed', $this->user ), 'only the notice\'s note goes' );
		$this->assertSame( '', get_post_meta( $id, '_riff_tint', true ), 'the cover tint Riff worked out' );
		$this->assertSame( 'kept', get_post_meta( $id, '_riff_tint_mine', true ), 'and nothing that only starts the same' );
		$this->assertFalse( get_option( 'riff_rewrite' ), 'the note of when the Listen app\'s address was last added' );
	}
}
