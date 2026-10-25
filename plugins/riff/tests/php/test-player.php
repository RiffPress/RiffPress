<?php
/**
 * The player on the page: when it loads, what it prints.
 *
 * @package Riff
 */

use Riff\Player;

/**
 * @covers \Riff\Player
 */
class Test_Riff_Player extends Riff_TestCase {

	public function test_it_loads_on_the_front_end_and_not_in_feeds(): void {
		$this->go_to( home_url( '/' ) );
		$this->assertTrue( Player::enabled() );

		$this->go_to( get_feed_link() );
		$this->assertFalse( Player::enabled() );
	}

	public function test_a_site_can_switch_it_off(): void {
		$this->go_to( home_url( '/' ) );
		add_filter( 'riff_enabled', '__return_false' );
		$this->assertFalse( Player::enabled() );
		remove_filter( 'riff_enabled', '__return_false' );

		ob_start();
		add_filter( 'riff_enabled', '__return_false' );
		Player::markup();
		remove_filter( 'riff_enabled', '__return_false' );
		$this->assertSame( '', ob_get_clean() );
	}

	public function test_the_markup_carries_the_player_and_no_strings_of_its_own(): void {
		$this->go_to( home_url( '/' ) );
		ob_start();
		Player::markup();
		$html = ob_get_clean();

		$this->assertStringContainsString( '<div id="riff" class="riff" hidden>', $html );
		$this->assertStringContainsString( 'class="riff-audio"', $html );
		$this->assertStringContainsString( 'class="riff-video"', $html );
		$this->assertStringContainsString( 'data-riff-wire', $html );
		$this->assertMatchesRegularExpression( '#<script type="application/json" id="riff-data">(.+?)</script>#s', $html );
	}

	public function test_assets_are_enqueued_with_a_cache_key_that_follows_the_file(): void {
		$this->go_to( home_url( '/' ) );
		Player::enqueue();
		$this->assertTrue( wp_style_is( 'riff', 'enqueued' ) );
		$this->assertStringStartsWith( RIFF_VERSION . '.', wp_styles()->registered['riff']->ver );
		$this->assertSame( RIFF_VERSION . '.' . filemtime( RIFF_DIR . 'assets/riff.css' ), wp_styles()->registered['riff']->ver );
	}

	public function test_each_surface_has_its_own_stylesheet_loaded_only_where_it_applies(): void {
		// An earlier test's render may have enqueued the app's; each request here starts clean.
		wp_styles()->queue = array();
		$this->go_to( home_url( '/' ) );
		Player::enqueue();
		$this->assertTrue( wp_style_is( 'riff', 'enqueued' ), 'the player, on every page' );
		$this->assertFalse( wp_style_is( 'riff-app', 'enqueued' ), 'the Listen app, not on a plain page' );
		$this->assertFalse( wp_style_is( 'riff-standalone', 'enqueued' ) );
		$this->assertFalse( wp_style_is( 'riff-desktop', 'enqueued' ) );
		$this->assertSame( array( 'riff' ), wp_styles()->registered['riff-app']->deps, 'the app builds on the player' );
		$this->assertSame( array( 'riff-app' ), wp_styles()->registered['riff-standalone']->deps );
		$this->assertSame( array( 'riff-standalone' ), wp_styles()->registered['riff-desktop']->deps );
		$this->assertSame( RIFF_VERSION . '.' . filemtime( RIFF_DIR . 'features/listen/app.css' ), wp_styles()->registered['riff-app']->ver );
		$module = wp_script_modules()->get_registered( 'riff' );
		$this->assertSame( 'low', $module['fetchpriority'], 'the bar at the foot of a post can wait' );
		$this->assertTrue( $module['in_footer'] );

		$listen            = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
		wp_styles()->queue = array();
		$this->go_to( get_permalink( $listen ) );
		Player::enqueue();
		$this->assertTrue( wp_style_is( 'riff-app', 'enqueued' ), 'the Listen app, on the page that holds the block' );
		$this->assertFalse( wp_style_is( 'riff-desktop', 'enqueued' ), 'but not standalone mode' );
		$module = wp_script_modules()->get_registered( 'riff' );
		$this->assertSame( 'auto', $module['fetchpriority'], 'where the app is the content, it is not held back' );
		$this->assertFalse( $module['in_footer'] );

		// Standalone mode is an endpoint under the page, which needs the rewrite rules it adds.
		$this->set_permalink_structure( '/%postname%/' );
		\Riff\Listen\Standalone::endpoint();
		flush_rewrite_rules( false );
		wp_styles()->queue = array();
		$this->go_to( \Riff\Listen\Standalone::url( $listen ) );
		Player::enqueue();
		$this->assertTrue( wp_style_is( 'riff-desktop', 'enqueued' ), 'standalone mode and the desktop frame, under app/' );
		$this->assertTrue( wp_style_is( 'riff-app', 'enqueued' ) );
	}

