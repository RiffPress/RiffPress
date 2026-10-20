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
		preg_match( '#<script type="application/json" id="riff-data">(.+?)</script>#s', $html, $m );
		$data = json_decode( $m[1], true );
		$this->assertSame( array(), $data['strings'], 'the modules translate their own; only a site\'s replacements come this way' );
	}

	public function test_assets_are_enqueued_with_a_cache_key_that_follows_the_file(): void {
		$this->go_to( home_url( '/' ) );
		Player::enqueue();
		$this->assertTrue( wp_style_is( 'riff', 'enqueued' ) );
		$this->assertStringStartsWith( RIFF_VERSION . '.', wp_styles()->registered['riff']->ver );
		$this->assertSame( RIFF_VERSION . '.' . filemtime( RIFF_DIR . 'assets/riff.css' ), wp_styles()->registered['riff']->ver );
		$this->assertTrue( wp_script_is( 'wp-i18n', 'enqueued' ), 'the modules translate with wp.i18n' );
	}

	public function test_icons_are_inline_svg_and_an_unknown_name_is_empty(): void {
		$this->assertStringStartsWith( '<svg ', Player::icon( 'play' ) );
		$this->assertStringContainsString( 'aria-hidden="true"', Player::icon( 'play' ) );
		$this->assertStringNotContainsString( '<path', Player::icon( 'nope' ) );
	}

	public function test_a_feature_can_add_to_the_player_data(): void {
		$this->go_to( home_url( '/' ) );
		$add = static function ( array $data ): array {
			$data['assets']['probe'] = 'https://example.org/probe.js';
			return $data;
		};
		add_filter( 'riff_player_data', $add );
		ob_start();
		Player::markup();
		$html = ob_get_clean();
		remove_filter( 'riff_player_data', $add );

		$this->assertStringContainsString( 'probe.js', $html );
		$this->assertStringContainsString( trim( (string) wp_json_encode( 'features/listen/app.js' ), '"' ), $html, 'the Listen feature announces its script through the same filter' );
	}

	public function test_a_plugin_adds_a_chip_and_a_bar_control(): void {
		$this->go_to( home_url( '/' ) );
		$chips = static function ( array $chips ): array {
			$chips['lyrics'] = array(
				'label'  => 'Lyrics',
				'action' => 'my-lyrics',
				'svg'    => '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/><script>alert(1)</script></svg>',
			);
			$chips['bad']    = array( 'action' => 'no-label' );
			return $chips;
		};
		$bar   = static fn( array $controls ): array => $controls + array(
			'eq' => array(
				'label' => 'Equaliser',
				'href'  => 'https://example.org/eq',
				'icon'  => 'volume',
			),
		);
		add_filter( 'riff_chips', $chips );
		add_filter( 'riff_bar_controls', $bar );
		ob_start();
		Player::markup();
		$html = ob_get_clean();
		remove_filter( 'riff_chips', $chips );
		remove_filter( 'riff_bar_controls', $bar );

		$this->assertStringContainsString( 'data-riff-action="share"', $html, 'the player\'s own chip stays' );
		$this->assertStringContainsString( 'data-riff-action="my-lyrics" data-riff-chip="lyrics"', $html );
		$this->assertStringContainsString( '<span>Lyrics</span>', $html );
		$this->assertStringNotContainsString( '<script>alert', $html, 'a script tag in an svg is stripped' );
		$this->assertStringNotContainsString( 'no-label', $html, 'an item without a label is dropped' );
		$this->assertStringContainsString( 'class="riff-btn riff-desk" href="https://example.org/eq" aria-label="Equaliser"', $html );
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

	public function test_the_accent_comes_from_the_theme_or_a_filter(): void {
		$this->go_to( home_url( '/' ) );
		$this->assertSame( '', Player::root_style(), 'nothing set: the default amber' );
		$accent = static fn(): string => '#3858e9';
		add_filter( 'riff_accent', $accent );
		$this->assertSame( ' style="--riff-accent: #3858e9"', Player::root_style() );
		remove_filter( 'riff_accent', $accent );
		$bad = static fn(): string => 'red; background: url(x)';
		add_filter( 'riff_accent', $bad );
		$this->assertSame( '', Player::root_style(), 'only a colour goes in' );
		remove_filter( 'riff_accent', $bad );
	}
}
