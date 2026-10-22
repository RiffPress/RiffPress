<?php
/**
 * Your Library in the Listen block.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Likes;
use Riff\Listen\App;
use Riff\Listen\Browse;
use Riff\Listen\Collection;

/**
 * Riff\Listen\Collection.
 */
class Test_Riff_Collection extends Riff_TestCase {

	/**
	 * The Listen page.
	 *
	 * @var int
	 */
	private int $page = 0;

	/**
	 * Two tracks on a published post.
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

	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		$post         = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->tracks = array(
			self::attach( '02 - Underground [underground].mp3', $post ),
			self::attach( '03 - Trombone Detritus [detritus].mp3', $post ),
		);
		$draft        = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		$this->secret = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $draft );
		$this->page   = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
	}

	public function tear_down(): void {
		foreach ( array_merge( Browse::ARGS, array( App::PAGE_QUERY, Collection::LIKED ) ) as $key ) {
			unset( $_GET[ $key ] );
		}
		parent::tear_down();
	}

	/**
	 * The block at Your Library's address, with more arguments.
	 *
	 * @param array $args Query arguments.
	 * @return string
	 */
	private function library( array $args = array() ): string {
		$args = array( Browse::VIEW => 'library' ) + $args;
		$this->go_to( add_query_arg( $args, get_permalink( $this->page ) ) );
		foreach ( $args as $key => $value ) {
			$_GET[ $key ] = (string) $value; // go_to() does not fill $_GET; the block reads it.
		}
		return App::render();
	}

	/**
	 * The album's term ID.
	 *
	 * @return int
	 */
	private function album(): int {
		return (int) get_term_by( 'name', 'Compositions', Catalog::ALBUM )->term_id;
	}

	/**
	 * The artist's term ID.
	 *
	 * @return int
	 */
	private function artist(): int {
		return (int) get_term_by( 'name', 'Airmen of Note, United States Air Force Band', Catalog::ARTIST )->term_id;
	}

	public function test_the_navigation_has_your_library_last(): void {
		$html = $this->library();

		$this->assertMatchesRegularExpression( '/riff_view=posts.*riff_view=library/s', $html, 'after the site\'s own lists' );
		$this->assertMatchesRegularExpression( '/<a class="riff-app-tab riff-app-tab-library" href="[^"]*riff_view=library"[^>]*aria-current="page"/', $html );
		$this->assertStringContainsString( 'Your Library', $html );
	}

	public function test_a_visitor_sees_the_likes_their_browser_sends_and_how_to_keep_them(): void {
		wp_set_current_user( 0 );
		$html = $this->library( array( Collection::LIKED => 'a' . $this->album() . ',t' . $this->tracks[1] . ',x9,t' . $this->secret . ',r' . $this->artist() ) );

		$this->assertStringContainsString( 'data-riff-library="device"', $html );
		$this->assertStringContainsString( 'Liked songs', $html );
		$this->assertStringContainsString( '1 song', $html, 'the draft\'s track is not counted for a visitor' );
		$this->assertStringContainsString( 'data-riff-album="' . $this->album() . '"', $html );
		$this->assertStringContainsString( 'data-riff-artist="' . $this->artist() . '"', $html );
		$this->assertLessThan( strpos( $html, 'data-riff-artist=' ), strpos( $html, 'data-riff-album=' ), 'newest first: the album was liked after the artist' );
		$this->assertStringContainsString( 'kept in this browser', $html );
		$this->assertStringContainsString( 'wp-login.php', $html );
	}

	public function test_alphabetical_puts_the_artist_before_the_album_however_they_were_liked(): void {
		wp_set_current_user( 0 );
		$html = $this->library(
			array(
				Collection::LIKED => 'a' . $this->album() . ',r' . $this->artist(),
				Browse::SORT      => 'name',
			)
		);

		$this->assertLessThan( strpos( $html, 'data-riff-album=' ), strpos( $html, 'data-riff-artist=' ), 'Airmen of Note before Compositions' );
		$this->assertMatchesRegularExpression( '/<a class="riff-sort-link" href="[^"]*riff_sort=name"[^>]*aria-current="true">Alphabetical/', $html );
	}

