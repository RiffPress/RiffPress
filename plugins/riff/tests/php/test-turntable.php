<?php
/**
 * The turntable in Now Playing, the site's choice under Settings › Media.
 *
 * @package Riff
 */

use Riff\Player;
use Riff\Registry;
use Riff\Turntable;

/**
 * @covers \Riff\Turntable
 */
class Test_Riff_Turntable extends Riff_TestCase {

	/**
	 * The player's markup, and the data it reads, for the front page.
	 *
	 * @return array `{ html, data }`.
	 */
	private function player(): array {
		$this->go_to( home_url( '/' ) );
		ob_start();
		Player::markup();
		$html = (string) ob_get_clean();
		preg_match( '#<script type="application/json" id="riff-data">(.+?)</script>#s', $html, $data );
		return array(
			'html' => $html,
			'data' => json_decode( $data[1] ?? '', true ),
		);
	}

	public function test_it_is_the_album_until_the_site_turns_it_off(): void {
		$this->assertTrue( Turntable::on(), 'absent, it shows' );
		$on = $this->player();
		$this->assertTrue( $on['data']['views']['album']['stage'] ?? false, 'the album, on Now Playing\'s stage' );
		$this->assertArrayNotHasKey( 'turntable', $on['data']['views'], 'not a view of its own' );
		$this->assertArrayNotHasKey( 'turntable', $on['data'], 'and the script is not told it is off' );
		$this->assertStringNotContainsString( 'data-riff-control="turntable"', $on['html'], 'nor a button of its own' );
		$this->assertMatchesRegularExpression( '#<div id="riff" class="riff" hidden[^>]* data-riff-turntable="off">#', $on['html'], 'the cover until the script finds Now Playing wide' );

		update_option( Turntable::OPTION, false );
		Registry::reset();
		$this->assertFalse( Turntable::on() );
		$off = $this->player();
		$this->assertFalse( $off['data']['turntable'], 'the script is told' );
		$this->assertTrue( $off['data']['views']['album']['stage'] ?? false, 'and the album is still there, the cover' );
	}

	public function test_a_plugin_turns_it_off_with_the_filter(): void {
		add_filter( 'riff_turntable', '__return_false' );
		$this->assertFalse( Turntable::on() );
		remove_filter( 'riff_turntable', '__return_false' );
		$this->assertTrue( Turntable::on() );
	}

	public function test_it_is_a_setting_on_the_media_screen_and_in_the_settings_route(): void {
		Turntable::setting();
		$settings = get_registered_settings();
		$this->assertArrayHasKey( Turntable::OPTION, $settings );
		$this->assertSame( 'media', $settings[ Turntable::OPTION ]['group'] );
		$this->assertSame( 'boolean', $settings[ Turntable::OPTION ]['type'] );
		$this->assertTrue( $settings[ Turntable::OPTION ]['show_in_rest'] );

		// Saved from Settings › Media, where an unticked box sends nothing.
		update_option( Turntable::OPTION, '' );
		$this->assertFalse( Turntable::on() );
		update_option( Turntable::OPTION, '1' );
		$this->assertTrue( Turntable::on() );
	}
}
