<?php
/**
 * Riff Sign In: the plugin.
 *
 * @package Riff\SignIn
 */

namespace Riff\SignIn;

use WP_User;

// phpcs:set WordPress.WP.I18n text_domain[] riff-sign-in

defined( 'ABSPATH' ) || exit;

/**
 * Signing in to Riff without a password.
 *
 * Listeners sign in from a sheet inside the player, so the music keeps playing: a code sent to
 * their email with a one-tap link, and after the first time a passkey (Face ID, Touch ID, a
 * fingerprint, a security key), which the browser can offer from the email field itself. They are
 * ordinary WordPress users, signed in with the same cookie as everyone else; new accounts are made
 * only when the site lets anyone register. Nothing is stored but each passkey's public key, in
 * user meta. Everything the sheet does goes through this plugin's own REST routes and Riff's
 * documented surface: the `riff_before_player` action, and the sign-in links the player and the
 * Listen app already show, which the sheet answers in place of wp-login.php.
 */
final class Sign_In {

	/**
	 * Hooks everything.
	 */
	public static function register(): void {
		Routes::register();
		add_action( 'riff_before_player', array( self::class, 'enqueue' ) );
		add_action( 'template_redirect', array( self::class, 'link' ) );
		add_filter( 'wp_privacy_personal_data_exporters', array( self::class, 'exporters' ) );
		add_filter( 'wp_privacy_personal_data_erasers', array( self::class, 'erasers' ) );
		add_action( 'admin_init', array( self::class, 'privacy_policy' ) );
		add_filter( 'site_status_tests', array( self::class, 'tests' ) );
		add_action( 'show_user_profile', array( self::class, 'profile' ) );
	}

