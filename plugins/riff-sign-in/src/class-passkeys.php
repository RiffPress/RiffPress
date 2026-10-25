<?php
/**
 * Passkeys: WebAuthn credentials kept on the user, made and checked here.
 *
 * @package Riff\SignIn
 */

namespace Riff\SignIn;

use WP_Error;
use WP_User;

// phpcs:set WordPress.WP.I18n text_domain[] riff-sign-in

defined( 'ABSPATH' ) || exit;

/**
 * A listener's passkeys.
 *
 * A passkey is a public key the browser made for this site, kept in user meta as `riff_passkeys`:
 * its credential ID, the key as PEM, its algorithm, its signature counter, when it was made and
 * what it is called. Nothing secret is stored; the private half never leaves the listener's
 * device. Registration takes the browser's attestation object apart (CBOR, then the authenticator
 * data, then the COSE key) and checks the client data; signing in checks the client data again,
 * then the signature over the authenticator data with OpenSSL. Attestation statements are not
 * verified: a passkey is the listener's own, not a token the site vouches for, so `none` is asked
 * for and anything else is read the same way.
 */
final class Passkeys {

	/**
	 * The user meta holding a user's passkeys.
	 */
	public const META = 'riff_passkeys';

	/**
	 * The user meta holding each credential ID, one value per passkey, so a sign-in with no email
	 * can find whose it is.
	 */
	public const ID_META = 'riff_passkey_id';

	/**
	 * The user meta holding the user's handle: random bytes the authenticator keeps with the key,
	 * in place of the user ID, so a passkey says nothing about the account it opens.
	 */
	public const HANDLE_META = 'riff_passkey_handle';

	/**
	 * How long a challenge lives.
	 */
	public const TTL = 5 * MINUTE_IN_SECONDS;

	/**
	 * The algorithms accepted, as COSE numbers: ES256 and RS256, which every passkey provider offers.
	 */
	public const ALGORITHMS = array( -7, -257 );

	/**
	 * The relying party's ID: the site's host.
	 *
	 * @return string
	 */
	public static function rp_id(): string {
		return (string) wp_parse_url( home_url(), PHP_URL_HOST );
	}

	/**
	 * The origin a browser reports for this site.
	 *
	 * @return string
	 */
	public static function origin(): string {
		$parts  = wp_parse_url( home_url() );
		$origin = ( $parts['scheme'] ?? 'https' ) . '://' . ( $parts['host'] ?? '' );
		if ( ! empty( $parts['port'] ) ) {
			$origin .= ':' . (int) $parts['port'];
		}
		return $origin;
	}

	/**
	 * A user's passkeys.
	 *
	 * @param int $user_id User ID.
	 * @return array[] Each: id, key, alg, counter, created, name, transports.
	 */
	public static function all( int $user_id ): array {
		$list = get_user_meta( $user_id, self::META, true );
		return array_values( array_filter( is_array( $list ) ? $list : array(), static fn( $k ) => is_array( $k ) && ! empty( $k['id'] ) && ! empty( $k['key'] ) ) );
	}

	/**
	 * A user's handle, made the first time it is asked for.
	 *
	 * @param int $user_id User ID.
	 * @return string Base64url.
	 */
	public static function handle( int $user_id ): string {
		$handle = (string) get_user_meta( $user_id, self::HANDLE_META, true );
		if ( '' === $handle ) {
			$handle = self::b64( random_bytes( 32 ) );
			update_user_meta( $user_id, self::HANDLE_META, $handle );
		}
		return $handle;
	}

