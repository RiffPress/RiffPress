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
		// A request of its own, so nothing an earlier test's request served at the site's address stays.
		$this->go_to( home_url( '/' ) );
	}

	public function tear_down(): void {
		delete_option( Standalone::AT_ROOT );
		delete_option( 'show_on_front' );
		delete_option( 'page_on_front' );
		remove_all_filters( 'riff_app_at_root' );
		remove_all_filters( 'wp_redirect' );
		parent::tear_down();
	}

	/**
	 * Runs Standalone::to_root() on the current request, catching the redirect it ends with.
	 *
	 * @return array{0: string, 1: int}|null Where it redirected, and with what status, or null.
	 */
	private function to_root(): ?array {
		add_filter(
			'wp_redirect',
			static function ( $location, $status ) {
				throw new RuntimeException( $status . ' ' . $location ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- test output only.
			},
			10,
			2
		);
		try {
			Standalone::to_root();
		} catch ( RuntimeException $redirect ) {
			list( $status, $location ) = explode( ' ', $redirect->getMessage(), 2 );
			return array( $location, (int) $status );
		}
		return null;
	}

	public function test_the_site_address_opens_the_app_only_once_the_site_asks(): void {
		$this->assertFalse( Standalone::at_root(), 'off by default' );
		$this->go_to( home_url( '/' ) );
		$this->assertFalse( Standalone::active(), 'the home page is the theme\'s' );
		$this->assertSame( trailingslashit( get_permalink( $this->listen ) ) . 'app/', Standalone::url( $this->listen ) );
		$this->assertSame( trailingslashit( get_permalink( $this->listen ) ) . 'app/manifest/', Standalone::url( $this->listen, true ) );
		$this->assertSame( 'http://example.org/listen/', apply_filters( 'redirect_canonical', 'http://example.org/listen/', home_url( '/' ) ) );

		$this->go_to( Standalone::url( $this->listen ) );
		$this->assertTrue( Standalone::active() );
		$this->assertNull( $this->to_root(), 'the app/ address stays where it is' );
	}

	public function test_on_the_site_address_is_the_listen_pages_app(): void {
		update_option( Standalone::AT_ROOT, true );
		$this->go_to( home_url( '/' ) );

		$this->assertTrue( Standalone::active() );
		$this->assertSame( $this->listen, get_queried_object_id() );
		$this->assertSame( RIFF_DIR . 'templates/standalone.php', Standalone::template( '/theme/index.php' ) );
		$this->assertFalse( apply_filters( 'redirect_canonical', get_permalink( $this->listen ), home_url( '/' ) ), 'WordPress leaves it at the site\'s address' );
		$this->assertNull( $this->to_root() );
		$this->assertSame( home_url( '/' ), Standalone::url() );
		$this->assertSame( home_url( '/' ), Standalone::url( $this->listen ) );
		$this->assertStringContainsString( 'data-riff-page="' . esc_url( home_url( '/' ) ) . '"', App::render(), 'links in the app stay at the site\'s address' );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		Standalone::no_admin_bar();
		$this->assertFalse( apply_filters( 'show_admin_bar', true ) );
	}

	public function test_on_a_view_of_the_app_at_the_site_address_is_the_app_too(): void {
		update_option( Standalone::AT_ROOT, true );
		$this->go_to( add_query_arg( 'riff_view', 'albums', home_url( '/' ) ) );

		$this->assertTrue( Standalone::active() );
		$this->assertNull( $this->to_root() );
	}

	public function test_on_without_pretty_permalinks_the_site_address_is_the_app_too(): void {
		$this->set_permalink_structure( '' );
		update_option( Standalone::AT_ROOT, true );

		$this->go_to( home_url( '/' ) );
		$this->assertTrue( Standalone::active() );
		$this->assertSame( home_url( '/' ), Standalone::url() );

		$this->go_to( Standalone::url( $this->listen, true ) );
		$this->assertSame( 'manifest', get_query_var( 'riff_app' ) );
		$this->assertTrue( Standalone::active() );

		$this->go_to( add_query_arg( 'feed', 'rss2', home_url( '/' ) ) );
		$this->assertFalse( Standalone::active(), 'a feed is a feed' );
	}

	public function test_a_filter_turns_it_on_without_the_setting(): void {
		add_filter( 'riff_app_at_root', '__return_true' );
		$this->go_to( home_url( '/' ) );

		$this->assertTrue( Standalone::at_root() );
		$this->assertTrue( Standalone::active() );
		$this->assertFalse( (bool) get_option( Standalone::AT_ROOT ), 'the setting is left as it was' );
	}

	public function test_on_the_manifest_starts_and_stays_at_the_site_address(): void {
		update_option( Standalone::AT_ROOT, true );
		$manifest_url = Standalone::url( $this->listen, true );
		$this->assertSame( add_query_arg( 'riff_app', 'manifest', home_url( '/' ) ), $manifest_url );

		// The address the document's <link rel="manifest"> names answers with the manifest.
		$this->go_to( $manifest_url );
		$this->assertTrue( Standalone::active() );
		$this->assertSame( 'manifest', get_query_var( 'riff_app' ) );
		$this->assertNull( $this->to_root() );
		$manifest = Standalone::manifest_data();
		$this->assertSame( home_url( '/' ), $manifest['id'] );
		$this->assertSame( home_url( '/' ), $manifest['start_url'] );
		$this->assertSame( home_url( '/' ), $manifest['scope'] );

		// Its old address, which an installed app may still ask for, too.
		$this->go_to( trailingslashit( get_permalink( $this->listen ) ) . 'app/manifest/' );
		$this->assertTrue( Standalone::active() );
		$this->assertNull( $this->to_root(), 'the manifest is not moved' );
		$this->assertSame( home_url( '/' ), Standalone::manifest_data()['start_url'] );
	}

	public function test_on_the_app_address_moves_to_the_site_address_with_its_view(): void {
		update_option( Standalone::AT_ROOT, true );

		$this->go_to( trailingslashit( get_permalink( $this->listen ) ) . 'app/' );
		$this->assertSame( array( home_url( '/' ), 301 ), $this->to_root() );

		$this->go_to( trailingslashit( get_permalink( $this->listen ) ) . 'app/?riff_view=albums' );
		$this->assertSame( array( add_query_arg( 'riff_view', 'albums', home_url( '/' ) ), 301 ), $this->to_root() );

		$this->go_to( add_query_arg( 'riff_app', '1', home_url( '/' ) ) );
		$this->assertSame( array( home_url( '/' ), 301 ), $this->to_root(), 'the query argument too' );
	}

	public function test_on_the_listen_page_and_the_other_pages_are_as_they_were(): void {
		update_option( Standalone::AT_ROOT, true );
		$other = self::factory()->post->create(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_name'   => 'about',
			)
		);

		$this->go_to( get_permalink( $this->listen ) );
		$this->assertFalse( Standalone::active(), 'the Listen page keeps the theme' );
		$this->assertTrue( is_page( $this->listen ) );

		$this->go_to( get_permalink( $other ) );
		$this->assertFalse( Standalone::active() );
		$this->assertTrue( is_page( $other ) );

		$this->go_to( add_query_arg( 's', 'jazz', home_url( '/' ) ) );
		$this->assertFalse( Standalone::active(), 'a search at the site\'s address is a search' );
		$this->assertTrue( is_search() );

		$this->assertSame( 'posts', get_option( 'show_on_front' ), 'the front page setting is untouched' );
	}

	public function test_on_a_site_with_no_listen_page_keeps_its_home_page(): void {
		update_option( Standalone::AT_ROOT, true );
		wp_delete_post( $this->listen, true );
		$this->go_to( home_url( '/' ) );

		$this->assertFalse( Standalone::active() );
		$this->assertTrue( is_home() );
	}

	public function test_on_a_listen_page_that_is_also_the_front_page_opens_the_app(): void {
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $this->listen );

		$this->go_to( home_url( '/' ) );
		$this->assertFalse( Standalone::active(), 'off, the front page is the Listen page in the theme' );
		$this->assertTrue( is_front_page() );

		update_option( Standalone::AT_ROOT, true );
		$this->go_to( home_url( '/' ) );
		$this->assertTrue( Standalone::active() );
		$this->assertTrue( is_front_page() );
		$this->assertSame( home_url( '/' ), Standalone::url() );
		$this->assertFalse( apply_filters( 'redirect_canonical', home_url( '/app/' ), home_url( '/' ) ) );

		$this->go_to( Standalone::url( $this->listen, true ) );
		$this->assertTrue( Standalone::active(), 'the manifest answers at the address the document names' );
		$this->assertSame( 'manifest', get_query_var( 'riff_app' ) );
		$this->assertSame( home_url( '/' ), Standalone::manifest_data()['start_url'] );
	}

	public function test_the_setting_is_on_settings_riff_and_in_rest(): void {
		$settings = get_registered_settings();
		$this->assertArrayHasKey( Standalone::AT_ROOT, $settings );
		$this->assertSame( 'riff', $settings[ Standalone::AT_ROOT ]['group'] );
		$this->assertFalse( $settings[ Standalone::AT_ROOT ]['default'] );
		$this->assertNotEmpty( $settings[ Standalone::AT_ROOT ]['show_in_rest'] );

		global $wp_settings_fields;
		Standalone::field();
		$field = $wp_settings_fields['riff']['riff-app'][ Standalone::AT_ROOT ];
		ob_start();
		call_user_func( $field['callback'], $field['args'] );
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'Open the player at the site&#039;s address', $html );
		$this->assertStringNotContainsString( 'checked', $html );
		$this->assertStringNotContainsString( 'disabled', $html );

		add_filter( 'riff_app_at_root', '__return_true' );
		ob_start();
		call_user_func( $field['callback'], $field['args'] );
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( "checked='checked'", $html );
		$this->assertStringContainsString( "disabled='disabled'", $html, 'a plugin has set it' );
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
		$this->assertSame( array( 'window-controls-overlay' ), $manifest['display_override'], 'no title bar where the browser can do without one' );
		$this->assertSame( Standalone::url( $this->listen ), $manifest['start_url'] );
		$this->assertSame( $manifest['start_url'], $manifest['scope'], 'the app stays inside app/' );
		$this->assertSame( '#030303', $manifest['theme_color'] );
		$this->assertSame( array( '192x192', '512x512' ), wp_list_pluck( $manifest['icons'], 'sizes' ) );
		$this->assertStringContainsString( 'features/listen/icons/icon-192.png', $manifest['icons'][0]['src'], 'Riff\'s icon when the site has none' );
		foreach ( array( 192, 512 ) as $size ) {
			$this->assertFileExists( RIFF_DIR . "features/listen/icons/icon-$size.png", 'the icon ships with the plugin' );
		}
	}

	public function test_a_host_names_and_colours_the_manifest_and_the_theme_color_follows(): void {
		$this->go_to( Standalone::url( $this->listen ) );
		add_filter(
			'riff_app_manifest',
			static function ( array $manifest ): array {
				$manifest['name']        = 'Cloud';
				$manifest['theme_color'] = '#102030';
				return $manifest;
			}
		);

		$manifest = Standalone::manifest_data();
		$this->assertSame( 'Cloud', $manifest['name'] );
		$this->assertSame( '#102030', $manifest['theme_color'] );
		$this->assertSame( Standalone::url( $this->listen ), $manifest['start_url'], 'the rest is Riff\'s' );

		ob_start();
		require Standalone::template( '/theme/page.php' );
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( '<meta name="theme-color" content="#102030">', $html );
		remove_all_filters( 'riff_app_manifest' );
		$this->assertSame( '#030303', Standalone::manifest_data()['theme_color'], 'Riff\'s own without the filter' );
	}

	public function test_the_apps_colours_are_custom_properties_with_riffs_defaults(): void {
		$tokens = (string) file_get_contents( RIFF_DIR . 'assets/tokens.css' );
		foreach ( array(
			'--riff-standalone-bg: #030303;',
			'--riff-standalone-ink: #fff;',
			'--riff-standalone-tabs: var(--riff-surface, #212121);',
			'--riff-standalone-on-accent: #000;',
		) as $declaration ) {
			$this->assertStringContainsString( $declaration, $tokens );
		}
		$css = (string) file_get_contents( RIFF_DIR . 'features/listen/standalone.css' );
		$this->assertDoesNotMatchRegularExpression( '/#(030303|212121|000|fff)\b/i', $css, 'no colour of the app\'s own written into a rule' );
		$this->assertSame( 'var(--riff-standalone-bg, #030303)', Standalone::tokens()['--riff-app-bg'], 'the block inside follows' );
	}

	public function test_a_site_icon_is_named_by_the_size_each_copy_really_is(): void {
		// Set as a plain upload, without the Customizer's crop, the icon has no 192 pixel copy.
		$icon = self::factory()->attachment->create_upload_object( RIFF_DIR . 'features/listen/icons/icon-512.png' );
		update_option( 'site_icon', $icon );
		$this->go_to( Standalone::url( $this->listen ) );

		foreach ( Standalone::manifest_data()['icons'] as $entry ) {
			$path                   = get_attached_file( $icon );
			$file                   = dirname( $path ) . '/' . wp_basename( (string) wp_parse_url( $entry['src'], PHP_URL_PATH ) );
			list( $width, $height ) = wp_getimagesize( $file );
			$this->assertSame( "{$width}x{$height}", $entry['sizes'], $entry['src'] );
		}
		delete_option( 'site_icon' );
	}

	public function test_the_document_is_riffs_own_with_links_that_stay_in_the_app(): void {
		$this->go_to( Standalone::url( $this->listen ) );

		$this->assertSame( RIFF_DIR . 'templates/standalone.php', Standalone::template( '/theme/page.php' ) );
		$html = App::render();

		$this->assertStringContainsString( 'data-riff-page="' . esc_url( Standalone::url( $this->listen ) ) . '"', $html );
		$this->assertStringContainsString( '--riff-app-bg:var(--riff-standalone-bg, #030303)', $html, 'Riff\'s dark look, not the theme\'s colours' );
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

		$resources = \Riff\Listen\Fonts::preload( array() );
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
