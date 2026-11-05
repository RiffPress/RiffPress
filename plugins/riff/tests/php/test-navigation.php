<?php
/**
 * Following a link without leaving the page, off unless a site turns it on.
 *
 * @package Riff
 */

use Riff\Navigation;

/**
 * @covers \Riff\Navigation
 */
class Test_Riff_Navigation extends Riff_TestCase {

	/**
	 * The theme the tests site had, put back after each test.
	 *
	 * @var string
	 */
	private $theme;

	public function set_up(): void {
		parent::set_up();
		$this->theme = get_stylesheet();
		switch_theme( 'twentytwentyfive' );
	}

	public function tear_down(): void {
		switch_theme( $this->theme );
		parent::tear_down();
	}

	/**
	 * Whether Riff has asked for core's template output buffer by the time core decides.
	 *
	 * @return bool
	 */
	private function buffered(): bool {
		$this->go_to( home_url( '/' ) );
		// Riff's callback runs before core's, which opens the buffer (and is left out here, so the
		// test opens no buffer of its own).
		$this->assertLessThan(
			has_action( 'wp_before_include_template', 'wp_start_template_enhancement_output_buffer' ),
			has_action( 'wp_before_include_template', array( Navigation::class, 'buffer' ) )
		);
		Navigation::buffer();
		return false !== has_filter( 'wp_template_enhancement_output_buffer', array( Navigation::class, 'region' ) );
	}

	public function test_a_site_that_leaves_it_off_keeps_its_pages_streamed(): void {
		$this->assertTrue( wp_is_block_theme() );
		$this->assertFalse( Navigation::enabled(), 'off by default' );
		$this->assertFalse( $this->buffered(), 'so core is not asked to hold the page back until it is whole' );
	}

	public function test_a_site_that_turns_it_on_has_its_template_made_a_router_region(): void {
		add_filter( 'riff_client_navigation', '__return_true' );
		$this->assertTrue( $this->buffered() );
		$html = apply_filters( 'wp_template_enhancement_output_buffer', '<body><div class="wp-site-blocks"><p>Hi</p></div></body>', '' );
		$this->assertStringContainsString( 'data-wp-router-region="' . Navigation::REGION . '"', $html );
		$this->assertStringContainsString( 'data-wp-interactive="' . Navigation::REGION . '"', $html );
	}

	public function test_a_classic_theme_is_never_buffered_for_it(): void {
		switch_theme( $this->theme );
		$this->assertFalse( wp_is_block_theme(), 'the tests site runs a classic theme' );
		add_filter( 'riff_client_navigation', '__return_true' );
		$this->assertFalse( $this->buffered() );
	}
}
