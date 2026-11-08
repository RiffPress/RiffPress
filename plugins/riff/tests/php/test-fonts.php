<?php
/**
 * The Listen app's fonts: preloaded with the page, and kept by the installed app's service worker.
 *
 * @package Riff
 */

use Riff\Listen\Fonts;
use Riff\Listen\Standalone;

/**
 * Riff\Listen\Fonts, and Standalone's worker.
 */
class Test_Riff_Fonts extends Riff_TestCase {

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

	public function tear_down(): void {
		delete_option( Standalone::AT_ROOT );
		remove_all_filters( 'riff_app_preload_fonts' );
		remove_all_filters( 'riff_app_precache' );
		parent::tear_down();
	}

	public function test_a_page_without_the_app_preloads_no_font(): void {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->go_to( get_permalink( $post ) );
		$this->assertSame( array(), Fonts::first_paint(), 'the bar is hidden until something plays' );
		$this->assertSame( array(), Fonts::preload( array() ) );
	}

	public function test_the_app_preloads_roboto(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		$this->assertSame( array( RIFF_URL . 'assets/fonts/roboto/roboto.woff2' ), Fonts::first_paint() );
	}

	public function test_the_block_on_a_theme_without_fonts_preloads_inter_and_garamond(): void {
		$this->go_to( get_permalink( $this->listen ) );
		if ( wp_theme_has_theme_json() ) {
			// A block theme's own fonts draw the app; the block's own font stands in for one here.
			$this->markTestSkipped( 'the tests site runs a theme with a theme.json' );
		}
		$this->assertSame(
			array( RIFF_URL . 'assets/fonts/inter/inter.woff2', RIFF_URL . 'assets/fonts/eb-garamond/eb-garamond.woff2' ),
			Fonts::first_paint()
		);
	}

	public function test_a_font_chosen_for_the_block_is_not_preloaded_for_it(): void {
		wp_update_post(
			array(
				'ID'           => $this->listen,
				'post_content' => '<!-- wp:group --><div class="wp-block-group"><!-- wp:riff/app {"fontFamily":"system-sans"} /--></div><!-- /wp:group -->',
			)
		);
		$this->go_to( get_permalink( $this->listen ) );
		$fonts = Fonts::first_paint();
		$this->assertNotContains( RIFF_URL . 'assets/fonts/inter/inter.woff2', $fonts, 'the block, inside a group, sets its text font' );
		$this->assertNotContains( RIFF_URL . 'assets/fonts/eb-garamond/eb-garamond.woff2', $fonts, 'which is its headings\' too' );
	}

	public function test_a_host_adds_its_fonts_and_they_are_preloaded_as_fonts(): void {
		add_filter(
			'riff_app_preload_fonts',
			static fn( $urls ) => array_merge( $urls, array( 'https://cdn.example.com/brand.woff2', 'https://cdn.example.com/brand.woff2', '', 42 ) )
		);
		$this->go_to( Standalone::url( $this->listen ) );
		$resources = Fonts::preload( array( array( 'href' => 'kept' ) ) );
		$this->assertSame( array( 'href' => 'kept' ), $resources[0], 'what was there stays' );
		$this->assertCount( 3, $resources, 'Roboto and the host\'s, once; nothing for what isn\'t an address' );
		$this->assertSame(
			array(
				'href'        => 'https://cdn.example.com/brand.woff2',
				'as'          => 'font',
				'type'        => 'font/woff2',
				'crossorigin' => 'anonymous',
			),
			$resources[2]
		);
	}

	public function test_a_filter_that_returns_nonsense_leaves_riffs_fonts(): void {
		add_filter( 'riff_app_preload_fonts', '__return_null' );
		$this->go_to( Standalone::url( $this->listen ) );
		$this->assertSame( array( RIFF_URL . 'assets/fonts/roboto/roboto.woff2' ), Fonts::first_paint() );
	}

	public function test_the_worker_keeps_the_fonts_and_the_stylesheets_at_the_pages_addresses(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		$files = Fonts::precache();
		$this->assertSame( RIFF_URL . 'assets/fonts/roboto/roboto.woff2', $files[0] );
		$styles = wp_styles();
		foreach ( array( 'riff', 'riff-app', 'riff-frame' ) as $handle ) {
			$style = $styles->registered[ $handle ];
			$this->assertContains( add_query_arg( 'ver', $style->ver, $style->src ), $files, $handle );
		}
	}

