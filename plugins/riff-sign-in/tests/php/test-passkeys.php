<?php
/**
 * Riff Sign In: passkeys.
 *
 * @package Riff\SignIn
 */

use Riff\SignIn\Cbor;
use Riff\SignIn\Passkeys;
use Riff\SignIn\Sign_In;

/**
 * Passkeys made and checked, with a real key pair from OpenSSL standing in for an authenticator.
 */
class Test_Riff_Sign_In_Passkeys extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		Sign_In::register();
	}

	/**
	 * CBOR for a small map, array, strings and integers, by hand.
	 *
	 * @return string
	 */
	private static function cbor_map( array $map ): string {
		$out = chr( 0xa0 + count( $map ) );
		foreach ( $map as $key => $value ) {
			$out .= self::cbor_value( $key ) . self::cbor_value( $value );
		}
		return $out;
	}

	private static function cbor_value( $value ): string {
		if ( is_int( $value ) ) {
			$major = $value < 0 ? 0x20 : 0x00;
			$value = $value < 0 ? -1 - $value : $value;
			if ( $value < 24 ) {
				return chr( $major | $value );
			}
			if ( $value < 256 ) {
				return chr( $major | 24 ) . chr( $value );
			}
			return chr( $major | 25 ) . pack( 'n', $value );
		}
		if ( is_string( $value ) ) {
			$length = strlen( $value );
			$head   = $length < 24 ? chr( 0x40 | $length ) : ( $length < 256 ? chr( 0x58 ) . chr( $length ) : chr( 0x59 ) . pack( 'n', $length ) );
			return $head . $value;
		}
		if ( is_array( $value ) ) {
			return self::cbor_map( $value );
		}
		throw new InvalidArgumentException( 'unsupported' );
	}

	/**
	 * An EC P-256 key pair, and its COSE public key.
	 *
	 * @return array{0: OpenSSLAsymmetricKey, 1: array}
	 */
	private static function key_pair(): array {
		$pair    = openssl_pkey_new( array( 'curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$details = openssl_pkey_get_details( $pair );
		$x       = str_pad( $details['ec']['x'], 32, "\0", STR_PAD_LEFT );
		$y       = str_pad( $details['ec']['y'], 32, "\0", STR_PAD_LEFT );
		return array(
			$pair,
			array(
				1  => 2,
				3  => -7,
				-1 => 1,
				-2 => $x,
				-3 => $y,
			),
		);
	}

	/**
	 * Authenticator data as a registration carries it.
	 */
	private static function auth_data( string $credential_id, array $cose, int $counter = 0, int $flags = 0x41 ): string {
		return hash( 'sha256', Passkeys::rp_id(), true ) . chr( $flags ) . pack( 'N', $counter ) . str_repeat( "\0", 16 ) . pack( 'n', strlen( $credential_id ) ) . $credential_id . self::cbor_map( $cose );
	}

	private static function client_data( string $type, string $challenge, string $origin = '' ): string {
		return Passkeys::b64( (string) wp_json_encode( array( 'type' => $type, 'challenge' => $challenge, 'origin' => '' !== $origin ? $origin : Passkeys::origin() ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
	}

	public function test_the_cbor_decoder_reads_what_webauthn_sends_and_refuses_the_rest(): void {
		$bytes = self::cbor_map( array( 'fmt' => 'none', 'attStmt' => array(), 'n' => 300, 'neg' => -5, 1 => 'one' ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$used  = 0;
		$this->assertSame( array( 'fmt' => 'none', 'attStmt' => array(), 'n' => 300, 'neg' => -5, 1 => 'one' ), Cbor::decode( $bytes, $used ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$this->assertSame( strlen( $bytes ), $used );
		$this->assertSame( array( 1, 2, 'x' ), Cbor::decode( "\x83\x01\x02\x61x" ) );
		$this->assertTrue( Cbor::decode( "\xf5" ) );
		$this->assertNull( Cbor::decode( "\xf6" ) );
		foreach ( array( "\x5f", "\x58\x05ab", "\xc0\x00", "\xa1\xf5\x01", '' ) as $bad ) {
			try {
				Cbor::decode( $bad );
				$this->fail( 'accepted ' . bin2hex( $bad ) );
			} catch ( RuntimeException $e ) {
				$this->assertNotEmpty( $e->getMessage() );
			}
		}
	}

	public function test_a_cose_key_becomes_pem_openssl_reads(): void {
		[ $pair, $cose ] = self::key_pair();
		[ $pem, $alg ]   = Passkeys::pem( $cose );
		$this->assertSame( -7, $alg );
		$this->assertSame( openssl_pkey_get_details( $pair )['key'], $pem, 'the same key OpenSSL would export' );

		$rsa           = openssl_pkey_new( array( 'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$details       = openssl_pkey_get_details( $rsa );
		[ $pem, $alg ] = Passkeys::pem( array( 1 => 3, 3 => -257, -1 => $details['rsa']['n'], -2 => $details['rsa']['e'] ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$this->assertSame( -257, $alg );
		$this->assertSame( $details['key'], $pem );

		$this->expectException( RuntimeException::class );
		Passkeys::pem(
			array(
				1 => 2,
				3 => -8,
			)
		);
	}

	public function test_a_passkey_is_made_checked_and_signs_in(): void {
		$user = self::factory()->user->create_and_get( array( 'user_email' => 'key@example.com' ) );
		wp_set_current_user( $user->ID );
		[ $pair, $cose ] = self::key_pair();
		$options         = Passkeys::creation_options( $user );
		$this->assertSame( Passkeys::rp_id(), $options['rp']['id'] );
		$this->assertSame( 'required', $options['authenticatorSelection']['residentKey'], 'a resident key, so the browser can offer it from the email field' );
		$this->assertSame( 'none', $options['attestation'] );
		$this->assertSame( Passkeys::handle( $user->ID ), $options['user']['id'], 'the user by a handle, not their ID' );
		$this->assertNotSame( (string) $user->ID, Passkeys::unb64( $options['user']['id'] ) );

		$credential_id = random_bytes( 32 );
		$attestation   = self::cbor_map( array( 'fmt' => 'none', 'attStmt' => array(), 'authData' => self::auth_data( $credential_id, $cose ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$made          = Passkeys::create(
			$user,
			array(
				'id'       => Passkeys::b64( $credential_id ),
				'response' => array(
					'clientDataJSON'    => self::client_data( 'webauthn.create', $options['challenge'] ),
					'attestationObject' => Passkeys::b64( $attestation ),
					'transports'        => array( 'internal', 'hybrid' ),
				),
			),
			'My phone'
		);
		$this->assertIsArray( $made );
		$this->assertSame( 'My phone', $made['name'] );
		$this->assertCount( 1, Passkeys::all( $user->ID ) );
		$this->assertSame( array( 'internal', 'hybrid' ), Passkeys::all( $user->ID )[0]['transports'] );
		$this->assertWPError( Passkeys::create( $user, array(), '' ), 'a challenge works once' );

		// Signing in with it, as a visitor, with no email: the passkey says whose it is.
		wp_set_current_user( 0 );
		$options = Passkeys::request_options();
		$this->assertSame( array(), $options['publicKey']['allowCredentials'], 'any passkey for the site may answer' );
		$named = Passkeys::request_options( 'key@example.com' );
		$this->assertSame( Passkeys::b64( $credential_id ), $named['publicKey']['allowCredentials'][0]['id'] );
		$auth   = hash( 'sha256', Passkeys::rp_id(), true ) . "\x05" . pack( 'N', 7 );
		$client = self::client_data( 'webauthn.get', $options['publicKey']['challenge'] );
		openssl_sign( $auth . hash( 'sha256', Passkeys::unb64( $client ), true ), $signature, $pair, OPENSSL_ALGO_SHA256 );
		$answer = array(
			'id'       => Passkeys::b64( $credential_id ),
			'response' => array(
				'clientDataJSON'    => $client,
				'authenticatorData' => Passkeys::b64( $auth ),
				'signature'         => Passkeys::b64( $signature ),
				'userHandle'        => Passkeys::handle( $user->ID ),
			),
		);
		$who    = Passkeys::verify( $options['session'], $answer );
		$this->assertInstanceOf( WP_User::class, $who );
		$this->assertSame( $user->ID, $who->ID );
		$this->assertSame( 7, Passkeys::all( $user->ID )[0]['counter'] );
		$this->assertSame( 'riff_sign_in_expired', Passkeys::verify( $options['session'], $answer )->get_error_code(), 'a session works once' );

		// The same answer again, with a fresh challenge: the counter did not move, so it is refused.
		$replay = Passkeys::request_options();
		$client = self::client_data( 'webauthn.get', $replay['publicKey']['challenge'] );
		openssl_sign( $auth . hash( 'sha256', Passkeys::unb64( $client ), true ), $signature, $pair, OPENSSL_ALGO_SHA256 );
		$answer['response']['clientDataJSON'] = $client;
		$answer['response']['signature']      = Passkeys::b64( $signature );
		$this->assertSame( 'riff_sign_in_invalid', Passkeys::verify( $replay['session'], $answer )->get_error_code() );

		// A signature by another key, another origin, and the wrong challenge are each refused.
		[ $other ] = self::key_pair();
		$fresh     = Passkeys::request_options();
		$auth      = hash( 'sha256', Passkeys::rp_id(), true ) . "\x05" . pack( 'N', 8 );
		$client    = self::client_data( 'webauthn.get', $fresh['publicKey']['challenge'] );
		openssl_sign( $auth . hash( 'sha256', Passkeys::unb64( $client ), true ), $forged, $other, OPENSSL_ALGO_SHA256 );
		$answer['response']['authenticatorData'] = Passkeys::b64( $auth );
		$answer['response']['clientDataJSON']    = $client;
		$answer['response']['signature']         = Passkeys::b64( $forged );
		$this->assertSame( 'riff_sign_in_invalid', Passkeys::verify( $fresh['session'], $answer )->get_error_code() );
		$fresh                                = Passkeys::request_options();
		$answer['response']['clientDataJSON'] = self::client_data( 'webauthn.get', $fresh['publicKey']['challenge'], 'https://evil.example' );
		$this->assertSame( 'riff_sign_in_origin', Passkeys::verify( $fresh['session'], $answer )->get_error_code() );
		$fresh                                = Passkeys::request_options();
		$answer['response']['clientDataJSON'] = self::client_data( 'webauthn.get', 'not-the-challenge' );
		$this->assertSame( 'riff_sign_in_invalid', Passkeys::verify( $fresh['session'], $answer )->get_error_code() );

		// Good again, through the route, which sets the cookie; then removed from the profile.
		do_action( 'rest_api_init' );
		$fresh  = Passkeys::request_options();
		$client = self::client_data( 'webauthn.get', $fresh['publicKey']['challenge'] );
		$auth   = hash( 'sha256', Passkeys::rp_id(), true ) . "\x05" . pack( 'N', 9 );
		openssl_sign( $auth . hash( 'sha256', Passkeys::unb64( $client ), true ), $signature, $pair, OPENSSL_ALGO_SHA256 );
		$answer['response']['authenticatorData'] = Passkeys::b64( $auth );
		$answer['response']['clientDataJSON']    = $client;
		$answer['response']['signature']         = Passkeys::b64( $signature );
		$request                                 = new WP_REST_Request( 'POST', '/riff-sign-in/v1/assertion' );
		$request->set_body_params( array( 'session' => $fresh['session'], 'credential' => $answer ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$response = rest_do_request( $request );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( $user->ID, get_current_user_id() );
		$this->assertTrue( Passkeys::delete( $user->ID, Passkeys::b64( $credential_id ) ) );
		$this->assertSame( array(), Passkeys::all( $user->ID ) );
		$this->assertFalse( Passkeys::delete( $user->ID, 'gone' ) );
	}

	public function test_a_registration_for_another_site_or_without_a_touch_is_refused(): void {
		$user       = self::factory()->user->create_and_get( array( 'user_email' => 'else@example.com' ) );
		[ , $cose ] = self::key_pair();
		$attempt    = function ( string $type, string $origin, int $flags ) use ( $user, $cose ) {
			$options = Passkeys::creation_options( $user );
			$object  = self::cbor_map( array( 'fmt' => 'none', 'attStmt' => array(), 'authData' => self::auth_data( random_bytes( 16 ), $cose, 0, $flags ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
			return Passkeys::create( $user, array( 'id' => 'x', 'response' => array( 'clientDataJSON' => self::client_data( $type, $options['challenge'], $origin ), 'attestationObject' => Passkeys::b64( $object ) ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		};
		$this->assertSame( 'riff_sign_in_origin', $attempt( 'webauthn.create', 'https://evil.example', 0x41 )->get_error_code() );
		$this->assertSame( 'riff_sign_in_invalid', $attempt( 'webauthn.get', '', 0x41 )->get_error_code(), 'the wrong ceremony' );
		$this->assertSame( 'riff_sign_in_presence', $attempt( 'webauthn.create', '', 0x40 )->get_error_code(), 'nobody touched the device' );
		$this->assertSame( 'riff_sign_in_invalid', $attempt( 'webauthn.create', '', 0x01 )->get_error_code(), 'no credential in the data' );
		$this->assertSame( array(), Passkeys::all( $user->ID ) );
	}

	public function test_passkeys_are_exported_erased_and_shown_on_the_profile(): void {
		$user = self::factory()->user->create_and_get( array( 'user_email' => 'privacy@example.com' ) );
		update_user_meta( $user->ID, Passkeys::META, array( array( 'id' => 'abc', 'key' => 'k', 'alg' => -7, 'counter' => 0, 'created' => 1700000000, 'name' => 'Laptop', 'transports' => array() ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		add_user_meta( $user->ID, Passkeys::ID_META, 'abc' );
		$export = Sign_In::export( 'privacy@example.com' );
		$this->assertStringContainsString( 'Laptop', $export['data'][0]['data'][0]['value'] );
		ob_start();
		Sign_In::profile( $user );
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'Laptop', $html );
		$this->assertStringContainsString( 'data-riff-signin-delete="abc"', $html );
		$this->assertTrue( Sign_In::erase( 'privacy@example.com' )['items_removed'] );
		$this->assertSame( array(), Passkeys::all( $user->ID ) );
		$this->assertSame( array(), get_user_meta( $user->ID, Passkeys::ID_META, false ) );
	}
}
