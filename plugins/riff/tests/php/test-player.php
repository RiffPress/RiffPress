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

	public function test_the_markup_carries_the_player_and_its_strings(): void {
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
		$this->assertSame( 'Play', $data['strings']['play'] );
		$this->assertStringContainsString( '%s', $data['strings']['playTrack'] );
	}

	public function test_assets_are_enqueued_with_a_cache_key_that_follows_the_file(): void {
		$this->go_to( home_url( '/' ) );
		Player::enqueue();
		$this->assertTrue( wp_style_is( 'riff', 'enqueued' ) );
		$this->assertStringStartsWith( RIFF_VERSION . '.', wp_styles()->registered['riff']->ver );
		$this->assertSame( RIFF_VERSION . '.' . filemtime( RIFF_DIR . 'assets/riff.css' ), wp_styles()->registered['riff']->ver );
	}

	public function test_icons_are_inline_svg_and_an_unknown_name_is_empty(): void {
		$this->assertStringStartsWith( '<svg ', Player::icon( 'play' ) );
		$this->assertStringContainsString( 'aria-hidden="true"', Player::icon( 'play' ) );
		$this->assertStringNotContainsString( '<path', Player::icon( 'nope' ) );
	}
}