	public function test_a_host_adds_to_what_the_worker_keeps_or_turns_it_off(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		add_filter( 'riff_app_precache', static fn( $urls ) => array_merge( $urls, array( 'https://cdn.example.com/brand-bold.woff2' ) ) );
		$this->assertContains( 'https://cdn.example.com/brand-bold.woff2', Fonts::precache() );
		$this->assertStringContainsString( 'https://cdn.example.com/brand-bold.woff2', Standalone::worker_script() );

		add_filter( 'riff_app_precache', '__return_empty_array', 20 );
		$this->assertSame( '', Standalone::worker_registration(), 'nothing to keep, no worker' );
	}

	public function test_the_worker_is_served_beside_the_app_and_scoped_to_it(): void {
		$url = Standalone::worker_url( $this->listen );
		$this->assertSame( trailingslashit( get_permalink( $this->listen ) ) . 'app/worker/', $url );
		$this->go_to( $url );
		$this->assertTrue( Standalone::active() );
		$this->assertSame( Standalone::WORKER, get_query_var( Standalone::QUERY ) );

		$script = Standalone::worker_script();
		$this->assertStringStartsWith( 'self.riffWorker = {"cache":"riff-app-', $script );
		$this->assertStringContainsString( "self.addEventListener( 'fetch'", $script, 'then worker.js' );

		$this->assertSame( untrailingslashit( Standalone::url() ), Standalone::worker_scope(), 'the app and its views' );
		$registration = Standalone::worker_registration();
		$this->assertStringContainsString( wp_json_encode( $url, JSON_UNESCAPED_SLASHES ), $registration );
		$this->assertStringContainsString( wp_json_encode( Standalone::worker_scope(), JSON_UNESCAPED_SLASHES ), $registration );
		$this->assertStringContainsString( 'a.scriptURL!==u', $registration, 'another worker at the same scope is left in place' );
	}

	public function test_without_a_trailing_slash_the_worker_and_its_scope_end_as_the_permalinks_do(): void {
		$this->set_permalink_structure( '/%postname%' );
		$this->assertSame( untrailingslashit( get_permalink( $this->listen ) ) . '/app/worker', Standalone::worker_url( $this->listen ) );
		$this->go_to( Standalone::url( $this->listen ) );
		$this->assertStringEndsWith( '/app', Standalone::worker_scope(), 'so the app at .../app is inside it' );
	}

	public function test_each_apps_caches_are_its_own(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		preg_match( '/"cache":"([^"]+)","prefix":"([^"]+)"/', Standalone::worker_script(), $m );
		$this->assertStringStartsWith( $m[2], $m[1] );
		$other = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
		$this->go_to( Standalone::url( $other ) );
		preg_match( '/"prefix":"([^"]+)"/', Standalone::worker_script(), $n );
		$this->assertNotSame( $m[2], $n[1], 'activating one never clears the other\'s' );
	}

	public function test_a_site_that_turns_the_player_off_preloads_nothing(): void {
		add_filter( 'riff_enabled', '__return_false' );
		$this->go_to( Standalone::url( $this->listen ) );
		$this->assertSame( array(), Fonts::first_paint() );
		remove_filter( 'riff_enabled', '__return_false' );
	}

	public function test_the_worker_keeps_the_script_modules_too(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		$files = Fonts::precache();
		foreach ( array( 'assets/riff.js', 'assets/player/queue.js', 'features/listen/app/views.js' ) as $file ) {
			$this->assertContains( add_query_arg( 'ver', \Riff\Player::version( $file ), RIFF_URL . $file ), $files, $file );
		}
	}

	public function test_a_new_list_is_a_new_cache(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		preg_match( '/"cache":"([^"]+)"/', Standalone::worker_script(), $before );
		add_filter( 'riff_app_precache', static fn( $urls ) => array_merge( $urls, array( 'https://cdn.example.com/new.woff2' ) ) );
		preg_match( '/"cache":"([^"]+)"/', Standalone::worker_script(), $after );
		$this->assertNotSame( $before[1], $after[1] );
	}

	public function test_at_the_site_address_the_worker_answers_there_and_stays(): void {
		update_option( Standalone::AT_ROOT, true );
		$url = Standalone::worker_url( $this->listen );
		$this->assertSame( add_query_arg( 'riff_app', 'worker', home_url( '/' ) ), $url );
		$this->go_to( $url );
		$this->assertTrue( Standalone::active() );
		$this->assertSame( 'worker', get_query_var( 'riff_app' ) );
		$this->assertSame( home_url( '/' ), Standalone::url(), 'its scope is the site\'s address' );
	}
}
