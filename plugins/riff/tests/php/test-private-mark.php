<?php
/**
 * The mark on what visitors can't see: a card, a row's track, a list's head and a private site.
 *
 * @package Riff
 */

use Riff\Library;
use Riff\Private_Site;
use Riff\Tracks;
use Riff\Listen\App;
use Riff\Listen\Browse;
use Riff\Listen\Ui;

/**
 * Library::is_private() and where the Listen app shows it.
 */
class Test_Riff_Private_Mark extends Riff_TestCase {

	/**
	 * A post with one track, by an administrator.
	 *
	 * @param array $args Post fields.
	 * @return int[] Post ID, track ID and the author's ID.
	 */
	private function post_with_track( array $args ): array {
		$owner = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$post  = self::factory()->post->create( $args + array( 'post_author' => $owner ) );
		$id    = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		return array( $post, $id, $owner );
	}

	public function tear_down(): void {
		wp_set_current_user( 0 );
		delete_option( Private_Site::OPTION );
		parent::tear_down();
	}

	public function test_a_post_visitors_cannot_see_is_private_only_to_someone_signed_in(): void {
		list( $private, , $owner ) = $this->post_with_track( array( 'post_status' => 'private' ) );
		list( $draft )             = $this->post_with_track( array( 'post_status' => 'draft' ) );
		list( $password )          = $this->post_with_track(
			array(
				'post_status'   => 'publish',
				'post_password' => 'riff',
			)
		);
		list( $public )            = $this->post_with_track( array( 'post_status' => 'publish' ) );

		$this->assertFalse( Library::is_private( $private ), 'a visitor is never told, so a cached page is the same for every visitor' );
		$this->assertFalse( Library::is_private( $password ) );

		wp_set_current_user( $owner );
		$this->assertTrue( Library::is_private( $private ) );
		$this->assertTrue( Library::is_private( $draft ) );
		$this->assertTrue( Library::is_private( $password ), 'behind a password, as Tracks hides its files from visitors' );
		$this->assertFalse( Library::is_private( $public ) );
		$this->assertFalse( Library::is_private( 0 ) );
	}

	public function test_a_track_says_its_post_is_private_in_the_payload(): void {
		list( $private, $id, $owner ) = $this->post_with_track( array( 'post_status' => 'private' ) );
		list( $public, $open )        = $this->post_with_track( array( 'post_status' => 'publish' ) );

		$this->assertFalse( Tracks::from_attachment( $open, $public )['post']['private'], 'always there, false for a public post' );
		$this->assertFalse( Tracks::from_attachment( $id, $private )['post']['private'], 'false for a visitor' );
		wp_set_current_user( $owner );
		$this->assertTrue( Tracks::from_attachment( $id, $private )['post']['private'] );
		$this->assertFalse( Tracks::from_attachment( $open, $public )['post']['private'] );
	}

	public function test_a_card_marks_it_quietly_with_the_word_said(): void {
		$card = Ui::card(
			array(
				'title'   => 'Carols of the Season',
				'sub'     => 'The Chorus',
				'private' => true,
			)
		);

		$this->assertStringContainsString( '<span class="riff-card-sub"><span class="riff-private"><svg', $card, 'at the head of the line under the title' );
		$this->assertStringContainsString( '<span class="riff-app-sr">Private, </span></span>The Chorus</span>', $card, 'a real word for a screen reader, not a title attribute' );
		$this->assertStringNotContainsString( 'riff-private', Ui::card( array( 'title' => 'Compositions' ) ), 'nothing unless asked' );
	}

	public function test_jump_back_in_marks_a_private_post_for_its_owner_and_a_visitor_never_gets_one(): void {
		list( $private, $id, $owner ) = $this->post_with_track( array( 'post_status' => 'private' ) );
		list( $public, $open )        = $this->post_with_track( array( 'post_status' => 'publish' ) );
		$page                         = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app {"align":"full"} /-->',
			)
		);
		do_action( 'rest_api_init' );
		$request = new WP_REST_Request( 'GET', '/riff/v1/played' );
		$request->set_query_params(
			array(
				'items' => "$id:$private,$open:$public",
				'page'  => get_permalink( $page ),
			)
		);

		$visitor = rest_do_request( $request )->get_data();
		$this->assertStringNotContainsString( 'riff-private', $visitor['jump'] . $visitor['recent'], 'a visitor learns nothing of the private post' );
		$this->assertStringNotContainsString( 'riff=' . $private, $visitor['jump'] );

		wp_set_current_user( $owner );
		$own = rest_do_request( $request )->get_data();
		$this->assertSame( 2, preg_match_all( '#class="riff-card[ "]#', $own['jump'] ) );
		$this->assertSame( 1, substr_count( $own['jump'], 'class="riff-private"' ), 'the private post, not the public one' );
		$this->assertMatchesRegularExpression( '#riff=' . $private . '"><span class="riff-card-title">[^<]*</span></a><span class="riff-card-sub"><span class="riff-private">#', $own['jump'] );
		$this->assertSame( 1, substr_count( $own['recent'], 'class="riff-private"' ), 'Recently played too' );
	}

	public function test_a_lists_head_says_it_in_words_and_links_where_it_is_changed(): void {
		list( $private, , $owner ) = $this->post_with_track( array( 'post_status' => 'private' ) );
		list( $public )            = $this->post_with_track( array( 'post_status' => 'publish' ) );

		$this->assertStringNotContainsString( 'riff-private', App::header( 'Carols', 'The Chorus', post: $private ), 'a visitor is never told' );

		wp_set_current_user( $owner );
		$head = App::header( 'Carols', 'The Chorus', post: $private );
		$this->assertMatchesRegularExpression( '#<p class="riff-album-meta"><a class="riff-private riff-private-shown" href="[^"]*post=' . $private . '&\#038;action=edit"><svg[^>]*aria-hidden="true"[^>]*>.*?</svg><span class="riff-private-word">Private</span></a> · The Chorus</p>#', $head );
		$this->assertStringNotContainsString( 'riff-private', App::header( 'Compositions', 'The Airmen of Note', post: $public ) );
		$this->assertStringNotContainsString( 'riff-private', App::header( 'Compositions', 'The Airmen of Note' ) );

		$stranger = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $stranger );
		$this->assertStringNotContainsString( 'riff-private', App::header( 'Carols', 'The Chorus', post: $private ), 'signed in is not enough: only someone who may read the post' );
	}

	public function test_a_private_site_has_one_mark_beside_its_name(): void {
		$owner = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $owner );
		$this->assertStringNotContainsString( 'riff-private', Browse::nav( home_url( '/' ), null ) );

		update_option( Private_Site::OPTION, true );
		$nav = Browse::nav( home_url( '/' ), null );
		$this->assertSame( 1, substr_count( $nav, '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 21L10.6587' ) );
		$this->assertMatchesRegularExpression( '#<span class="riff-app-name">[^<]*</span><a class="riff-private riff-private-shown" href="[^"]*options-reading\.php">#', $nav );

		$member = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $member );
		$this->assertStringContainsString( '</span><span class="riff-private riff-private-shown">', Browse::nav( home_url( '/' ), null ), 'a member is told, without a link to the setting' );
	}
}