	public function test_the_listen_app_is_modules_the_import_map_names_and_a_language_pack_reaches(): void {
		$this->go_to( home_url( '/' ) );
		Player::enqueue();
		$app = wp_script_modules()->get_registered( 'riff-app' );
		$this->assertNotNull( $app, 'the app is registered on every page, as a dynamic dependency of the player' );
		$ids = array_map( static fn( $module ) => 'riff-app/' . $module, Player::APP_MODULES );
		$this->assertSame( $ids, array_column( $app['dependencies'], 'id' ), 'each module under features/listen/app/ is a static dependency of the app' );
		$this->assertSame( array_fill( 0, count( $ids ), 'static' ), array_column( $app['dependencies'], 'import' ) );
		// Every module file is registered, and every registered module is a file: a module added
		// without a registration would not be in the import map, and the app would not load.
		$files = array_map( static fn( string $file ): string => basename( $file, '.js' ), glob( RIFF_DIR . 'features/listen/app/*.js' ) );
		sort( $files );
		$sorted = Player::APP_MODULES;
		sort( $sorted );
		$this->assertSame( $files, $sorted );
		foreach ( Player::APP_MODULES as $module ) {
			$registered = wp_script_modules()->get_registered( 'riff-app/' . $module );
			$this->assertStringEndsWith( "features/listen/app/{$module}.js", strtok( (string) $registered['src'], '?' ), $module );
			$this->assertSame( RIFF_VERSION . '.' . filemtime( RIFF_DIR . "features/listen/app/{$module}.js" ), $registered['version'], "$module is cache-busted by its own time" );
		}
		// app.js imports each module by its id, and nothing else: an import by path would skip the
		// map, the preload and the version.
		$source  = (string) file_get_contents( RIFF_DIR . 'features/listen/app.js' );
		$imports = array();
		preg_match_all( "/^import .* from '([^']+)';$/m", $source, $imports );
		$this->assertSame( $ids, array_values( array_intersect( $ids, $imports[1] ) ), 'app.js imports every module by its id' );
		$this->assertSame( array(), array_diff( $imports[1], $ids ), 'and nothing by path' );
		foreach ( glob( RIFF_DIR . 'features/listen/app/*.js' ) as $file ) {
			preg_match_all( "/^import .* from '([^']+)';$/m", (string) file_get_contents( $file ), $m );
			$this->assertSame( array(), array_diff( $m[1], $ids ), basename( $file ) . ' imports only registered modules' );
		}

		// The translations print for each module, as its own file.
		ob_start();
		wp_script_modules()->print_import_map();
		$map = (string) ob_get_clean();
		foreach ( $ids as $id ) {
			$this->assertStringContainsString( '"' . $id . '":', $map, "$id is in the import map" );
		}
	}

	public function test_the_design_tokens_are_their_own_stylesheet_that_riff_depends_on(): void {
		$this->go_to( home_url( '/' ) );
		Player::enqueue();
		$this->assertArrayHasKey( 'riff-tokens', wp_styles()->registered, 'extensions can list riff-tokens as a dependency' );
		$this->assertContains( 'riff-tokens', wp_styles()->registered['riff']->deps );
		$this->assertSame( RIFF_VERSION . '.' . filemtime( RIFF_DIR . 'assets/tokens.css' ), wp_styles()->registered['riff-tokens']->ver );
	}

	public function test_icons_are_inline_svg_and_an_unknown_name_is_empty(): void {
		$this->assertStringStartsWith( '<svg ', Player::icon( 'play' ) );
		$this->assertStringContainsString( 'aria-hidden="true"', Player::icon( 'play' ) );
		$this->assertStringNotContainsString( '<path', Player::icon( 'nope' ) );
	}

