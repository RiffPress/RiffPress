<?php
/**
 * Riff Sign In: email codes.
 *
 * @package Riff\SignIn
 */

use Riff\SignIn\Codes;
use Riff\SignIn\Sign_In;

/**
 * Codes sent to an address, and what they open.
 */
class Test_Riff_Sign_In_Codes extends Riff_TestCase {

	/**
	 * What was mailed: [ email, code, link ] for each code made.
	 *
	 * @var array[]
	 */
	private array $sent = array();

	public function set_up(): void {
		parent::set_up();
		Sign_In::register();
		add_action( 'riff_sign_in_code', array( $this, 'record' ), 10, 3 );
		add_filter( 'riff_sign_in_send', '__return_false' );
		$_SERVER['REMOTE_ADDR'] = '203.0.113.' . wp_rand( 1, 254 );
	}

	public function record( string $email, string $code, string $link ): void {
		$this->sent[] = array( $email, $code, $link );
	}

	/**
	 * Opens or closes registration where the site keeps it: "Anyone can register" on a single
	 * site, and the network's registration setting on a network, which WordPress reads in its
	 * place.
	 *
	 * @param bool $open Whether anyone may register.
	 */
	private function registration( bool $open ): void {
		if ( is_multisite() ) {
			update_site_option( 'registration', $open ? 'user' : 'none' );
		} else {
			update_option( 'users_can_register', $open ? 1 : 0 );
		}
	}

