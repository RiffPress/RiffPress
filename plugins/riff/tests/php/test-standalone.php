<?php
/**
 * Standalone mode.
 *
 * @package Riff
 */

use Riff\Listen\App;
use Riff\Listen\Standalone;

/**
 * Riff\Listen\Standalone.
 */
class Test_Riff_Standalone extends Riff_TestCase {

	/**
	 * A Listen page.
	 *
	 * @var int
	 */
	private int $listen = 0;

	public function set_up(): void {
		parent::set_up();
		$this->set_permalink_structure( '/%postname%/' );
		Standalone::endpoint();
		flush_rewrite_rules( false );
		$this->listen = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_name'    => 'listen',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
	}

	public function test_a_listen_pages_app_address_is_standalone_and_its_own_address_is_not(): void {
		$this->go_to( get_permalink( $this->listen ) );
		$this->assertFalse( Standalone::active() );

		$this->go_to( Standalone::url( $this->listen ) );
		$this->assertTrue( Standalone::active() );
		$this->assertSame( trailingslashit( get_permalink( $this->listen ) ) . 'app/', Standalone::url( $this->listen ) );
	}

	public function test_a_page_without_the_player_has_no_app(): void {
		$plain = self::factory()->post->create(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
			)
		);
		$this->go_to( trailingslashit( get_permalink( $plain ) ) . 'app/' );

		$this->assertFalse( Standalone::active() );
	}

	public function test_a_page_on_the_listen_template_holds_the_player(): void {
		$page = self::factory()->post->create(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
			)
		);
		update_post_meta( $page, '_wp_page_template', 'listen' );

		$this->assertTrue( Standalone::holds_player( get_post( $page ) ) );
	}

	public function test_without_pretty_permalinks_it_is_a_query_argument(): void {
		$this->set_permalink_structure( '' );

		$this->assertSame( add_query_arg( 'riff_app', '1', get_permalink( $this->listen ) ), Standalone::url( $this->listen ) );
		$this->assertSame( add_query_arg( 'riff_app', 'manifest', get_permalink( $this->listen ) ), Standalone::url( $this->listen, true ) );
	}

	public function test_the_manifest_installs_the_app_page_in_riffs_colours(): void {
		$this->go_to( Standalone::url( $this->listen ) );

		$manifest = Standalone::manifest_data();

		$this->assertSame( 'standalone', $manifest['display'] );
		$this->assertSame( Standalone::url( $this->listen ), $manifest['start_url'] );
		$this->assertSame( $manifest['start_url'], $manifest['scope'], 'the app stays inside app/' );
		$this->assertSame( '#030303', $manifest['theme_color'] );
		$this->assertSame( array( '192x192', '512x512' ), wp_list_pluck( $manifest['icons'], 'sizes' ) );
		$this->assertStringContainsString( 'features/listen/icons/icon-192.png', $manifest['icons'][0]['src'], 'Riff\'s icon when the site has none' );
		foreach ( array( 192, 512 ) as $size ) {
			$this->assertFileExists( RIFF_DIR . "features/listen/icons/icon-$size.png", 'the icon ships with the plugin' );
		}
	}

	public function test_the_document_is_riffs_own_with_links_that_stay_in_the_app(): void {
		$this->go_to( Standalone::url( $this->listen ) );

		$this->assertSame( RIFF_DIR . 'templates/standalone.php', Standalone::template( '/theme/page.php' ) );
		$html = App::render();

		$this->assertStringContainsString( 'data-riff-page="' . esc_url( Standalone::url( $this->listen ) ) . '"', $html );
		$this->assertStringContainsString( '--riff-app-bg:#030303', $html, 'Riff\'s dark look, not the theme\'s colours' );
		$this->assertStringContainsString( 'riff-app-themed', $html, 'the quieter shades are mixed from it' );
		$this->assertSame(
			'/theme/page.php',
			( function () {
				$this->go_to( get_permalink( $this->listen ) );
				return Standalone::template( '/theme/page.php' );
			} )(),
			'the Listen page itself keeps the theme'
		);
	}

	public function test_under_a_block_theme_the_document_has_one_title_and_one_viewport(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		// What core does when a block theme supplies the template (locate_block_template()), before
		// template_include gets to Riff: its own title and viewport tags, in wp_head.
		remove_action( 'wp_head', '_wp_render_title_tag', 1 );
		add_action( 'wp_head', '_block_template_render_title_tag', 1 );
		add_action( 'wp_head', '_block_template_viewport_meta_tag', 0 );

		ob_start();
		require Standalone::template( '/theme/page.php' );
		$html = (string) ob_get_clean();

		$this->assertSame( 1, substr_count( $html, '<title>' ), 'one title' );
		$this->assertSame( 1, substr_count( $html, '<meta name="viewport"' ), 'one viewport' );
		$this->assertStringContainsString( 'viewport-fit=cover', $html, 'Riff\'s, so the bar clears the home indicator' );
	}

	public function test_the_app_fetches_its_font_with_the_page_and_has_a_fallback_of_its_size(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		Standalone::template( '/theme/page.php' );

		$resources = apply_filters( 'wp_preload_resources', array() );
		$this->assertContains(
			array(
				'href'        => RIFF_URL . 'assets/fonts/roboto/roboto.woff2',
				'as'          => 'font',
				'type'        => 'font/woff2',
				'crossorigin' => 'anonymous',
			),
			$resources,
			'the file riff.css names, so the browser uses what it preloaded'
		);
		$this->assertStringContainsString( 'url(fonts/roboto/roboto.woff2)', (string) file_get_contents( RIFF_DIR . 'assets/riff.css' ) );
		$this->assertStringContainsString( '"Riff Roboto Fallback"', Standalone::tokens()['--riff-app-font'], 'text drawn before Roboto arrives takes its room' );
		remove_filter( 'wp_preload_resources', array( Standalone::class, 'preload' ) );
	}

	public function test_the_themes_assets_and_the_block_styles_stay_out(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		wp_enqueue_style( 'a-theme', get_theme_root_uri() . '/any/style.css', array(), '1' );
		wp_enqueue_script( 'a-theme', get_theme_root_uri() . '/any/script.js', array(), '1', true );
		wp_enqueue_style( 'wp-block-library' );
		wp_enqueue_style( 'another-plugin', plugins_url( 'another/style.css' ), array(), '1' );
		wp_enqueue_style( 'riff', RIFF_URL . 'assets/riff.css', array(), '1' );

		Standalone::strip();

		$this->assertFalse( wp_style_is( 'a-theme' ) );
		$this->assertFalse( wp_script_is( 'a-theme' ) );
		$this->assertFalse( wp_style_is( 'wp-block-library' ) );
		$this->assertTrue( wp_style_is( 'another-plugin' ), 'other plugins keep working in the app' );
		$this->assertTrue( wp_style_is( 'riff' ) );
	}

	public function test_the_admin_bar_stays_out_of_the_app(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->go_to( Standalone::url( $this->listen ) );

		Standalone::no_admin_bar();

		$this->assertFalse( apply_filters( 'show_admin_bar', true ) );
	}
}