	/**
	 * Signs a user in: the cookie every WordPress sign-in sets, remembered, and the action every
	 * sign-in fires, so Riff joins the browser's likes and plays to the account on the next load.
	 *
	 * @param WP_User $user The user.
	 */
	public static function sign_in( WP_User $user ): void {
		wp_set_current_user( $user->ID );
		// The cookie goes out in the headers; this request has to see it too, so the nonce the
		// sheet is handed is made with the new session's token and not an empty one.
		add_action(
			'set_logged_in_cookie',
			static function ( $cookie ): void {
				$_COOKIE[ LOGGED_IN_COOKIE ] = $cookie;
			}
		);
		wp_set_auth_cookie( $user->ID, true );
		/** This action is documented in wp-includes/user.php */
		do_action( 'wp_login', $user->user_login, $user ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's own action, fired as core fires it.
	}

	/**
	 * Loads the sheet on every page the player renders, with what it needs: the routes, the site's
	 * words, and whether this browser may make a passkey.
	 */
	public static function enqueue(): void {
		wp_enqueue_script( 'riff-sign-in', RIFF_SIGN_IN_URL . 'assets/sign-in.js', array( 'wp-a11y' ), RIFF_SIGN_IN_VERSION, true );
		wp_add_inline_script(
			'riff-sign-in',
			'window.riffSignIn = ' . wp_json_encode(
				array(
					'rest'     => esc_url_raw( rest_url( Routes::NAMESPACE . '/' ) ),
					'signedIn' => is_user_logged_in(),
					'nonce'    => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '',
					'login'    => wp_login_url(),
					'site'     => wp_strip_all_tags( (string) get_bloginfo( 'name' ) ),
					'strings'  => array(
						'title'     => __( 'Sign in', 'riff-sign-in' ),
						'intro'     => __( 'Your likes, playlists and what you played follow you. No password: a code comes to your email, and after that a passkey.', 'riff-sign-in' ),
						'email'     => __( 'Email', 'riff-sign-in' ),
						'continue'  => __( 'Continue', 'riff-sign-in' ),
						'passkey'   => __( 'Sign in with a passkey', 'riff-sign-in' ),
						/* translators: %s: the email address the code was sent to. */
						'sent'      => __( 'A code is on its way to %s. Type it here, or tap the link in the email.', 'riff-sign-in' ),
						'code'      => __( 'Code', 'riff-sign-in' ),
						'signIn'    => __( 'Sign in', 'riff-sign-in' ),
						'again'     => __( 'Send another code', 'riff-sign-in' ),
						'back'      => __( 'Use a different email', 'riff-sign-in' ),
						'done'      => __( 'You are signed in.', 'riff-sign-in' ),
						'save'      => __( 'Save a passkey for next time?', 'riff-sign-in' ),
						'saveWhy'   => __( 'Next time, Face ID, Touch ID or your fingerprint signs you in, with no code to wait for.', 'riff-sign-in' ),
						'saveYes'   => __( 'Save a passkey', 'riff-sign-in' ),
						'saveNo'    => __( 'Not now', 'riff-sign-in' ),
						'saved'     => __( 'Passkey saved.', 'riff-sign-in' ),
						'close'     => __( 'Close', 'riff-sign-in' ),
						'help'      => __( 'Sign in with a password instead', 'riff-sign-in' ),
						'failed'    => __( 'That did not work. Try again.', 'riff-sign-in' ),
						'cancelled' => __( 'No passkey was used.', 'riff-sign-in' ),
					),
				)
			) . ';',
			'before'
		);
		wp_register_style( 'riff-sign-in', false, array( 'riff-tokens' ), RIFF_SIGN_IN_VERSION );
		wp_enqueue_style( 'riff-sign-in' );
		wp_add_inline_style( 'riff-sign-in', self::css() );
	}

	/**
	 * The sheet's styles, in Riff's tokens: a sheet on the player's surface, as Up next is, its
	 * buttons as the player's pills are. The tokens are set on the player's root, which the sheet
	 * is not inside, so sign-in.js copies their values onto the dialog as it opens. Everything the
	 * sheet shows is set here, the font, margins and sizes included, so neither a theme's styles
	 * nor the browser's defaults (all the Listen app's own document has) show through.
	 *
	 * @return string
	 */
	private static function css(): string {
		return '.riff-signin{box-sizing:border-box;width:min(420px,calc(100vw - 32px));max-width:none;max-height:calc(100dvh - 32px);margin:auto;padding:28px 24px 24px;overflow:auto;border:1px solid var(--riff-line);border-radius:16px;background:var(--riff-surface);color:var(--riff-fg);font-size:16px;font-weight:400;line-height:1.5;-webkit-font-smoothing:antialiased;box-shadow:0 24px 64px rgb(0 0 0/.5)}'
			. '.riff-signin *,.riff-signin *::before,.riff-signin *::after{box-sizing:border-box}'
			. '.riff-signin::backdrop{background:rgb(0 0 0/.6)}'
			. '.riff-signin[open]{display:flex;flex-direction:column;gap:12px}'
			. '.riff-signin h2{margin:0 40px 0 0;padding:0;color:inherit;font-family:inherit;font-size:22px;font-weight:700;line-height:1.25;letter-spacing:normal;text-transform:none}'
			. '.riff-signin p{margin:0;padding:0;color:var(--riff-fg-2);font:inherit}'
			. '.riff-signin form{display:flex;flex-direction:column;gap:6px;margin:4px 0 0}'
			. '.riff-signin label{display:block;margin:0;color:var(--riff-fg);font-size:14px;font-weight:600;line-height:1.4}'
			. '.riff-signin input{display:block;width:100%;min-height:48px;margin:0;padding:12px 14px;border:1px solid var(--riff-fg-3);border-radius:8px;background:var(--riff-bg);box-shadow:none;color:var(--riff-fg);caret-color:var(--riff-accent);font-family:inherit;font-size:16px;line-height:1.4;appearance:none}'
			. '.riff-signin input:hover{border-color:var(--riff-fg-2)}'
			. '.riff-signin input:focus{border-color:var(--riff-accent);outline:2px solid var(--riff-accent);outline-offset:0}'
			. '.riff-signin input.riff-signin-code{font-size:24px;font-variant-numeric:tabular-nums;letter-spacing:.3em;text-align:center}'
			. '.riff-signin-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}'
			. '.riff-signin button{all:unset;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;padding:0 20px;border:1px solid var(--riff-fg-3);border-radius:999px;color:var(--riff-fg);font-family:inherit;font-size:15px;font-weight:600;line-height:1.2;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}'
			. '.riff-signin button:hover{border-color:var(--riff-fg-2);background:var(--riff-hover)}'
			. '.riff-signin button.riff-signin-main{border-color:var(--riff-accent);background:var(--riff-accent);color:var(--riff-bg)}'
			. '.riff-signin button.riff-signin-main:hover{filter:brightness(1.1)}'
			. '.riff-signin button:focus-visible{outline:2px solid var(--riff-fg);outline-offset:2px}'
			. '.riff-signin button[disabled]{opacity:.5;filter:none;cursor:default}'
			. '.riff-signin button.riff-signin-close{position:absolute;top:12px;right:12px;width:40px;min-height:40px;padding:0;border-color:transparent;border-radius:50%;color:var(--riff-fg-2)}'
			. '.riff-signin button.riff-signin-close:hover{background:var(--riff-hover);color:var(--riff-fg)}'
			. '.riff-signin-close svg{display:block;width:20px;height:20px}'
			. '.riff-signin p.riff-signin-note{font-size:14px}'
			. '.riff-signin p.riff-signin-error{color:var(--riff-accent);font-weight:600}'
			. '.riff-signin a{color:var(--riff-fg-2);text-decoration:underline;text-underline-offset:3px}'
			. '.riff-signin a:hover{color:var(--riff-fg)}'
			. '.riff-signin a:focus-visible{border-radius:2px;outline:2px solid var(--riff-fg);outline-offset:2px}'
			. '@media (max-width:600px){.riff-signin{width:calc(100vw - 16px);margin:auto 8px max(8px,env(safe-area-inset-bottom))}}';
	}

	/**
	 * Signs in whoever opens the link in the email: ?riff-sign-in=TOKEN.CODE on the site's front
	 * page, then on to the page they asked for the code from.
	 */
	public static function link(): void {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- the token in the link is the proof.
		if ( ! isset( $_GET[ Codes::QUERY ] ) ) {
			return;
		}
		$value = sanitize_text_field( wp_unslash( $_GET[ Codes::QUERY ] ) );
		// phpcs:enable
		[ $token, $code ] = array_pad( explode( '.', $value, 2 ), 2, '' );
		$landing          = Codes::landing( $token );
		$user             = is_user_logged_in() ? wp_get_current_user() : Codes::verify( $token, $code );
		if ( is_wp_error( $user ) ) {
			wp_die(
				esc_html( $user->get_error_message() ),
				esc_html__( 'Sign in', 'riff-sign-in' ),
				array(
					'response'  => 403,
					'link_url'  => esc_url( $landing ),
					'link_text' => esc_html__( 'Back to the site', 'riff-sign-in' ),
				)
			);
		}
		wp_safe_redirect( $landing );
		exit;
	}

	/**
	 * A listener's passkeys on their profile, to take one away.
	 *
	 * @param WP_User $user The user.
	 */
	public static function profile( WP_User $user ): void {
		$keys = Passkeys::all( $user->ID );
		echo '<h2>' . esc_html__( 'Passkeys', 'riff-sign-in' ) . '</h2>';
		if ( ! $keys ) {
			echo '<p>' . esc_html__( 'No passkeys yet. Sign in to the player from a new device and it offers to save one.', 'riff-sign-in' ) . '</p>';
			return;
		}
		echo '<p>' . esc_html__( 'A passkey signs you in to the player on the device that made it. Take one away here if the device is gone.', 'riff-sign-in' ) . '</p>';
		echo '<ul class="riff-signin-passkeys">';
		foreach ( $keys as $key ) {
			printf(
				'<li>%1$s <span class="description">(%2$s)</span> <button type="button" class="button-link button-link-delete" data-riff-signin-delete="%3$s">%4$s</button></li>',
				esc_html( $key['name'] ),
				esc_html( wp_date( get_option( 'date_format' ), (int) $key['created'] ) ),
				esc_attr( $key['id'] ),
				esc_html__( 'Remove', 'riff-sign-in' )
			);
		}
		echo '</ul>';
		wp_enqueue_script( 'riff-sign-in-profile', RIFF_SIGN_IN_URL . 'assets/profile.js', array( 'wp-api-fetch' ), RIFF_SIGN_IN_VERSION, true );
		wp_add_inline_script( 'riff-sign-in-profile', 'window.riffSignInProfile = ' . wp_json_encode( array( 'route' => Routes::NAMESPACE . '/passkeys/' ) ) . ';', 'before' );
	}

	/**
	 * Adds the passkeys to Tools > Export Personal Data.
	 *
	 * @param array $exporters Exporters.
	 * @return array
	 */
	public static function exporters( $exporters ) {
		$exporters                 = (array) $exporters;
		$exporters['riff-sign-in'] = array(
			'exporter_friendly_name' => __( 'Riff passkeys', 'riff-sign-in' ),
			'callback'               => array( self::class, 'export' ),
		);
		return $exporters;
	}

	/**
	 * Adds the passkeys to Tools > Erase Personal Data.
	 *
	 * @param array $erasers Erasers.
	 * @return array
	 */
	public static function erasers( $erasers ) {
		$erasers                 = (array) $erasers;
		$erasers['riff-sign-in'] = array(
			'eraser_friendly_name' => __( 'Riff passkeys', 'riff-sign-in' ),
			'callback'             => array( self::class, 'erase' ),
		);
		return $erasers;
	}

	/**
	 * A user's passkeys for their export: each one's name and when it was made. The key itself
	 * is public, but is nothing to a person, so it is left out.
	 *
	 * @param string $email The user's email.
	 * @return array
	 */
	public static function export( $email ): array {
		$user = get_user_by( 'email', (string) $email );
		$data = array();
		foreach ( $user ? Passkeys::all( $user->ID ) : array() as $key ) {
			$data[] = array(
				'name'  => __( 'Passkey', 'riff-sign-in' ),
				'value' => $key['name'] . ' (' . wp_date( 'Y-m-d', (int) $key['created'] ) . ')',
			);
		}
		return array(
			'data' => $data ? array(
				array(
					'group_id'    => 'riff-sign-in',
					'group_label' => __( 'Riff passkeys', 'riff-sign-in' ),
					'item_id'     => 'riff-sign-in-' . (int) $user->ID,
					'data'        => $data,
				),
			) : array(),
			'done' => true,
		);
	}

	/**
	 * Erases a user's passkeys.
	 *
	 * @param string $email The user's email.
	 * @return array
	 */
	public static function erase( $email ): array {
		$user    = get_user_by( 'email', (string) $email );
		$removed = false;
		if ( $user ) {
			$removed = (bool) Passkeys::all( $user->ID );
			delete_user_meta( $user->ID, Passkeys::META );
			delete_user_meta( $user->ID, Passkeys::ID_META );
			delete_user_meta( $user->ID, Passkeys::HANDLE_META );
		}
		return array(
			'items_removed'  => $removed,
			'items_retained' => false,
			'messages'       => array(),
			'done'           => true,
		);
	}

	/**
	 * Suggests privacy policy text.
	 */
	public static function privacy_policy(): void {
		if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
			return;
		}
		$text = '<p>' . __( 'When you sign in to the player with your email, a code is sent to that address and kept, hashed, for ten minutes. When you save a passkey, the public half of the key your device made is kept with your account, with the name and date you gave it; the private half never leaves your device. You can remove a passkey from your profile, and ask for them to be exported or erased like the rest of your personal data.', 'riff-sign-in' ) . '</p>';
		wp_add_privacy_policy_content( 'Riff Sign In', wp_kses_post( $text ) );
	}