	public function test_a_code_signs_an_existing_user_in_and_a_wrong_one_does_not(): void {
		$user = self::factory()->user->create( array( 'user_email' => 'ella@example.com', 'role' => 'subscriber' ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$sent = Codes::request( 'ella@example.com', home_url( '/listen/' ) );
		$this->assertIsArray( $sent );
		$this->assertCount( 1, $this->sent, 'one email, to the address' );
		[ $to, $code, $link ] = $this->sent[0];
		$this->assertSame( 'ella@example.com', $to );
		$this->assertMatchesRegularExpression( '/^\d{6}$/', $code );
		$this->assertStringContainsString( Codes::QUERY . '=' . $sent['token'] . '.' . $code, $link, 'the link carries the token and the code' );

		$wrong = Codes::verify( $sent['token'], '000000' === $code ? '111111' : '000000' );
		$this->assertWPError( $wrong );
		$this->assertSame( 'riff_sign_in_wrong', $wrong->get_error_code() );
		$this->assertSame( 0, get_current_user_id() );

		$this->assertSame( $user, Codes::verify( $sent['token'], ' ' . substr( $code, 0, 3 ) . ' ' . substr( $code, 3 ) )->ID, 'spaces from a paste are fine' );
		$this->assertSame( $user, get_current_user_id(), 'and the listener is signed in' );
		$this->assertWPError( Codes::verify( $sent['token'], $code ), 'a code works once' );
	}

	public function test_five_wrong_tries_end_a_code(): void {
		self::factory()->user->create( array( 'user_email' => 'duke@example.com' ) );
		$token = Codes::request( 'duke@example.com' )['token'];
		$code  = $this->sent[0][1];
		for ( $i = 0; $i < Codes::TRIES; $i++ ) {
			$this->assertSame( 'riff_sign_in_wrong', Codes::verify( $token, '999999' === $code ? '000000' : '999999' )->get_error_code() );
		}
		$this->assertSame( 'riff_sign_in_tries', Codes::verify( $token, $code )->get_error_code(), 'even the right one, after five wrong' );
	}

	public function test_an_unknown_address_gets_the_same_answer_and_no_email_while_registration_is_closed(): void {
		$this->registration( false );
		$sent = Codes::request( 'nobody@example.com' );
		$this->assertIsArray( $sent, 'the answer says nothing about who has an account' );
		$this->assertSame( array(), $this->sent, 'nothing is mailed where nobody can sign in' );
		$this->assertSame( 'riff_sign_in_wrong', Codes::verify( $sent['token'], '123456' )->get_error_code() );
	}

	public function test_with_registration_open_a_new_address_becomes_a_user_when_its_code_comes_back(): void {
		$this->registration( true );
		update_option( 'default_role', 'subscriber' );
		$sent = Codes::request( 'new.listener@example.com' );
		$this->assertCount( 1, $this->sent );
		$this->assertFalse( get_user_by( 'email', 'new.listener@example.com' ), 'not until the code comes back' );
		$made = array();
		add_action(
			'riff_sign_in_registered',
			static function ( $user ) use ( &$made ) {
				$made[] = $user->ID;
			}
		); // phpcs:ignore Generic.Functions.OpeningFunctionBraceKernighanRitchie.ContentAfterBrace, Squiz.Functions.MultiLineFunctionDeclaration.ContentAfterBrace
		$user = Codes::verify( $sent['token'], $this->sent[0][1] );
		$this->assertInstanceOf( WP_User::class, $user );
		$this->assertSame( 'new.listener@example.com', $user->user_email );
		$this->assertSame( 'new.listener', $user->user_login, 'named after the address' );
		$this->assertContains( 'subscriber', $user->roles );
		$this->assertSame( array( $user->ID ), $made );
		$this->assertSame( $user->ID, get_current_user_id() );

		wp_set_current_user( 0 );
		$again = Codes::request( 'new.listener@example.org' );
		$this->assertSame( 'new.listener2', Codes::verify( $again['token'], $this->sent[1][1] )->user_login, 'a taken name is numbered' );
	}

	public function test_codes_are_limited_per_address_and_per_network_address(): void {
		self::factory()->user->create( array( 'user_email' => 'count@example.com' ) );
		for ( $i = 0; $i < Codes::PER_EMAIL; $i++ ) {
			$this->assertIsArray( Codes::request( 'count@example.com' ) );
		}
		$limited = Codes::request( 'count@example.com' );
		$this->assertWPError( $limited );
		$this->assertSame( 429, $limited->get_error_data()['status'] );
		$this->assertSame( 'riff_sign_in_email', Codes::request( 'not an address' )->get_error_code() );

		$_SERVER['REMOTE_ADDR'] = '198.51.100.7';
		for ( $i = 0; $i < Codes::PER_IP; $i++ ) {
			$this->assertIsArray( Codes::request( "many$i@example.com" ), "request $i" );
		}
		$this->assertSame( 'riff_sign_in_limit', Codes::request( 'onemore@example.com' )->get_error_code() );
	}

	public function test_the_link_in_the_email_signs_in_and_lands_where_the_code_was_asked_from(): void {
		$user = self::factory()->user->create( array( 'user_email' => 'link@example.com' ) );
		$sent = Codes::request( 'link@example.com', home_url( '/listen/?riff_view=albums' ) );
		$this->assertSame( home_url( '/listen/?riff_view=albums' ), Codes::landing( $sent['token'] ) );
		$this->assertSame( home_url( '/' ), Codes::landing( 'nonsense' ) );
		$outside = Codes::request( 'link@example.com', 'https://evil.example/' );
		$this->assertSame( home_url( '/' ), Codes::landing( $outside['token'] ), 'only this site' );

		$_GET[ Codes::QUERY ] = $sent['token'] . '.' . $this->sent[0][1];
		$redirected           = '';
		// The redirect is where the request ends, so it is stopped there, before the exit after it.
		add_filter(
			'wp_redirect',
			static function ( $to ) use ( &$redirected ) {
				$redirected = $to;
				throw new RuntimeException( 'redirected' );
			}
		);
		try {
			Sign_In::link();
			$this->fail( 'the link redirects' );
		} catch ( RuntimeException $e ) {
			$this->assertSame( 'redirected', $e->getMessage() );
		} finally {
			unset( $_GET[ Codes::QUERY ] );
		}
		$this->assertSame( home_url( '/listen/?riff_view=albums' ), $redirected );
		$this->assertSame( $user, get_current_user_id() );
	}

	public function test_the_routes_answer_as_the_sheet_asks(): void {
		do_action( 'rest_api_init' );
		$user    = self::factory()->user->create( array( 'user_email' => 'rest@example.com' ) );
		$request = new WP_REST_Request( 'POST', '/riff-sign-in/v1/code' );
		$request->set_body_params( array( 'email' => 'rest@example.com' ) );
		$response = rest_do_request( $request );
		$this->assertSame( 200, $response->get_status() );
		$token = $response->get_data()['token'];

		$verify = new WP_REST_Request( 'POST', '/riff-sign-in/v1/code/verify' );
		$verify->set_body_params( array( 'token' => $token, 'code' => 'nope' ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$this->assertSame( 400, rest_do_request( $verify )->get_status() );
		$verify->set_body_params( array( 'token' => $token, 'code' => $this->sent[0][1] ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$response = rest_do_request( $verify );
		$this->assertSame( 200, $response->get_status() );
		$this->assertTrue( $response->get_data()['signedIn'] );
		$this->assertSame( 0, $response->get_data()['passkeys'] );
		$this->assertNotEmpty( $response->get_data()['nonce'] );
		$this->assertSame( $user, get_current_user_id() );
		$this->assertSame( 400, rest_do_request( $request )->get_status(), 'signed in already' );
	}

	public function test_the_sheet_loads_with_the_player_and_not_for_the_signed_in(): void {
		do_action( 'riff_before_player' );
		$this->assertTrue( wp_script_is( 'riff-sign-in', 'enqueued' ) );
		$this->assertContains( 'riff-tokens', wp_styles()->registered['riff-sign-in']->deps, 'styled in Riff\'s tokens' );
		$this->assertStringContainsString( '"signedIn":false', wp_scripts()->get_data( 'riff-sign-in', 'before' )[1] ?? '' );
		$this->assertStringContainsString( 'riff-sign-in/v1/', wp_scripts()->get_data( 'riff-sign-in', 'before' )[1] ?? '' );
	}

	public function test_site_health_recommends_a_mail_service_when_nothing_delivers(): void {
		$this->assertSame( 'recommended', Sign_In::health()['status'] );
		add_filter( 'pre_wp_mail', '__return_null' );
		$this->assertSame( 'good', Sign_In::health()['status'] );
	}
}