	public function test_liked_songs_are_rows_with_play_and_shuffle(): void {
		wp_set_current_user( 0 );
		$html = $this->library(
			array(
				Collection::LIKED => 't' . $this->tracks[1] . ',t' . $this->tracks[0] . ',t' . $this->secret,
				Browse::FILTER    => 'songs',
			)
		);

		$this->assertSame( 2, substr_count( $html, 'data-riff-track=' ), 'the two a visitor may see' );
		$this->assertLessThan( strpos( $html, 'Underground' ), strpos( $html, 'Trombone Detritus' ), 'newest first' );
		$this->assertStringContainsString( 'data-riff-app-action="shuffle"', $html );
		$this->assertMatchesRegularExpression( '/<a class="riff-chip-link" href="[^"]*riff_filter=songs"[^>]*aria-current="true">Songs/', $html );
	}

	public function test_a_signed_in_listener_sees_their_account_and_not_what_the_address_says(): void {
		$user = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $user );
		Likes::add(
			$user,
			array(
				array(
					'kind' => 'track',
					'id'   => $this->tracks[0],
				),
			)
		);
		$html = $this->library(
			array(
				Collection::LIKED => 't' . $this->tracks[1],
				Browse::FILTER    => 'songs',
			)
		);

		$this->assertStringContainsString( 'data-riff-library="account"', $html );
		$this->assertStringContainsString( 'Underground', $html );
		$this->assertStringNotContainsString( 'Trombone Detritus', $html );
		$this->assertStringNotContainsString( 'kept in this browser', $html );
	}

	public function test_with_nothing_liked_the_library_still_has_liked_songs_and_somewhere_to_start(): void {
		wp_set_current_user( 0 );
		$html = $this->library();

		$this->assertMatchesRegularExpression( '/<div class="riff-grid riff-library-grid"><div class="riff-card riff-card-liked">/', $html, 'Liked songs leads, with nothing liked' );
		$this->assertStringContainsString( 'Press the heart on a song to keep it here', $html );
		$this->assertStringNotContainsString( 'data-riff-app-action="play-liked"', $html, 'nothing to play yet' );
		$this->assertMatchesRegularExpression( '/<section class="riff-shelf" data-riff-shelf="recent"[^>]* hidden>/', $html, 'Recently played, for the script to fill from the player\'s history' );
		$this->assertMatchesRegularExpression( '/data-riff-shelf="start".*Start with.*data-riff-app-action="play-album" data-riff-album="' . $this->album() . '"/s', $html, 'the site\'s albums, playable from the cover' );
	}

	public function test_liked_songs_play_from_their_card_and_the_start_row_goes(): void {
		wp_set_current_user( 0 );
		$html = $this->library( array( Collection::LIKED => 't' . $this->tracks[1] . ',t' . $this->tracks[0] ) );

		$this->assertSame( 1, preg_match( '/data-riff-app-action="play-liked" data-riff-tracks="([^"]+)"/', $html, $m ) );
		$this->assertSame( array( 'Trombone Detritus', 'Underground' ), wp_list_pluck( json_decode( html_entity_decode( $m[1] ), true ), 'title' ), 'newest first' );
		$this->assertStringContainsString( '2 songs', $html );
		$this->assertStringNotContainsString( 'data-riff-shelf="start"', $html );
		$this->assertStringContainsString( 'data-riff-shelf="recent"', $html );
	}

	public function test_each_list_says_how_to_fill_it_while_it_is_empty(): void {
		wp_set_current_user( 0 );
		$this->assertStringContainsString( 'Songs you like show up here', $this->library( array( Browse::FILTER => 'songs' ) ) );
		$this->assertStringContainsString( 'Albums you like show up here', $this->library( array( Browse::FILTER => 'albums' ) ) );
		$this->assertStringContainsString( 'Artists you like show up here', $this->library( array( Browse::FILTER => 'artists' ) ) );
	}

	public function test_an_album_and_an_artist_have_a_heart_and_a_post_does_not(): void {
		$this->go_to( add_query_arg( Browse::ALBUM, $this->album(), get_permalink( $this->page ) ) );
		$_GET[ Browse::ALBUM ] = (string) $this->album();
		$this->assertStringContainsString( 'data-riff-like-kind="album" data-riff-like-id="' . $this->album() . '"', App::render() );
		unset( $_GET[ Browse::ALBUM ] );

		$_GET[ Browse::ARTIST ] = (string) $this->artist();
		$this->assertStringContainsString( 'data-riff-like-kind="artist" data-riff-like-id="' . $this->artist() . '"', App::render() );
		unset( $_GET[ Browse::ARTIST ] );

		$this->assertStringNotContainsString( 'data-riff-like-kind', App::header( 'A post', '2 tracks' ) );
	}
}