	/**
	 * Adds the Site Health check for email delivery.
	 *
	 * @param array $tests Tests.
	 * @return array
	 */
	public static function tests( $tests ) {
		$tests['direct']['riff_sign_in_mail'] = array(
			'label' => __( 'Riff Sign In can send its codes', 'riff-sign-in' ),
			'test'  => array( self::class, 'health' ),
		);
		return $tests;
	}

	/**
	 * Whether something delivers mail: a plugin on wp_mail or PHPMailer, or a configured SMTP
	 * host; the host's own sendmail is what most codes never arrive from.
	 *
	 * @return array Site Health result.
	 */
	public static function health(): array {
		$delivered = has_filter( 'pre_wp_mail' ) || has_action( 'phpmailer_init' ) || defined( 'SMTP_HOST' );
		$result    = array(
			'label'       => __( 'Riff Sign In sends its codes through a mail service', 'riff-sign-in' ),
			'status'      => 'good',
			'badge'       => array(
				'label' => __( 'Security', 'riff-sign-in' ),
				'color' => 'blue',
			),
			'description' => '<p>' . esc_html__( 'A plugin or a configured SMTP host handles the email with each sign-in code, so it arrives.', 'riff-sign-in' ) . '</p>',
			'test'        => 'riff_sign_in_mail',
		);
		if ( ! $delivered ) {
			$result['status']      = 'recommended';
			$result['label']       = __( 'Riff Sign In sends its codes through the server\'s own mail', 'riff-sign-in' );
			$result['description'] = '<p>' . esc_html__( 'Many hosts\' own mail is slow, or never arrives, and a listener waits for a code that does not come. Install an SMTP plugin, or a transactional mail service, so the codes are delivered.', 'riff-sign-in' ) . '</p>';
		}
		return $result;
	}
}

// phpcs:set WordPress.WP.I18n text_domain[] riff
