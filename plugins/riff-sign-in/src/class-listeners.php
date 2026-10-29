<?php
/**
 * Listeners who stay in the player.
 *
 * @package Riff\SignIn
 */

namespace Riff\SignIn;

defined( 'ABSPATH' ) || exit;

/**
 * An opt-in, on Settings → General beside "Anyone can register": people who cannot write posts
 * sign in and sign up in the player only. They keep their profile, where their passkeys and
 * details are, but see no dashboard and no toolbar, and wp-login.php's registration form is
 * closed, so the player's sheet is the only way to make an account. Registration itself stays
 * WordPress's own setting, which the sheet already follows.
 */
final class Listeners {

	/**
	 * The option, true when listeners stay in the player.
	 */
	public const OPTION = 'riff_sign_in_listeners';

	/**
	 * Screens in wp-admin a listener may still open: their profile, and the endpoints forms and
	 * scripts post to.
	 */
	private const ALLOWED = array( 'profile.php', 'admin-ajax.php', 'admin-post.php' );

	/**
	 * Hooks everything.
	 */
	public static function register(): void {
		add_action( 'admin_init', array( self::class, 'setting' ) );
		add_action( 'admin_init', array( self::class, 'keep_out' ), 1 );
		add_action( 'admin_menu', array( self::class, 'menu' ), 999 );
		add_filter( 'show_admin_bar', array( self::class, 'toolbar' ) );
		add_filter( 'register', array( self::class, 'register_link' ) );
		add_action( 'login_form_register', array( self::class, 'close_form' ) );
	}

	/**
	 * The checkbox on Settings → General.
	 */
	public static function setting(): void {
		register_setting(
			'general',
			self::OPTION,
			array(
				'type'              => 'boolean',
				'default'           => false,
				'sanitize_callback' => 'rest_sanitize_boolean',
			)
		);
		add_settings_field(
			self::OPTION,
			__( 'Listeners', 'riff-sign-in' ),
			array( self::class, 'field' ),
			'general',
			'default',
			array( 'label_for' => self::OPTION )
		);
	}

	/**
	 * Prints the checkbox.
	 */
	public static function field(): void {
		printf(
			'<label for="%1$s"><input name="%1$s" type="checkbox" id="%1$s" value="1" %2$s /> %3$s</label><p class="description">%4$s</p>',
			esc_attr( self::OPTION ),
			checked( self::on(), true, false ),
			esc_html__( 'Listeners stay in the player', 'riff-sign-in' ),
			esc_html__( 'People who cannot write posts sign in and sign up in the player. They keep their profile but see no dashboard or toolbar, and the registration form at wp-login.php is closed.', 'riff-sign-in' )
		);
	}

	/**
	 * Whether listeners stay in the player.
	 *
	 * @return bool
	 */
	public static function on(): bool {
		return (bool) get_option( self::OPTION, false );
	}

	/**
	 * Whether the current user is a listener: signed in, and unable to write posts.
	 *
	 * @return bool
	 */
	public static function listener(): bool {
		return self::on() && is_user_logged_in() && ! current_user_can( 'edit_posts' );
	}

	/**
	 * Where a listener sent away from wp-admin lands: the Listen page, or the home page.
	 *
	 * @return string
	 */
	public static function destination(): string {
		$page = class_exists( '\Riff\Listen\First_Run' ) ? \Riff\Listen\First_Run::listen_page() : 0;
		return $page ? (string) get_permalink( $page ) : home_url( '/' );
	}

	/**
	 * Where this wp-admin screen sends the current user, or '' to let them stay.
	 *
	 * @param string $screen The screen's file, as $pagenow names it.
	 * @return string
	 */
	public static function redirect_for( string $screen ): string {
		if ( ! self::listener() || wp_doing_ajax() || in_array( $screen, self::ALLOWED, true ) ) {
			return '';
		}
		return self::destination();
	}

	/**
	 * Sends a listener on any other wp-admin screen to the Listen page.
	 */
	public static function keep_out(): void {
		global $pagenow;
		$to = self::redirect_for( (string) $pagenow );
		if ( '' !== $to ) {
			wp_safe_redirect( $to );
			exit;
		}
	}

	/**
	 * Leaves a listener's admin menu with their profile alone.
	 */
	public static function menu(): void {
		if ( self::listener() ) {
			remove_menu_page( 'index.php' );
		}
	}

	/**
	 * No toolbar for a listener.
	 *
	 * @param bool $show Whether WordPress would show it.
	 * @return bool
	 */
	public static function toolbar( $show ) {
		return self::listener() ? false : $show;
	}

	/**
	 * No Register link on the login form while the player is the way in.
	 *
	 * @param string $link The link's HTML.
	 * @return string
	 */
	public static function register_link( $link ) {
		return self::on() ? '' : $link;
	}

	/**
	 * Closes wp-login.php?action=register, sending whoever opens it to the Listen page.
	 */
	public static function close_form(): void {
		if ( self::on() ) {
			wp_safe_redirect( self::destination() );
			exit;
		}
	}
}
