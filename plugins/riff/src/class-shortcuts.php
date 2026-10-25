<?php
/**
 * The player's single-key shortcuts, a signed-in listener's choice on their profile.
 *
 * @since 5.2.0
 * @package Riff
 */

namespace Riff;

use WP_User;

defined( 'ABSPATH' ) || exit;

/**
 * Space, K, J and L play, pause and skip from anywhere on the page. WCAG 2.1.4 asks that a
 * listener who cannot use single-key shortcuts, because speech input types them or a slip of the
 * hand presses them, can turn them off. A visitor has nowhere to keep that choice, so a visitor
 * gets none, and the Shift shortcuts, which a slip does not press, still work for everyone. A
 * signed-in listener has them, and turns them off under Personal Options on their profile, where
 * WordPress keeps their other choices about how the site behaves for them. The choice is a user
 * option, so on a network each site keeps its own, as likes are kept.
 */
final class Shortcuts {

	/**
	 * The user option: `off` while the shortcuts are off; absent while they are on.
	 *
	 * @since 5.2.0
	 */
	public const OPTION = 'riff_shortcuts';

	/**
	 * Hooks the profile field and the player's data.
	 *
	 * @since 5.2.0
	 */
	public static function register(): void {
		add_action( 'personal_options', array( self::class, 'field' ) );
		add_action( 'personal_options_update', array( self::class, 'save' ) );
		add_action( 'edit_user_profile_update', array( self::class, 'save' ) );
	}

	/**
	 * Whether a user has the shortcuts: a signed-in user unless they turned them off; nobody else.
	 *
	 * @since 5.2.0
	 *
	 * @param int $user_id User ID; 0 for a visitor.
	 * @return bool
	 */
	public static function on( int $user_id ): bool {
		return $user_id > 0 && 'off' !== get_user_option( self::OPTION, $user_id );
	}

	/**
	 * The checkbox under Personal Options.
	 *
	 * @since 5.2.0
	 *
	 * @param WP_User $user The user being edited.
	 */
	public static function field( $user ): void {
		if ( ! $user instanceof WP_User ) {
			return;
		}
		?>
		<tr class="riff-shortcuts-wrap">
			<th scope="row"><?php esc_html_e( 'Keyboard shortcuts in the player', 'riff' ); ?></th>
			<td>
				<label for="riff_shortcuts">
					<input name="riff_shortcuts" type="checkbox" id="riff_shortcuts" value="on" <?php checked( self::on( $user->ID ) ); ?>>
					<?php esc_html_e( 'Play and pause with Space or K, and skip back and ahead with J and L', 'riff' ); ?>
				</label>
				<?php wp_nonce_field( 'riff_shortcuts_' . $user->ID, 'riff_shortcuts_nonce' ); ?>
			</td>
		</tr>
		<?php
	}

	/**
	 * Saves the checkbox when the profile is saved.
	 *
	 * @since 5.2.0
	 *
	 * @param int $user_id The user being saved.
	 */
	public static function save( $user_id ): void {
		$user_id = (int) $user_id;
		if (
			! current_user_can( 'edit_user', $user_id ) ||
			! isset( $_POST['riff_shortcuts_nonce'] ) ||
			! wp_verify_nonce( sanitize_key( wp_unslash( $_POST['riff_shortcuts_nonce'] ) ), 'riff_shortcuts_' . $user_id )
		) {
			return;
		}
		if ( isset( $_POST['riff_shortcuts'] ) ) {
			delete_user_option( $user_id, self::OPTION );
		} else {
			update_user_option( $user_id, self::OPTION, 'off' );
		}
	}

	/**
	 * Tells the player whether this listener has the shortcuts.
	 *
	 * @since 5.2.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( is_array( $data ) ) {
			$data['shortcuts'] = self::on( get_current_user_id() );
		}
		return $data;
	}
}
