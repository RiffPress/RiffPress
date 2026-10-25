<?php
/**
 * Email codes: six digits and a one-tap link, sent to the address typed.
 *
 * @package Riff\SignIn
 */

namespace Riff\SignIn;

use WP_Error;
use WP_User;

// phpcs:set WordPress.WP.I18n text_domain[] riff-sign-in

defined( 'ABSPATH' ) || exit;

/**
 * A code to an email address.
 *
 * A request makes a token and a six-digit code, keeps the code's hash under the token in a
 * transient for ten minutes, and mails the code with a link that carries both. Whoever types the
 * code into the sheet, or taps the link, is signed in as the user with that address, or becomes
 * one when the site lets anyone register. The request answers the same whether or not the address
 * has an account, so it tells nobody who is a member. Requests are limited per address and per
 * network address, and a code allows five tries.
 */
final class Codes {

	/**
	 * How long a code lives.
	 */
	public const TTL = 10 * MINUTE_IN_SECONDS;

	/**
	 * Tries a code allows.
	 */
	public const TRIES = 5;

	/**
	 * Codes one address may ask for in the window, and the window.
	 */
	public const PER_EMAIL = 3;

	/**
	 * Codes one network address may ask for in the window.
	 */
	public const PER_IP = 10;

	/**
	 * The window the limits count over.
	 */
	public const WINDOW = 15 * MINUTE_IN_SECONDS;

	/**
	 * The query argument a link in the email carries: the token and the code, with a dot between.
	 */
	public const QUERY = 'riff-sign-in';

	/**
	 * Sends a code to an address, within the limits, and says which token the answer belongs to.
	 *
	 * @param string $email    The address typed.
	 * @param string $redirect Where the link in the email lands, on this site.
	 * @return array|WP_Error `token`, and `expires` in seconds.
	 */
	public static function request( string $email, string $redirect = '' ) {
		$email = sanitize_email( $email );
		if ( ! is_email( $email ) ) {
			return new WP_Error( 'riff_sign_in_email', __( 'That is not an email address.', 'riff-sign-in' ) );
		}
		if ( ! self::within( 'email_' . md5( strtolower( $email ) ), self::PER_EMAIL ) || ! self::within( 'ip_' . md5( self::ip() ), self::PER_IP ) ) {
			return new WP_Error( 'riff_sign_in_limit', __( 'Too many codes asked for. Wait a few minutes and try again.', 'riff-sign-in' ), array( 'status' => 429 ) );
		}
		$token = Passkeys::b64( random_bytes( 24 ) );
		$code  = str_pad( (string) random_int( 0, 999999 ), 6, '0', STR_PAD_LEFT );
		$user  = get_user_by( 'email', $email );
		set_transient(
			'riff_signin_code_' . $token,
			array(
				'email'    => $email,
				'user'     => $user instanceof WP_User ? $user->ID : 0,
				'hash'     => self::hash( $token, $code ),
				'tries'    => 0,
				'redirect' => self::redirect( $redirect ),
			),
			self::TTL
		);
		// A new account is made only when the code comes back and the site lets anyone register;
		// until then the address is only a transient. Nothing is sent where there is nobody to sign
		// in, but the answer is the same, so the request says nothing about who has an account.
		if ( $user instanceof WP_User || get_option( 'users_can_register' ) ) {
			self::send( $email, $code, $token );
		}
		return array(
			'token'   => $token,
			'expires' => self::TTL,
		);
	}

	/**
	 * Checks a code against its token and signs the listener in.
	 *
	 * @param string $token The token the code was sent under.
	 * @param string $code  The six digits typed, or pasted with spaces.
	 * @return WP_User|WP_Error The user signed in.
	 */
	public static function verify( string $token, string $code ) {
		$key  = 'riff_signin_code_' . preg_replace( '/[^A-Za-z0-9_-]/', '', $token );
		$kept = get_transient( $key );
		$code = preg_replace( '/\D/', '', $code );
		if ( ! is_array( $kept ) ) {
			return new WP_Error( 'riff_sign_in_expired', __( 'That code has expired. Ask for a new one.', 'riff-sign-in' ) );
		}
		if ( $kept['tries'] >= self::TRIES ) {
			delete_transient( $key );
			return new WP_Error( 'riff_sign_in_tries', __( 'Too many tries. Ask for a new code.', 'riff-sign-in' ) );
		}
		if ( 6 !== strlen( $code ) || ! hash_equals( $kept['hash'], self::hash( $token, $code ) ) ) {
			++$kept['tries'];
			set_transient( $key, $kept, self::TTL );
			return new WP_Error( 'riff_sign_in_wrong', __( 'That code did not match. Check the email and try again.', 'riff-sign-in' ) );
		}
		delete_transient( $key );
		$user = $kept['user'] ? get_user_by( 'id', (int) $kept['user'] ) : false;
		if ( ! $user instanceof WP_User ) {
			$user = self::make( (string) $kept['email'] );
		}
		if ( is_wp_error( $user ) ) {
			return $user;
		}
		Sign_In::sign_in( $user );
		return $user;
	}