	/**
	 * The options the browser needs to make a passkey for a user: a fresh challenge, the site as
	 * the relying party, the user by handle, the algorithms, and the passkeys they already have so
	 * none is made twice. A resident key is asked for, so the browser can offer it from the email
	 * field without a name typed first.
	 *
	 * @param WP_User $user The signed-in user.
	 * @return array Creation options, as navigator.credentials.create() takes them, challenge and
	 *               IDs as base64url.
	 */
	public static function creation_options( WP_User $user ): array {
		$challenge = self::b64( random_bytes( 32 ) );
		set_transient( 'riff_signin_reg_' . $user->ID, $challenge, self::TTL );
		$exclude = array();
		foreach ( self::all( $user->ID ) as $key ) {
			$exclude[] = array(
				'type' => 'public-key',
				'id'   => $key['id'],
			);
		}
		return array(
			'challenge'              => $challenge,
			'rp'                     => array(
				'id'   => self::rp_id(),
				'name' => wp_strip_all_tags( (string) get_bloginfo( 'name' ) ),
			),
			'user'                   => array(
				'id'          => self::handle( $user->ID ),
				'name'        => $user->user_email,
				'displayName' => $user->display_name,
			),
			'pubKeyCredParams'       => array_map( static fn( int $alg ) => array( 'type' => 'public-key', 'alg' => $alg ), self::ALGORITHMS ), // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
			'authenticatorSelection' => array(
				'residentKey'      => 'required',
				'userVerification' => 'preferred',
			),
			'attestation'            => 'none',
			'excludeCredentials'     => $exclude,
			'timeout'                => 120000,
		);
	}

	/**
	 * Keeps a passkey the browser made, after checking it is for this site and this challenge.
	 *
	 * @param WP_User $user       The signed-in user.
	 * @param array   $credential What navigator.credentials.create() returned: id, rawId, response
	 *                            { clientDataJSON, attestationObject, transports }, as base64url.
	 * @param string  $name       What the listener calls it, or empty for the device's own word.
	 * @return array|WP_Error The passkey kept: id, name, created.
	 * @throws \RuntimeException Inside, on bytes that cannot be read; caught and answered as an error.
	 */
	public static function create( WP_User $user, array $credential, string $name = '' ) {
		$challenge = (string) get_transient( 'riff_signin_reg_' . $user->ID );
		delete_transient( 'riff_signin_reg_' . $user->ID );
		if ( '' === $challenge ) {
			return new WP_Error( 'riff_sign_in_expired', __( 'That took too long. Try again.', 'riff-sign-in' ) );
		}
		$client = self::client_data( $credential['response']['clientDataJSON'] ?? '', 'webauthn.create', $challenge );
		if ( is_wp_error( $client ) ) {
			return $client;
		}
		try {
			$object = Cbor::decode( self::unb64( (string) ( $credential['response']['attestationObject'] ?? '' ) ) );
			if ( ! is_array( $object ) || ! is_string( $object['authData'] ?? null ) ) {
				throw new \RuntimeException( 'no authenticator data' );
			}
			$auth = self::auth_data( $object['authData'], true );
		} catch ( \RuntimeException $e ) {
			return new WP_Error( 'riff_sign_in_invalid', __( 'That passkey could not be read.', 'riff-sign-in' ) );
		}
		if ( is_wp_error( $auth ) ) {
			return $auth;
		}
		$id = self::b64( $auth['credential_id'] );
		// phpcs:disable WordPress.DB.SlowDBQuery -- a credential ID is unique by construction; the lookup is one row.
		if ( get_users(
			array(
				'meta_key'   => self::ID_META,
				'meta_value' => $id,
				'fields'     => 'ID',
			)
		) ) {
			// phpcs:enable // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- a credential ID is unique by construction; the lookup is one row.
			return new WP_Error( 'riff_sign_in_exists', __( 'That passkey is already saved.', 'riff-sign-in' ) );
		}
		$key   = array(
			'id'         => $id,
			'key'        => $auth['key'],
			'alg'        => $auth['alg'],
			'counter'    => $auth['counter'],
			'created'    => time(),
			'name'       => '' !== trim( $name ) ? mb_substr( sanitize_text_field( $name ), 0, 60 ) : __( 'Passkey', 'riff-sign-in' ),
			'transports' => array_values( array_filter( array_map( 'sanitize_key', (array) ( $credential['response']['transports'] ?? array() ) ) ) ),
		);
		$all   = self::all( $user->ID );
		$all[] = $key;
		update_user_meta( $user->ID, self::META, $all );
		add_user_meta( $user->ID, self::ID_META, $id );
		return array(
			'id'      => $id,
			'name'    => $key['name'],
			'created' => $key['created'],
		);
	}

