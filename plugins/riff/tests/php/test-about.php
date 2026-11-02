<?php
/**
 * The About panel: registered as any plugin's view is, its sections in the order the filter gives,
 * and what its script reads.
 *
 * @package Riff
 */

use Riff\About;
use Riff\Registry;

/**
 * @covers \Riff\About
 */
class Test_Riff_About extends Riff_TestCase {

	public function tear_down(): void {
		remove_all_filters( 'riff_about_sections' );
		delete_transient( 'riff_listen_page' );
		parent::tear_down();
	}

	public function test_about_is_a_panel_beside_the_page_after_the_songs_own_views_and_before_up_next(): void {
		$panels = Registry::views( 'side' );
		$this->assertSame( 'About', $panels['about']['label'] ?? null );
		$this->assertSame( array( 'about', 'queue' ), array_keys( $panels ), 'before Up next' );
		$this->assertMatchesRegularExpression( '#data-riff-control="turntable".*data-riff-control="about".*data-riff-control="queue"#s', Registry::bar() );
		$this->assertStringContainsString( 'data-riff-chip="about"', Registry::chips(), 'a chip in Now Playing on a phone' );
	}

	public function test_riffs_own_sections_are_drawn_hidden_in_their_order(): void {
		$panels = Registry::panels();
		$this->assertStringContainsString( '<div class="riff-panel riff-panel-about" data-riff-panel="about" data-riff-label="About" hidden>', $panels );
		$this->assertStringContainsString( '<div class="riff-about-part riff-about-track" data-riff-about="track" hidden><div class="riff-about-body"></div></div>', $panels, 'the track has no heading of its own' );
		$this->assertStringContainsString( '<div class="riff-about-part riff-about-credits" data-riff-about="credits" hidden><h3 class="riff-about-heading">Credits</h3><div class="riff-about-body"></div></div>', $panels );
		$this->assertMatchesRegularExpression( '#data-riff-about="track".*data-riff-about="credits"#s', $panels );
	}

	public function test_a_plugin_adds_a_section_in_its_place_and_can_take_riffs_away(): void {
		add_filter(
			'riff_about_sections',
			static function ( $sections ) {
				$sections['tour']        = array(
					'label'  => 'On tour <b>now</b>',
					'order'  => 15,
					'render' => static fn( $id ) => '<p class="tour">' . esc_html( $id ) . '</p>',
				);
				$sections['Not An Id']   = array( 'label' => 'Refused' );
				$sections['no-settings'] = 'not an array';
				return $sections;
			}
		);
		$sections = About::sections();
		$this->assertSame( array( 'track', 'tour', 'credits' ), array_keys( $sections ), 'by order, and only what is a section' );
		$html = About::render();
		$this->assertStringContainsString( '<div class="riff-about-part riff-about-tour" data-riff-about="tour" hidden><h3 class="riff-about-heading">On tour &lt;b&gt;now&lt;/b&gt;</h3><div class="riff-about-body"><p class="tour">tour</p></div></div>', $html, 'its heading as text, its body as its render drew it' );
		$this->assertStringNotContainsString( 'Refused', $html );

		add_filter(
			'riff_about_sections',
			static function ( $sections ) {
				unset( $sections['credits'] );
				return $sections;
			},
			20
		);
		$this->assertArrayNotHasKey( 'credits', About::sections() );
	}

	public function test_a_site_can_take_the_panel_away_and_its_script_gets_nothing(): void {
		add_action( Registry::HOOK, static fn() => riff_unregister_view( 'about' ), 20 );
		$this->assertArrayNotHasKey( 'about', Registry::views() );
		$this->assertArrayNotHasKey( 'about', About::player_data( array() ) );
	}

	public function test_its_script_is_told_the_media_route_and_where_albums_and_artists_are(): void {
		delete_transient( 'riff_listen_page' );
		$page = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app {"align":"full"} /-->',
			)
		);
		$data = About::player_data( array() )['about'] ?? array();
		$this->assertSame( rest_url( 'wp/v2/media/' ), $data['media'] ?? null );
		$this->assertSame( get_permalink( $page ), $data['listen'] ?? null, 'the site\'s Listen page' );
		$this->assertSame( 'riff_album', $data['album'] ?? null );
		$this->assertSame( 'riff_artist', $data['artist'] ?? null );
		$this->assertSame( (string) $page, get_transient( 'riff_listen_page' ), 'kept, as every page asks' );

		wp_trash_post( $page );
		$this->assertFalse( get_transient( 'riff_listen_page' ), 'forgotten once a page changes' );
		$this->assertSame( '', About::listen(), 'a site with no Listen page has no links' );

		self::factory()->post->create( array( 'post_title' => 'A post' ) );
		$this->assertSame( '0', get_transient( 'riff_listen_page' ), 'a post is not a page, and leaves it be' );
	}

	public function test_the_media_route_hands_back_the_tags_and_the_terms_it_reads(): void {
		$id = self::attach( '02 - Underground [underground].mp3' );
		wp_update_attachment_metadata( $id, wp_get_attachment_metadata( $id ) );

		$request = new WP_REST_Request( 'GET', '/wp/v2/media/' . $id );
		$request->set_param( '_fields', 'media_details,riff_albums,riff_artists' );
		$data = rest_get_server()->response_to_data( rest_do_request( $request ), false );

		$tags = $data['media_details'] ?? array();
		$this->assertSame( 'Tyler Kuebler', $tags['composer'] ?? null, 'the composer, as WordPress read it on upload' );
		$this->assertSame( 'Jazz', $tags['genre'] ?? null );
		$this->assertSame( 'The Airmen of Note', $tags['band'] ?? null, 'the album\'s artist' );
		$this->assertSame( 'Public domain — U.S. Government work', $tags['copyright_message'] ?? null );
		$this->assertSame( '2', (string) ( $tags['track_number'] ?? '' ) );

		// The IDs it is filed under, named through Riff's own routes, as WordPress's are closed.
		$named = static function ( string $route, array $ids ): array {
			$request = new WP_REST_Request( 'GET', '/riff/v1/' . $route );
			$request->set_param( 'include', $ids );
			return array_column( rest_do_request( $request )->get_data()['items'] ?? array(), 'name' );
		};
		$this->assertSame( array( 'Compositions' ), $named( 'albums', (array) ( $data['riff_albums'] ?? array() ) ), 'the album it is filed under' );
		$this->assertContains( 'Airmen of Note, United States Air Force Band', $named( 'artists', (array) ( $data['riff_artists'] ?? array() ) ) );
	}
}