	/**
	 * Where a sign-in by link lands: the page it was asked from, when it is on this site.
	 *
	 * @param string $token The token, for its transient.
	 * @return string
	 */
	public static function landing( string $token ): string {
		$kept = get_transient( 'riff_signin_code_' . preg_replace( '/[^A-Za-z0-9_-]/', '', $token ) );
		return is_array( $kept ) && ! empty( $kept['redirect'] ) ? (string) $kept['redirect'] : home_url( '/' );
	}

	/**
	 * A new user for an address, when the site lets anyone register: named after the address,
	 * with a password nobody knows, in the default role.
	 *
	 * @param string $email The address.
	 * @return WP_User|WP_Error
	 */
	private static function make( string $email ) {
		if ( ! get_option( 'users_can_register' ) ) {
			return new WP_Error( 'riff_sign_in_closed', __( 'There is no account for that address, and this site is not taking new ones.', 'riff-sign-in' ) );
		}
		$base  = sanitize_user( strtok( $email, '@' ), true );
		$base  = '' !== $base ? $base : 'listener';
		$login = $base;
		$n     = 1;
		while ( username_exists( $login ) ) {
			++$n;
			$login = $base . $n;
		}
		$id = wp_insert_user(
			array(
				'user_login' => $login,
				'user_email' => $email,
				'user_pass'  => wp_generate_password( 32, true, true ),
				'role'       => (string) get_option( 'default_role', 'subscriber' ),
			)
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$user = get_user_by( 'id', (int) $id );
		/**
		 * Fires once a listener's account is made from an email code.
		 *
		 * @since 0.1.0
		 *
		 * @param WP_User $user The new user.
		 */
		do_action( 'riff_sign_in_registered', $user );
		return $user;
	}

	/**
	 * Mails the code and the link.
	 *
	 * @param string $email The address.
	 * @param string $code  The code.
	 * @param string $token Its token.
	 */
	private static function send( string $email, string $code, string $token ): void {
		$site = wp_strip_all_tags( (string) get_bloginfo( 'name' ) );
		$link = add_query_arg( self::QUERY, $token . '.' . $code, home_url( '/' ) );
		/**
		 * Fires with a code before it is sent, for a site's own delivery or a test's eyes.
		 *
		 * @since 0.1.0
		 *
		 * @param string $email The address.
		 * @param string $code  The six digits.
		 * @param string $link  The one-tap link.
		 */
		do_action( 'riff_sign_in_code', $email, $code, $link );
		/**
		 * Filters whether the code is mailed with wp_mail(). Return false after sending it some
		 * other way.
		 *
		 * @since 0.1.0
		 *
		 * @param bool   $send  Whether to send. Default true.
		 * @param string $email The address.
		 */
		if ( ! apply_filters( 'riff_sign_in_send', true, $email ) ) {
			return;
		}
		$body = sprintf(
			/* translators: 1: the site's name, 2: the six-digit code, 3: the one-tap link, 4: how many minutes the code lasts. */
			__( "Your code to sign in to %1\$s:\n\n%2\$s\n\nOr sign in with one tap:\n%3\$s\n\nThe code works for %4\$d minutes. If you did not ask for it, you can ignore this email.", 'riff-sign-in' ),
			$site,
			$code,
			$link,
			(int) ( self::TTL / MINUTE_IN_SECONDS )
		);
		/* translators: 1: the six-digit code, 2: the site's name. */
		wp_mail( $email, sprintf( __( '%1$s is your code for %2$s', 'riff-sign-in' ), $code, $site ), $body );
	}

	/**
	 * A code's hash, bound to its token and the site.
	 *
	 * @param string $token Token.
	 * @param string $code  Code.
	 * @return string
	 */
	private static function hash( string $token, string $code ): string {
		return hash_hmac( 'sha256', $token . '|' . $code, wp_salt( 'auth' ) );
	}

	/**
	 * Counts a request against a limit, and says whether it is within it.
	 *
	 * @param string $key   What is counted.
	 * @param int    $limit How many the window allows.
	 * @return bool
	 */
	private static function within( string $key, int $limit ): bool {
		$count = (int) get_transient( 'riff_signin_rate_' . $key );
		if ( $count >= $limit ) {
			return false;
		}
		set_transient( 'riff_signin_rate_' . $key, $count + 1, self::WINDOW );
		return true;
	}

	/**
	 * The requester's network address, as WordPress sees it.
	 *
	 * @return string
	 */
	private static function ip(): string {
		return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	}

	/**
	 * A landing address on this site, or the front page.
	 *
	 * @param string $redirect What was asked for.
	 * @return string
	 */
	private static function redirect( string $redirect ): string {
		$safe = wp_validate_redirect( $redirect, '' );
		return '' !== $safe ? $safe : home_url( '/' );
	}
}

// phpcs:set WordPress.WP.I18n text_domain[] riff