	/**
	 * Takes a passkey away.
	 *
	 * @param int    $user_id User ID.
	 * @param string $id      Credential ID, base64url.
	 * @return bool Whether one was removed.
	 */
	public static function delete( int $user_id, string $id ): bool {
		$all  = self::all( $user_id );
		$kept = array_values( array_filter( $all, static fn( array $k ) => $k['id'] !== $id ) );
		if ( count( $kept ) === count( $all ) ) {
			return false;
		}
		update_user_meta( $user_id, self::META, $kept );
		delete_user_meta( $user_id, self::ID_META, $id );
		return true;
	}

	/**
	 * The options the browser needs to sign in with a passkey: a fresh challenge under a session
	 * the browser hands back with the answer, and the site as the relying party. With an email,
	 * that user's passkeys are named; without one, any passkey for the site may answer, which is
	 * what the email field's own suggestion (conditional UI) uses.
	 *
	 * @param string $email The email typed, or empty.
	 * @return array `session` and `publicKey`, as navigator.credentials.get() takes the latter.
	 */
	public static function request_options( string $email = '' ): array {
		$session   = self::b64( random_bytes( 24 ) );
		$challenge = self::b64( random_bytes( 32 ) );
		set_transient( 'riff_signin_asr_' . $session, $challenge, self::TTL );
		$allow = array();
		$user  = '' !== $email ? get_user_by( 'email', $email ) : false;
		if ( $user instanceof WP_User ) {
			foreach ( self::all( $user->ID ) as $key ) {
				$allow[] = array(
					'type'       => 'public-key',
					'id'         => $key['id'],
					'transports' => $key['transports'] ?? array(),
				);
			}
		}
		return array(
			'session'   => $session,
			'publicKey' => array(
				'challenge'        => $challenge,
				'rpId'             => self::rp_id(),
				'allowCredentials' => $allow,
				'userVerification' => 'preferred',
				'timeout'          => 120000,
			),
		);
	}

	/**
	 * Checks a passkey's answer and says whose it is.
	 *
	 * @param string $session    The session the options were made under.
	 * @param array  $credential What navigator.credentials.get() returned: id, response
	 *                           { clientDataJSON, authenticatorData, signature, userHandle }, as base64url.
	 * @return WP_User|WP_Error The user the passkey belongs to.
	 */
	public static function verify( string $session, array $credential ) {
		$challenge = (string) get_transient( 'riff_signin_asr_' . $session );
		delete_transient( 'riff_signin_asr_' . $session );
		if ( '' === $challenge ) {
			return new WP_Error( 'riff_sign_in_expired', __( 'That took too long. Try again.', 'riff-sign-in' ) );
		}
		$id = (string) ( $credential['id'] ?? '' );
		// phpcs:disable WordPress.DB.SlowDBQuery -- one row, by a unique ID.
		$users = get_users(
			array(
				'meta_key'   => self::ID_META,
				'meta_value' => $id,
				'number'     => 1,
			)
		);
		// phpcs:enable // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- one row, by a unique ID.
		$user = $users ? $users[0] : null;
		$keys = $user ? array_filter( self::all( $user->ID ), static fn( array $k ) => $k['id'] === $id ) : array();
		$key  = $keys ? reset( $keys ) : null;
		if ( ! $user instanceof WP_User || ! $key ) {
			return new WP_Error( 'riff_sign_in_unknown', __( 'That passkey is not for an account on this site.', 'riff-sign-in' ) );
		}
		$handle = (string) ( $credential['response']['userHandle'] ?? '' );
		if ( '' !== $handle && ! hash_equals( self::handle( $user->ID ), $handle ) ) {
			return new WP_Error( 'riff_sign_in_invalid', __( 'That passkey could not be checked.', 'riff-sign-in' ) );
		}
		$client = self::client_data( $credential['response']['clientDataJSON'] ?? '', 'webauthn.get', $challenge );
		if ( is_wp_error( $client ) ) {
			return $client;
		}
		$auth_bytes = self::unb64( (string) ( $credential['response']['authenticatorData'] ?? '' ) );
		try {
			$auth = self::auth_data( $auth_bytes, false );
		} catch ( \RuntimeException $e ) {
			return new WP_Error( 'riff_sign_in_invalid', __( 'That passkey could not be checked.', 'riff-sign-in' ) );
		}
		if ( is_wp_error( $auth ) ) {
			return $auth;
		}
		$signed    = $auth_bytes . hash( 'sha256', self::unb64( (string) $credential['response']['clientDataJSON'] ), true );
		$signature = self::unb64( (string) ( $credential['response']['signature'] ?? '' ) );
		$public    = openssl_pkey_get_public( $key['key'] );
		if ( false === $public || 1 !== openssl_verify( $signed, $signature, $public, OPENSSL_ALGO_SHA256 ) ) {
			return new WP_Error( 'riff_sign_in_invalid', __( 'That passkey could not be checked.', 'riff-sign-in' ) );
		}
		// A counter that did not move on an authenticator that counts is a cloned key.
		if ( ( $auth['counter'] > 0 || $key['counter'] > 0 ) && $auth['counter'] <= $key['counter'] ) {
			return new WP_Error( 'riff_sign_in_invalid', __( 'That passkey could not be checked.', 'riff-sign-in' ) );
		}
		$all = array_map(
			static function ( array $k ) use ( $id, $auth ) {
				if ( $k['id'] === $id ) {
					$k['counter'] = $auth['counter'];
					$k['used']    = time();
				}
				return $k;
			},
			self::all( $user->ID )
		);
		update_user_meta( $user->ID, self::META, $all );
		return $user;
	}

