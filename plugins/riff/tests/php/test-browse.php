<?php
/**
 * Browsing the Media Library in the Listen block.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Listen\App;
use Riff\Listen\Browse;

/**
 * Riff\Listen\Browse.
 */
class Test_Riff_Browse extends Riff_TestCase {

	/**
	 * The Listen page.
	 *
	 * @var int
	 */
	private int $page = 0;

	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		self::attach( '02 - Underground [underground].mp3', $post );
		self::attach( '03 - Trombone Detritus [detritus].mp3', $post );
		$draft  = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		$secret = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $draft );
		wp_update_attachment_metadata(
			$secret,
			array(
				'album'  => 'Secret Sessions',
				'artist' => 'Hidden Artist',
			)
		);
		$this->page = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
	}

	public function tear_down(): void {
		foreach ( Browse::ARGS as $key ) {
			unset( $_GET[ $key ] );
		}
		unset( $_GET[ App::PAGE_QUERY ] );
		parent::tear_down();
	}

	/**
	 * The block at an address, as a visitor.
	 *
	 * @param array $args Query arguments.
	 * @return string
	 */
	private function render_at( array $args ): string {
		$this->go_to( add_query_arg( $args, get_permalink( $this->page ) ) );
		foreach ( $args as $key => $value ) {
			$_GET[ $key ] = (string) $value; // go_to() does not fill $_GET; the block reads it.
		}
		return App::render();
	}

	/**
	 * The album's term ID.
	 *
	 * @param string $name Album name.
	 * @return int
	 */
	private function album( string $name ): int {
		return (int) get_term_by( 'name', $name, Catalog::ALBUM )->term_id;
	}

	public function test_the_address_names_a_view_and_anything_else_is_not_one(): void {
		$this->go_to( get_permalink( $this->page ) );
		$this->assertNull( Browse::requested() );

		$_GET[ Browse::VIEW ] = 'albums';
		$this->assertSame( 'albums', Browse::requested()['view'] );
		$_GET[ Browse::VIEW ] = 'everything';
		$this->assertNull( Browse::requested(), 'only the three lists' );
		$_GET[ Browse::ALBUM ] = '12abc';
		$this->assertNull( Browse::requested(), 'an album is a number' );
		$_GET[ Browse::SEARCH ] = '  blue  ';
		$this->assertSame( 'blue', Browse::requested()['search'] );
	}

	public function test_the_navigation_marks_where_you_are_and_search_works_without_the_script(): void {
		$html = $this->render_at( array( Browse::VIEW => 'albums' ) );

		$this->assertMatchesRegularExpression( '#<a class="riff-app-tab" href="[^"]*riff_view=albums" aria-current="page"><svg[^>]*><path d="[^"]+"/></svg><span>Albums</span></a>#', $html );
		$this->assertStringContainsString( '<a class="riff-app-tab riff-app-home" href="' . esc_url( get_permalink( $this->page ) ) . '"><svg', $html, 'the library link the script and the tests know' );
		$this->assertStringContainsString( '<span class="riff-app-brand">', $html, 'the site\'s name, for the sidebar' );
		$this->assertStringContainsString( 'role="search" action="' . esc_url( strtok( get_permalink( $this->page ), '?' ) ) . '" method="get"', $html );
		$this->assertStringContainsString( 'name="riff_search"', $html );
		$this->assertStringContainsString( 'data-riff-browse="riff_view,riff_album,riff_artist,riff_search"', $html );
	}

	public function test_albums_show_only_what_a_visitor_may_see(): void {
		$html = $this->render_at( array( Browse::VIEW => 'albums' ) );

		$this->assertStringContainsString( 'data-riff-app-action="play-album" data-riff-album="' . $this->album( 'Compositions' ) . '"', $html );
		$this->assertStringContainsString( 'The Airmen of Note · 2 tracks', $html );
		$this->assertStringNotContainsString( 'Secret Sessions', $html );
	}

	public function test_an_album_opens_as_rows_in_its_order_with_play_and_shuffle(): void {
		$html = $this->render_at( array( Browse::ALBUM => $this->album( 'Compositions' ) ) );

		$this->assertStringContainsString( '<h2 class="riff-album-title" tabindex="-1">Compositions</h2>', $html );
		$this->assertSame( 2, substr_count( $html, 'data-riff-track=' ), 'rows the player takes over' );
		$this->assertLessThan( strpos( $html, 'Trombone Detritus' ), strpos( $html, 'Underground' ), 'track 2 before track 3' );
		$this->assertStringContainsString( 'data-riff-tracks="', $html );
		$this->assertStringContainsString( 'data-riff-app-action="shuffle"', $html );
	}

	public function test_a_private_album_cannot_be_opened_by_its_number(): void {
		$html = $this->render_at( array( Browse::ALBUM => $this->album( 'Secret Sessions' ) ) );

		$this->assertStringNotContainsString( 'Brand New Day', $html );
		$this->assertStringContainsString( '>Albums</h2>', $html, 'it falls back to the albums list' );
	}

	public function test_artists_and_an_artist(): void {
		$list = $this->render_at( array( Browse::VIEW => 'artists' ) );
		$this->assertStringContainsString( 'Airmen of Note, United States Air Force Band', $list );
		$this->assertStringNotContainsString( 'Hidden Artist', $list );

		$id   = (int) get_term_by( 'name', 'Airmen of Note, United States Air Force Band', Catalog::ARTIST )->term_id;
		$html = $this->render_at( array( Browse::ARTIST => $id ) );
		$this->assertSame( 2, substr_count( $html, 'data-riff-track=' ) );
	}

	public function test_search_finds_albums_artists_and_tracks_or_says_nothing_matched(): void {
		$html = $this->render_at( array( Browse::SEARCH => 'compos' ) );
		$this->assertStringContainsString( 'Results for “compos”', $html );
		$this->assertStringContainsString( 'data-riff-album=', $html );
		$this->assertStringContainsString( 'data-riff-track=', $html );

		$none = $this->render_at( array( Browse::SEARCH => 'zzzz' ) );
		$this->assertStringContainsString( 'Nothing matches that.', $none );

		$hostile = $this->render_at( array( Browse::SEARCH => '<script>x</script>' ) );
		$this->assertStringNotContainsString( '<script>x', $hostile, 'the words are escaped' );
	}

	public function test_tracks_list_every_visible_track(): void {
		$html = $this->render_at( array( Browse::VIEW => 'tracks' ) );

		$this->assertSame( 2, substr_count( $html, 'data-riff-track=' ) );
		$this->assertStringContainsString( '2 tracks', $html );
	}

	public function test_a_post_address_still_wins_over_a_browse_one(): void {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id   = self::attach( '05 - Stole Back My Soul [stole-back].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);

		$html = $this->render_at(
			array(
				App::QUERY   => $post,
				Browse::VIEW => 'albums',
			)
		);

		$this->assertStringContainsString( get_the_title( $post ), $html );
		$this->assertStringNotContainsString( '>Albums</h2>', $html );
	}
}
