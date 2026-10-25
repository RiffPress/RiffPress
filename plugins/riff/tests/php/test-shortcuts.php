<?php
/**
 * The single-key shortcuts: a signed-in listener's choice on their profile, none for a visitor.
 *
 * @package Riff
 */

use Riff\Shortcuts;

/**
 * Riff\Shortcuts.
 */
class Test_Riff_Shortcuts extends Riff_TestCase {

	/**
	 * A visitor has none; a user has them until they turn them off.
	 */
	public function test_a_visitor_has_none_and_a_user_has_them_until_they_turn_them_off(): void {
		$user = self::factory()->user->create();
		$this->assertFalse( Shortcuts::on( 0 ) );
		$this->assertTrue( Shortcuts::on( $user ) );
		update_user_option( $user, Shortcuts::OPTION, 'off' );
		$this->assertFalse( Shortcuts::on( $user ) );
	}

	/**
	 * The player's data says which, for whoever is signed in.
	 */
	public function test_the_player_is_told_whether_this_listener_has_them(): void {
		wp_set_current_user( 0 );
		$this->assertFalse( Shortcuts::player_data( array() )['shortcuts'] );
		wp_set_current_user( self::factory()->user->create() );
		$this->assertTrue( Shortcuts::player_data( array() )['shortcuts'] );
	}

	/**
	 * Saving the profile with the box cleared turns them off; checked, on; without the nonce, nothing.
	 */
	public function test_the_profile_checkbox_saves_with_its_nonce(): void {
		$user = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $user );
		Shortcuts::save( $user );
		$this->assertTrue( Shortcuts::on( $user ), 'nothing changes without the nonce' );

		$_POST['riff_shortcuts_nonce'] = wp_create_nonce( 'riff_shortcuts_' . $user );
		Shortcuts::save( $user );
		$this->assertFalse( Shortcuts::on( $user ) );

		$_POST['riff_shortcuts'] = 'on';
		Shortcuts::save( $user );
		$this->assertTrue( Shortcuts::on( $user ) );
		unset( $_POST['riff_shortcuts'], $_POST['riff_shortcuts_nonce'] );
	}

	/**
	 * Another user cannot change someone's choice.
	 */
	public function test_only_someone_who_can_edit_the_user_saves_it(): void {
		$user  = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		$other = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $other );
		$_POST['riff_shortcuts_nonce'] = wp_create_nonce( 'riff_shortcuts_' . $user );
		Shortcuts::save( $user );
		$this->assertTrue( Shortcuts::on( $user ) );
		unset( $_POST['riff_shortcuts_nonce'] );
	}
}