	/**
	 * Reads and checks the client data: its type, that it answers this challenge, and that it
	 * came from this site.
	 *
	 * @param string $encoded   clientDataJSON, base64url.
	 * @param string $type      `webauthn.create` or `webauthn.get`.
	 * @param string $challenge The challenge given, base64url.
	 * @return array|WP_Error The client data.
	 */
	private static function client_data( string $encoded, string $type, string $challenge ) {
		$data = json_decode( self::unb64( $encoded ), true );
		if ( ! is_array( $data ) || ( $data['type'] ?? '' ) !== $type ) {
			return new WP_Error( 'riff_sign_in_invalid', __( 'That passkey could not be checked.', 'riff-sign-in' ) );
		}
		if ( ! hash_equals( $challenge, (string) ( $data['challenge'] ?? '' ) ) ) {
			return new WP_Error( 'riff_sign_in_invalid', __( 'That passkey could not be checked.', 'riff-sign-in' ) );
		}
		if ( ! hash_equals( self::origin(), (string) ( $data['origin'] ?? '' ) ) ) {
			return new WP_Error( 'riff_sign_in_origin', __( 'That passkey answered for another site.', 'riff-sign-in' ) );
		}
		return $data;
	}

	/**
	 * Takes the authenticator data apart: the relying party's hash, the flags, the counter, and
	 * on registration the credential and its key.
	 *
	 * @param string $bytes      The authenticator data.
	 * @param bool   $credential Whether to expect attested credential data, as a registration has.
	 * @return array|WP_Error counter, and on registration credential_id, key (PEM) and alg.
	 * @throws \RuntimeException On bytes that end early or a key that cannot be read.
	 */
	private static function auth_data( string $bytes, bool $credential ) {
		if ( strlen( $bytes ) < 37 ) {
			throw new \RuntimeException( 'authenticator data ends early' );
		}
		if ( ! hash_equals( hash( 'sha256', self::rp_id(), true ), substr( $bytes, 0, 32 ) ) ) {
			return new WP_Error( 'riff_sign_in_origin', __( 'That passkey answered for another site.', 'riff-sign-in' ) );
		}
		$flags = ord( $bytes[32] );
		if ( ! ( $flags & 0x01 ) ) {
			return new WP_Error( 'riff_sign_in_presence', __( 'The passkey was not confirmed on the device.', 'riff-sign-in' ) );
		}
		$counter = unpack( 'N', substr( $bytes, 33, 4 ) )[1];
		$out     = array( 'counter' => (int) $counter );
		if ( ! $credential ) {
			return $out;
		}
		if ( ! ( $flags & 0x40 ) || strlen( $bytes ) < 55 ) {
			throw new \RuntimeException( 'no attested credential data' );
		}
		$length = unpack( 'n', substr( $bytes, 53, 2 ) )[1];
		if ( $length < 16 || $length > 1023 || strlen( $bytes ) < 55 + $length ) {
			throw new \RuntimeException( 'credential ID out of range' );
		}
		$out['credential_id']        = substr( $bytes, 55, $length );
		$cose                        = Cbor::decode( substr( $bytes, 55 + $length ) );
		[ $out['key'], $out['alg'] ] = self::pem( is_array( $cose ) ? $cose : array() );
		return $out;
	}

