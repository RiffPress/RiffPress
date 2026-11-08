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
		delete_option( Navigation::OPTION );
		unregister_setting( \Riff\Extensions::PAGE, Navigation::OPTION );
		remove_all_filters( 'riff_client_navigation' );
		unset( $GLOBALS['show_admin_bar'] );
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

	public function test_the_region_carries_what_the_router_leaves_behind(): void {
		add_filter( 'riff_client_navigation', '__return_true' );
		show_admin_bar( true );
		$this->buffered();
		$html = apply_filters(
			'wp_template_enhancement_output_buffer',
			'<html><head><link rel="canonical" href="https://example.org/a/"><link rel="shortlink" href="https://example.org/?p=1"></head><body class="single postid-1"><div class="wp-site-blocks"><li id="wp-admin-bar-edit"><a href="https://evil.example/">Edit Post</a></li></div><div id="wpadminbar"><ul id="wp-admin-bar-root-default"><li id=\'wp-admin-bar-edit\'><a class=\'ab-item\' href=\'/edit\'>Edit Post</a><ul><li id=\'wp-admin-bar-child\'></li></ul></li><li id=\'wp-admin-bar-other\'></li></ul></div></body></html>',
			''
		);
		$p    = new WP_HTML_Tag_Processor( $html );
		$p->next_tag( array( 'class_name' => 'wp-site-blocks' ) );
		$page = json_decode( (string) $p->get_attribute( 'data-riff-page' ), true );

		$this->assertSame( 'single postid-1', $page['body'] );
		$this->assertSame( 'https://example.org/a/', $page['canonical'] );
		$this->assertSame( 'https://example.org/?p=1', $page['shortlink'] );
		$this->assertSame( array( 'edit' => '<li id="wp-admin-bar-edit"><a class="ab-item" href="/edit">Edit Post</a><ul><li id="wp-admin-bar-child"></li></ul></li>' ), $page['bar'], 'the bar\'s own edit link with its menu, never the one in the post' );
	}

	public function test_a_page_with_no_admin_bar_carries_none_from_its_content(): void {
		add_filter( 'riff_client_navigation', '__return_true' );
		show_admin_bar( false );
		$this->buffered();
		$html = apply_filters( 'wp_template_enhancement_output_buffer', '<body><div class="wp-site-blocks"><li id="wp-admin-bar-edit"><a href="https://evil.example/">Edit</a></li></div></body>', '' );
		$p    = new WP_HTML_Tag_Processor( $html );
		$p->next_tag( array( 'class_name' => 'wp-site-blocks' ) );
		$this->assertSame( array(), json_decode( (string) $p->get_attribute( 'data-riff-page' ), true )['bar'] );
	}

	public function test_a_bar_that_is_not_shown_is_never_read_from_the_content(): void {
		add_filter( 'riff_client_navigation', '__return_true' );
		show_admin_bar( false );
		$this->buffered();
		// An author's markup that reads like the bar: a title holding id="wpadminbar" and a node.
		$html = apply_filters( 'wp_template_enhancement_output_buffer', '<body><div class="wp-site-blocks"><p title="id=&quot;wpadminbar&quot;">x</p><p title="<li id=\'wp-admin-bar-edit\'><img src=x onerror=alert(1)></li>">y</p></div></body>', '' );
		$p    = new WP_HTML_Tag_Processor( $html );
		$p->next_tag( array( 'class_name' => 'wp-site-blocks' ) );
		$this->assertSame( array(), json_decode( (string) $p->get_attribute( 'data-riff-page' ), true )['bar'] );
	}

	public function test_a_node_of_the_bar_carries_no_handler(): void {
		add_filter( 'riff_client_navigation', '__return_true' );
		show_admin_bar( true );
		$this->buffered();
		$html = apply_filters( 'wp_template_enhancement_output_buffer', '<body><div class="wp-site-blocks"></div><div id="wpadminbar"><ul><li id="wp-admin-bar-edit"><a class="ab-item" href="/edit" onclick="alert(1)">Edit</a><img src=x onerror=alert(1)></li></ul></div></body>', '' );
		$p    = new WP_HTML_Tag_Processor( $html );
		$p->next_tag( array( 'class_name' => 'wp-site-blocks' ) );
		$edit = json_decode( (string) $p->get_attribute( 'data-riff-page' ), true )['bar']['edit'];
		$this->assertStringContainsString( 'href="/edit"', $edit );
		$this->assertStringNotContainsString( 'onclick', $edit );
		$this->assertStringNotContainsString( 'onerror', $edit );
	}

	public function test_a_plugin_turns_it_on_where_the_setting_is_off(): void {
		add_filter( 'riff_client_navigation', '__return_true' );
		$this->assertTrue( Navigation::enabled() );
	}

	public function test_a_classic_theme_stays_off_whatever_the_setting(): void {
		switch_theme( $this->theme );
		update_option( Navigation::OPTION, '1' );
		$this->assertFalse( Navigation::enabled() );
	}

	public function test_saving_the_page_keeps_the_site_s_choice_while_a_plugin_overrides_it(): void {
		update_option( Navigation::OPTION, '1' );
		add_filter( 'riff_client_navigation', '__return_false' );
		global $wp_settings_fields;
		Navigation::field();
		ob_start();
		call_user_func( $wp_settings_fields[ \Riff\Extensions::PAGE ]['riff-links'][ Navigation::OPTION ]['callback'] );
		$html = ob_get_clean();
		$this->assertStringContainsString( 'type="hidden" name="' . Navigation::OPTION . '" value="1"', $html, 'the disabled box is not sent, so the saved value is' );
		$this->assertStringContainsString( 'disabled', $html );
		$this->assertStringContainsString( 'Set for this site by a plugin.', $html );
	}

	public function test_a_site_turns_it_on_under_settings_and_a_plugin_decides_last(): void {
		Navigation::setting();
		$this->assertArrayHasKey( Navigation::OPTION, get_registered_settings(), 'on Settings › Riff and in the REST settings route' );
		update_option( Navigation::OPTION, '1' );
		$this->assertTrue( $this->buffered() );
		$this->assertTrue( Navigation::enabled() );
		add_filter( 'riff_client_navigation', '__return_false' );
		$this->assertFalse( Navigation::enabled(), 'a host can keep it off whatever the setting says' );
	}

	public function test_a_classic_theme_is_never_buffered_for_it(): void {
		switch_theme( $this->theme );
		$this->assertFalse( wp_is_block_theme(), 'the tests site runs a classic theme' );
		add_filter( 'riff_client_navigation', '__return_true' );
		$this->assertFalse( $this->buffered() );
	}
}
