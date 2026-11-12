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
 * one when the site lets anyone register. The link asks before it uses the code, except in the
 * browser that asked for it, so a mail scanner that opens every link uses nothing up. The request
 * answers the same whether or not the address has an account, so it tells nobody who is a member.
 * Requests are limited per address and per network address, a hundred times as many on a local
 * site, a code allows five tries, and an address allows twenty wrong codes a day across all its
 * codes. Each request and each try is counted in one step, in the object cache when the site has a
 * persistent one and in the options table otherwise, so requests that arrive together are each
 * counted.
 *
 * The mail goes once the answer is sent, on every path, so how long the answer takes says nothing
 * about the address either: after fastcgi_finish_request() where PHP has it, in a single cron event
 * where it doesn't, and at the end of the request on a local site.
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
	 * Wrong codes one address allows in a day, across all its codes.
	 */
	public const FAILS = 20;

	/**
	 * The cron event that mails a code where PHP can't finish the answer first.
	 */
	public const MAIL = 'riff_sign_in_mail';

	/**
	 * The longest a site's name is in the mail, in characters.
	 */
	private const SITE_LENGTH = 60;

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
	 * How many times higher the limits are on a local site, where sign-in is tried over and over.
	 */
	private const LOCAL_LIMITS = 100;

	/**
	 * The query argument a link in the email carries: the token and the code, with a dot between.
	 */
	public const QUERY = 'riff-sign-in';

	/**
	 * The object cache group the counts are kept in, on a site with a persistent cache.
	 */
	private const GROUP = 'riff_signin';

	/**
	 * The cookie that marks the browser a code was asked from, so the link signs it straight in.
	 */
	public const COOKIE = 'riff_sign_in_browser';

	/**
	 * The environment, as the tests set it. WordPress keeps its own answer for the whole request,
	 * so the tests can't change it there; nothing else sets this.
	 *
	 * @var string|null
	 */
	private static ?string $environment = null;

	/**
	 * Whether PHP can finish the answer before the work after it, as the tests set it; null asks PHP.
	 *
	 * @var bool|null
	 */
	private static ?bool $finishes = null;

	/**
	 * The codes to mail once the answer is sent: [ email, code, token ] each.
	 *
	 * @var array[]
	 */
	private static array $outbox = array();

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
		$times = self::times();
		if ( ! self::within( 'email_' . md5( strtolower( $email ) ), self::PER_EMAIL * $times ) || ! self::within( 'ip_' . md5( self::ip() ), self::PER_IP * $times ) ) {
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
				'redirect' => self::redirect( $redirect ),
			),
			self::TTL
		);
		// A new account is made only when the code comes back and the site lets anyone register;
		// until then the address is only a transient. Nothing is sent where there is nobody to sign
		// in, but the answer is the same, and the mail is put off on every path alike, so neither
		// the answer nor its time says anything about who has an account.
		if ( $user instanceof WP_User || get_option( 'users_can_register' ) ) {
			/**
			 * Fires with a code as it is made, before it is mailed, for a site's own delivery or a
			 * test's eyes. It fires during the request, so delivery here should be quick.
			 *
			 * @since 0.1.0
			 *
			 * @param string $email The address.
			 * @param string $code  The six digits.
			 * @param string $link  The one-tap link.
			 */
			do_action( 'riff_sign_in_code', $email, $code, self::link( $token, $code ) );
		}
		self::later( $email, $code, $token );
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
		// The try is counted before the code is checked, so every try is counted, however many arrive
		// at once, and only the first five are checked.
		$tries = self::tries( $token );
		if ( self::count( $tries, self::TTL ) > self::TRIES ) {
			delete_transient( $key );
			self::uncount( $tries );
			return new WP_Error( 'riff_sign_in_tries', __( 'Too many tries. Ask for a new code.', 'riff-sign-in' ) );
		}
		// And against the address, across all its codes, so asking for code after code does not
		// buy more tries. Counted first too; a right code takes its own count back.
		$fails = 'riff_signin_fails_' . md5( strtolower( (string) $kept['email'] ) );
		if ( self::count( $fails, DAY_IN_SECONDS ) > self::fails( (string) $kept['email'] ) ) {
			return new WP_Error( 'riff_sign_in_locked', __( 'Too many wrong codes for this address today. Try again tomorrow, or sign in with a passkey.', 'riff-sign-in' ), array( 'status' => 429 ) );
		}
		if ( 6 !== strlen( $code ) || ! hash_equals( $kept['hash'], self::hash( $token, $code ) ) ) {
			return new WP_Error( 'riff_sign_in_wrong', __( 'That code did not match. Check the email and try again.', 'riff-sign-in' ) );
		}
		self::discount( $fails );
		delete_transient( $key );
		self::uncount( $tries );
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
		$kept = self::kept( $token );
		return is_array( $kept ) && ! empty( $kept['redirect'] ) ? (string) $kept['redirect'] : home_url( '/' );
	}

	/**
	 * The address a token's code was sent to, with all but its first character before the @ hidden,
	 * as "j•••@example.com"; empty when the token is unknown.
	 *
	 * @param string $token The token.
	 * @return string
	 */
	public static function address( string $token ): string {
		$kept = self::kept( $token );
		if ( ! is_array( $kept ) || ! str_contains( (string) $kept['email'], '@' ) ) {
			return '';
		}
		[ $name, $domain ] = explode( '@', (string) $kept['email'], 2 );
		return mb_substr( $name, 0, 1 ) . '•••@' . $domain;
	}

	/**
	 * Whether a token's code can still be used: not expired, and with tries left. Only reads it.
	 *
	 * @param string $token The token.
	 * @return bool
	 */
	public static function pending( string $token ): bool {
		$kept = self::kept( $token );
		return is_array( $kept ) && self::counted( self::tries( $token ) ) < self::TRIES;
	}

	/**
	 * What a token's tries are counted under.
	 *
	 * @param string $token The token.
	 * @return string
	 */
	private static function tries( string $token ): string {
		return 'riff_signin_tries_' . preg_replace( '/[^A-Za-z0-9_-]/', '', $token );
	}

	/**
	 * What the cookie holds in the browser that asked for a token's code: bound to the token and
	 * the site, so nobody who only has the link can make it.
	 *
	 * @param string $token The token.
	 * @return string
	 */
	public static function browser( string $token ): string {
		return hash_hmac( 'sha256', 'browser|' . $token, wp_salt( 'auth' ) );
	}

	/**
	 * Marks this browser as the one that asked for a token's code, for as long as the code lives.
	 * A browser keeps one at a time, so after "Send another code" only the newest link signs in
	 * without asking.
	 *
	 * @param string $token The token.
	 */
	public static function remember( string $token ): void {
		if ( headers_sent() ) {
			return;
		}
		setcookie(
			self::COOKIE,
			self::browser( $token ),
			array(
				'expires'  => time() + self::TTL,
				'path'     => COOKIEPATH,
				'domain'   => COOKIE_DOMAIN,
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
	}

	/**
	 * Takes the mark off this browser once its code is used.
	 */
	public static function forget(): void {
		unset( $_COOKIE[ self::COOKIE ] );
		if ( headers_sent() ) {
			return;
		}
		setcookie(
			self::COOKIE,
			'',
			array(
				'expires'  => time() - YEAR_IN_SECONDS,
				'path'     => COOKIEPATH,
				'domain'   => COOKIE_DOMAIN,
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
	}

	/**
	 * Whether this request comes from the browser that asked for a token's code.
	 *
	 * @param string $token The token.
	 * @return bool
	 */
	public static function same_browser( string $token ): bool {
		$cookie = isset( $_COOKIE[ self::COOKIE ] ) ? sanitize_text_field( wp_unslash( $_COOKIE[ self::COOKIE ] ) ) : '';
		return '' !== $cookie && hash_equals( self::browser( $token ), $cookie );
	}

	/**
	 * A token's transient, or false.
	 *
	 * @param string $token The token.
	 * @return array|false
	 */
	private static function kept( string $token ) {
		return get_transient( 'riff_signin_code_' . preg_replace( '/[^A-Za-z0-9_-]/', '', $token ) );
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
	 * The link in the email: the token and the code on the front page.
	 *
	 * @param string $token The token.
	 * @param string $code  The code.
	 * @return string
	 */
	private static function link( string $token, string $code ): string {
		return add_query_arg( self::QUERY, $token . '.' . $code, home_url( '/' ) );
	}

	/**
	 * Puts a code's mail off until the answer is sent: after PHP finishes the answer where it can,
	 * at the end of the request on a local site, and in a single cron event otherwise, with the code
	 * kept in a transient until then. Called for every request, whoever the address is.
	 *
	 * @param string $email The address.
	 * @param string $code  The code.
	 * @param string $token Its token.
	 */
	private static function later( string $email, string $code, string $token ): void {
		if ( self::finishes() || 'local' === ( self::$environment ?? wp_get_environment_type() ) ) {
			// Last, after WordPress has flushed its own output buffers at 1. Added once, however often.
			add_action( 'shutdown', array( self::class, 'flush' ), PHP_INT_MAX );
			self::$outbox[] = array( $email, $code, $token );
			return;
		}
		set_transient(
			'riff_signin_mail_' . $token,
			array(
				'email' => $email,
				'code'  => $code,
			),
			self::TTL
		);
		wp_schedule_single_event( time(), self::MAIL, array( $token ) );
	}

	/**
	 * Whether PHP can send the answer and carry on: PHP-FPM and LiteSpeed can.
	 *
	 * @return bool
	 */
	private static function finishes(): bool {
		return self::$finishes ?? ( function_exists( 'fastcgi_finish_request' ) || function_exists( 'litespeed_finish_request' ) );
	}

	/**
	 * Sends the answer, where PHP can, then mails the codes this request made. On `shutdown`.
	 */
	public static function flush(): void {
		$outbox       = self::$outbox;
		self::$outbox = array();
		if ( ! $outbox ) {
			return;
		}
		if ( function_exists( 'fastcgi_finish_request' ) || function_exists( 'litespeed_finish_request' ) ) {
			// Anything still buffered goes with the answer, not after it.
			while ( ob_get_level() > 0 && ob_end_flush() ) {
				continue;
			}
			function_exists( 'fastcgi_finish_request' ) ? fastcgi_finish_request() : litespeed_finish_request();
		}
		foreach ( $outbox as [ $email, $code, $token ] ) {
			self::send( $email, $code, $token );
		}
	}

	/**
	 * Mails a code kept for the cron event, once. On the `riff_sign_in_mail` event.
	 *
	 * @param string $token The token.
	 */
	public static function deliver( string $token ): void {
		$key  = 'riff_signin_mail_' . preg_replace( '/[^A-Za-z0-9_-]/', '', $token );
		$mail = get_transient( $key );
		delete_transient( $key );
		if ( is_array( $mail ) ) {
			self::send( (string) $mail['email'], (string) $mail['code'], $token );
		}
	}

	/**
	 * Mails the code and the link, when there is someone to sign in: an account with the address,
	 * or a site that lets anyone register.
	 *
	 * @param string $email The address.
	 * @param string $code  The code.
	 * @param string $token Its token.
	 */
	private static function send( string $email, string $code, string $token ): void {
		if ( ! get_user_by( 'email', $email ) && ! get_option( 'users_can_register' ) ) {
			return;
		}
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
		$site = self::site();
		$body = sprintf(
			/* translators: 1: the site's name, quoted, 2: the six-digit code, 3: the one-tap link, 4: how many minutes the code lasts. */
			__( "Your code to sign in to %1\$s:\n\n%2\$s\n\nOr sign in with one tap:\n%3\$s\n\nThe code works for %4\$d minutes. If you did not ask for it, you can ignore this email.", 'riff-sign-in' ),
			$site,
			$code,
			self::link( $token, $code ),
			(int) ( self::TTL / MINUTE_IN_SECONDS )
		);
		/* translators: 1: the six-digit code, 2: the site's name, quoted. */
		wp_mail( $email, sprintf( __( '%1$s is your code for %2$s', 'riff-sign-in' ), $code, $site ), $body );
	}

	/**
	 * The site's name as the mail gives it to whoever typed an address: plain text on one line, no
	 * longer than sixty characters, in quotes, so it reads as a name and not as part of the message.
	 * The site's address when it has no name.
	 *
	 * @return string
	 */
	private static function site(): string {
		$name = wp_specialchars_decode( wp_strip_all_tags( (string) get_bloginfo( 'name' ) ), ENT_QUOTES );
		$name = trim( (string) preg_replace( '/\s+/u', ' ', $name ) );
		if ( '' === $name ) {
			$name = (string) wp_parse_url( home_url(), PHP_URL_HOST );
		}
		if ( mb_strlen( $name ) > self::SITE_LENGTH ) {
			$name = rtrim( mb_substr( $name, 0, self::SITE_LENGTH - 1 ) ) . '…';
		}
		/* translators: %s: the site's name. */
		return sprintf( _x( '“%s”', 'the site name, quoted in an email', 'riff-sign-in' ), $name );
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
	 * How many times higher the limits are: one, so the real limits, anywhere but a local site.
	 *
	 * @return int
	 */
	private static function times(): int {
		if ( 'local' !== ( self::$environment ?? wp_get_environment_type() ) ) {
			return 1;
		}
		/**
		 * Filters how many times higher the code request limits are on a local site, where
		 * wp_get_environment_type() is 'local'. Outside a local environment they are never
		 * raised, whatever this says.
		 *
		 * @since 0.6.0
		 *
		 * @param int $times How many times. Default 100.
		 */
		return max( 1, (int) apply_filters( 'riff_sign_in_limits', self::LOCAL_LIMITS ) );
	}

	/**
	 * How many wrong codes an address allows in a day, across all its codes.
	 *
	 * @param string $email The address.
	 * @return int
	 */
	private static function fails( string $email ): int {
		/**
		 * Filters how many wrong codes one address allows in a day, across every code sent to it.
		 * Once it is reached, no code for the address is checked until the day is up. On a local
		 * site it is raised as the request limits are.
		 *
		 * @since 0.6.1
		 *
		 * @param int    $fails How many. Default 20.
		 * @param string $email The address.
		 */
		return max( 1, (int) apply_filters( 'riff_sign_in_failed_codes', self::FAILS, $email ) ) * self::times();
	}

	/**
	 * Counts a request from this network address against a limit of its own, and says whether it
	 * is over it. On a local site the limit is raised as the code request limits are.
	 *
	 * @param string $what  What is limited.
	 * @param int    $limit How many the window allows.
	 * @return bool
	 */
	public static function over( string $what, int $limit ): bool {
		return ! self::within( $what . '_ip_' . md5( self::ip() ), $limit * self::times() );
	}

	/**
	 * Counts a request against a limit, and says whether it is within it.
	 *
	 * @param string $key   What is counted.
	 * @param int    $limit How many the window allows.
	 * @return bool
	 */
	private static function within( string $key, int $limit ): bool {
		return self::count( 'riff_signin_rate_' . $key, self::WINDOW ) <= $limit;
	}

	/**
	 * Adds one to a count and says what it is now, in one step, so two requests that arrive
	 * together are both counted. A count lasts `$ttl` seconds from its first, then starts again.
	 *
	 * A site with a persistent object cache keeps the count there, by wp_cache_add() and
	 * wp_cache_incr(). Any other keeps it in the options table as a transient, `_transient_{$name}`
	 * with its `_transient_timeout_{$name}`, so WordPress's own clean-up of expired transients
	 * removes it, but adds to it in SQL rather than reading it and writing it back.
	 *
	 * @param string $name What is counted.
	 * @param int    $ttl  How long the count lasts, in seconds.
	 * @return int The count, this one included. PHP_INT_MAX when the cache will not keep it, so a
	 *             limit refuses rather than lets everything through.
	 */
	private static function count( string $name, int $ttl ): int {
		if ( wp_using_ext_object_cache() ) {
			for ( $i = 0; $i < 2; $i++ ) {
				wp_cache_add( $name, 0, self::GROUP, $ttl );
				$count = wp_cache_incr( $name, 1, self::GROUP );
				if ( false !== $count ) {
					return (int) $count;
				}
			}
			return PHP_INT_MAX;
		}
		global $wpdb;
		$value   = '_transient_' . $name;
		$timeout = '_transient_timeout_' . $name;
		$now     = time();
		// A count whose time is up starts again: the count and its time in one statement, which
		// holds both rows, so of two requests at the end of the time only one starts it again.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- the count must be read and written by MySQL in one step, which the options API can't.
		$wpdb->query(
			$wpdb->prepare(
				"UPDATE {$wpdb->options} AS v INNER JOIN {$wpdb->options} AS t ON t.option_name = %s SET v.option_value = '0', t.option_value = %s WHERE v.option_name = %s AND CAST( t.option_value AS UNSIGNED ) < %d",
				$timeout,
				(string) ( $now + $ttl ),
				$value,
				$now
			)
		);
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$wpdb->options} ( option_name, option_value, autoload ) VALUES ( %s, %s, 'off' ) ON DUPLICATE KEY UPDATE option_name = option_name",
				$timeout,
				(string) ( $now + $ttl )
			)
		);
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$wpdb->options} ( option_name, option_value, autoload ) VALUES ( %s, '1', 'off' ) ON DUPLICATE KEY UPDATE option_value = option_value + 1",
				$value
			)
		);
		// Read after this request's own step, so it is at least this request's count: another
		// request's step in between only makes it higher, never lower, and never lets one more in.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$count = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $value ) );
		return null === $count ? PHP_INT_MAX : (int) $count;
	}

	/**
	 * What a count is now, without adding to it: 0 when there is none, or its time is up.
	 *
	 * @param string $name What is counted.
	 * @return int
	 */
	private static function counted( string $name ): int {
		if ( wp_using_ext_object_cache() ) {
			return (int) wp_cache_get( $name, self::GROUP );
		}
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT v.option_value FROM {$wpdb->options} AS v INNER JOIN {$wpdb->options} AS t ON t.option_name = %s WHERE v.option_name = %s AND CAST( t.option_value AS UNSIGNED ) >= %d",
				'_transient_timeout_' . $name,
				'_transient_' . $name,
				time()
			)
		);
	}

	/**
	 * Takes one off a count, in one step, never below none.
	 *
	 * @param string $name What is counted.
	 */
	private static function discount( string $name ): void {
		if ( wp_using_ext_object_cache() ) {
			wp_cache_decr( $name, 1, self::GROUP );
			return;
		}
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- as count(), in one step.
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = GREATEST( CAST( option_value AS SIGNED ) - 1, 0 ) WHERE option_name = %s", '_transient_' . $name ) );
	}

	/**
	 * Ends a count.
	 *
	 * @param string $name What is counted.
	 */
	private static function uncount( string $name ): void {
		if ( wp_using_ext_object_cache() ) {
			wp_cache_delete( $name, self::GROUP );
			return;
		}
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name IN ( %s, %s )", '_transient_' . $name, '_transient_timeout_' . $name ) );
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