	/**
	 * A COSE key as PEM, for OpenSSL: an EC2 key on P-256 (ES256), or an RSA key (RS256).
	 *
	 * @param array $cose The COSE key, as a map of integer labels.
	 * @return array The PEM, and the COSE algorithm.
	 * @throws \RuntimeException On any other key.
	 */
	public static function pem( array $cose ): array {
		$kty = $cose[1] ?? null;
		$alg = (int) ( $cose[3] ?? 0 );
		if ( 2 === $kty && -7 === $alg && 1 === ( $cose[-1] ?? null ) && is_string( $cose[-2] ?? null ) && is_string( $cose[-3] ?? null ) && 32 === strlen( $cose[-2] ) && 32 === strlen( $cose[-3] ) ) {
			// SubjectPublicKeyInfo for ecPublicKey on prime256v1, the point uncompressed.
			$der = "\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00\x04" . $cose[-2] . $cose[-3];
			return array( self::to_pem( $der ), -7 );
		}
		if ( 3 === $kty && -257 === $alg && is_string( $cose[-1] ?? null ) && is_string( $cose[-2] ?? null ) ) {
			$n   = self::der( "\x02", ( ord( $cose[-1][0] ) & 0x80 ) ? "\x00" . $cose[-1] : $cose[-1] );
			$e   = self::der( "\x02", ( ord( $cose[-2][0] ) & 0x80 ) ? "\x00" . $cose[-2] : $cose[-2] );
			$key = self::der( "\x30", $n . $e );
			$der = self::der( "\x30", "\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00" . self::der( "\x03", "\x00" . $key ) );
			return array( self::to_pem( $der ), -257 );
		}
		throw new \RuntimeException( 'unsupported key' );
	}

	/**
	 * One DER element.
	 *
	 * @param string $tag     The tag byte.
	 * @param string $content The content.
	 * @return string
	 */
	private static function der( string $tag, string $content ): string {
		$length = strlen( $content );
		if ( $length < 128 ) {
			return $tag . chr( $length ) . $content;
		}
		$bytes = ltrim( pack( 'N', $length ), "\0" );
		return $tag . chr( 0x80 | strlen( $bytes ) ) . $bytes . $content;
	}

	/**
	 * DER as PEM.
	 *
	 * @param string $der The DER.
	 * @return string
	 */
	private static function to_pem( string $der ): string {
		return "-----BEGIN PUBLIC KEY-----\n" . chunk_split( base64_encode( $der ), 64, "\n" ) . "-----END PUBLIC KEY-----\n"; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- PEM is base64 by definition.
	}

	/**
	 * Base64url, as WebAuthn passes bytes.
	 *
	 * @param string $bytes Bytes.
	 * @return string
	 */
	public static function b64( string $bytes ): string {
		return rtrim( strtr( base64_encode( $bytes ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- the encoding WebAuthn uses.
	}

	/**
	 * Bytes from base64url.
	 *
	 * @param string $encoded Base64url.
	 * @return string
	 */
	public static function unb64( string $encoded ): string {
		$decoded = base64_decode( strtr( $encoded, '-_', '+/' ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- the encoding WebAuthn uses.
		return false === $decoded ? '' : $decoded;
	}
}

// phpcs:set WordPress.WP.I18n text_domain[] riff
