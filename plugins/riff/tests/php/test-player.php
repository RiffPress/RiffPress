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