	public function test_the_player_data_names_the_listen_app_and_no_strings(): void {
		$this->go_to( home_url( '/' ) );
		ob_start();
		Player::markup();
		$html = (string) ob_get_clean();

		preg_match( '#<script type="application/json" id="riff-data">(.+?)</script>#s', $html, $data );
		$data = json_decode( $data[1] ?? '', true );
		$this->assertStringEndsWith( 'features/listen/app.js', strtok( (string) ( $data['assets']['app'] ?? '' ), '?' ) );
		$this->assertArrayNotHasKey( 'strings', $data, 'the modules translate their own strings' );
	}

	public function test_up_next_is_the_only_tab_until_a_plugin_adds_one(): void {
		$this->go_to( home_url( '/' ) );
		ob_start();
		Player::markup();
		$html = ob_get_clean();

		$this->assertSame( array( 'queue' ), array_keys( Player::tabs() ) );
		$this->assertStringContainsString( 'class="riff-tabs" role="tablist"', $html, 'one tab is not "many", so a phone shows no tab row' );
		$this->assertStringContainsString( 'id="riff-queue-tab" data-riff-tab="queue" aria-controls="riff-panel-queue" aria-selected="true" tabindex="0"', $html );
		$this->assertSame( 1, substr_count( $html, 'role="tabpanel"' ) );
	}

	public function test_a_plugin_adds_a_tab_with_an_empty_panel_after_up_next(): void {
		$this->go_to( home_url( '/' ) );
		$tabs = static function ( array $tabs ): array {
			unset( $tabs['queue'] );
			return array(
				'lyrics'  => array( 'label' => 'Lyrics <b>' ),
				'Related' => array( 'label' => 'Related' ),
				'queue'   => array( 'label' => 'Renamed' ),
				'nolabel' => array(),
				'notarr'  => 'Nope',
			) + $tabs;
		};
		add_filter( 'riff_now_playing_tabs', $tabs );
		ob_start();
		Player::markup();
		$html = ob_get_clean();
		$keys = array_keys( Player::tabs() );
		remove_filter( 'riff_now_playing_tabs', $tabs );

		$this->assertSame( array( 'queue', 'lyrics', 'related' ), $keys, 'Up next stays first and cannot be removed; slugs are keys; a tab without a label is dropped' );
		$this->assertStringContainsString( 'class="riff-tabs riff-tabs-many"', $html );
		$this->assertStringContainsString( '>Up next</button>', $html, 'a plugin cannot rename Up next' );
		$this->assertStringContainsString( 'id="riff-tab-lyrics" data-riff-tab="lyrics" aria-controls="riff-panel-lyrics" aria-selected="false" tabindex="-1">Lyrics &lt;b&gt;</button>', $html, 'labels are escaped' );
		$this->assertStringContainsString( '<div class="riff-panel" role="tabpanel" id="riff-panel-lyrics" aria-labelledby="riff-tab-lyrics" data-riff-panel="lyrics" tabindex="0" hidden></div>', $html );
		$this->assertSame( 3, substr_count( $html, 'role="tabpanel"' ) );
	}

	public function test_the_accent_comes_from_the_theme(): void {
		$this->go_to( home_url( '/' ) );
		$this->assertSame( '', Player::root_style(), 'nothing set: the default amber' );

		$accent = '#3858e9';
		$theme  = static function ( WP_Theme_JSON_Data $json ) use ( &$accent ): WP_Theme_JSON_Data {
			return $json->update_with(
				array(
					'version'  => 3,
					'settings' => array( 'custom' => array( 'riff' => array( 'accent' => $accent ) ) ),
				)
			);
		};
		add_filter( 'wp_theme_json_data_theme', $theme );
		wp_clean_theme_json_cache();
		try {
			$this->assertSame( ' style="--riff-accent: #3858e9"', Player::root_style() );
			$accent = 'red; background: url(x)';
			wp_clean_theme_json_cache();
			$this->assertSame( '', Player::root_style(), 'only a colour goes in' );
		} finally {
			remove_filter( 'wp_theme_json_data_theme', $theme );
			wp_clean_theme_json_cache();
		}
	}
}
