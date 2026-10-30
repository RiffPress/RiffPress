<?php
/**
 * Riff Sign In: listeners who stay in the player.
 *
 * @package Riff\SignIn
 */

use Riff\SignIn\Listeners;
use Riff\SignIn\Sign_In;

/**
 * The Settings → General opt-in that keeps people who cannot write posts in the player.
 */
class Test_Riff_Sign_In_Listeners extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		Sign_In::register();
	}

	public function tear_down(): void {
		delete_option( Listeners::OPTION );
		parent::tear_down();
	}

	public function test_off_by_default_changes_nothing(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertFalse( Listeners::on() );
		$this->assertSame( '', Listeners::redirect_for( 'index.php' ) );
		$this->assertTrue( Listeners::toolbar( true ) );
		$this->assertSame( '<a>Register</a>', Listeners::register_link( '<a>Register</a>' ) );
	}

	public function test_on_a_subscriber_keeps_their_profile_and_nothing_else_in_wp_admin(): void {
		update_option( Listeners::OPTION, true );
		$listen = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$this->assertSame( get_permalink( $listen ), Listeners::redirect_for( 'index.php' ), 'the dashboard sends them to the Listen page' );
		$this->assertSame( get_permalink( $listen ), Listeners::redirect_for( 'edit-comments.php' ) );
		$this->assertSame( '', Listeners::redirect_for( 'profile.php' ), 'their profile, with their passkeys, stays open' );
		$this->assertSame( '', Listeners::redirect_for( 'admin-post.php' ) );
		$this->assertFalse( Listeners::toolbar( true ), 'no toolbar' );
	}

	public function test_on_anyone_who_can_write_posts_is_left_alone(): void {
		update_option( Listeners::OPTION, true );
		foreach ( array( 'contributor', 'editor', 'administrator' ) as $role ) {
			wp_set_current_user( self::factory()->user->create( array( 'role' => $role ) ) );
			$this->assertSame( '', Listeners::redirect_for( 'index.php' ), $role );
			$this->assertTrue( Listeners::toolbar( true ), $role );
		}
	}

	public function test_on_the_register_link_goes_and_a_visitor_is_not_a_listener(): void {
		update_option( Listeners::OPTION, true );
		$this->assertSame( '', Listeners::register_link( '<a>Register</a>' ), 'the login form loses its Register link' );
		wp_set_current_user( 0 );
		$this->assertSame( '', Listeners::redirect_for( 'index.php' ), 'a visitor is WordPress\'s to send to the login form' );
	}

	public function test_without_a_listen_page_listeners_land_on_the_home_page(): void {
		update_option( Listeners::OPTION, true );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertSame( home_url( '/' ), Listeners::redirect_for( 'index.php' ) );
	}

	public function test_the_setting_is_a_checkbox_on_settings_general(): void {
		global $wp_settings_fields;
		Listeners::setting();
		$this->assertArrayHasKey( Listeners::OPTION, $wp_settings_fields['general']['default'] );
		$this->assertArrayHasKey( Listeners::OPTION, get_registered_settings() );
	}
}
