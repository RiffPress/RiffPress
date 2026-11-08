<?php
/**
 * The passkey routes a signed-in listener manages their own keys through: who may, and whose.
 *
 * @package Riff_Sign_In
 */

use Riff\SignIn\Passkeys;
use Riff\SignIn\Routes;
use Riff\SignIn\Sign_In;

/**
 * Routes: GET and POST /passkeys, POST /passkeys/options, DELETE /passkeys/{id}.
 */
class Test_Riff_Sign_In_Passkey_Routes extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		Sign_In::register();
	}

	/**
	 * A passkey stored for a user, as Passkeys::create() stores one.
	 *
	 * @param int    $user User ID.
	 * @param string $id   Credential ID.
	 */
	private static function key_for( int $user, string $id ): void {
		update_user_meta(
			$user,
			Passkeys::META,
			array(
				array(
					'id'      => $id,
					'key'     => 'a-public-key',
					'alg'     => -7,
					'counter' => 0,
					'name'    => 'Phone',
					'created' => time(),
				),
			)
		);
		add_user_meta( $user, Passkeys::ID_META, $id );
	}

	/**
	 * A request to one of the routes.
	 *
	 * @param string $method Method.
	 * @param string $path   Path under the namespace.
	 * @param array  $body   The request's body.
	 * @return WP_REST_Response
	 */
	private static function ask( string $method, string $path, array $body = array() ): WP_REST_Response {
		$request = new WP_REST_Request( $method, '/' . Routes::NAMESPACE . $path );
		$request->set_body_params( $body );
		return rest_do_request( $request );
	}

	public function test_a_visitor_is_refused_every_route_that_manages_keys(): void {
		$owner = self::factory()->user->create();
		self::key_for( $owner, 'abc_123' );
		wp_set_current_user( 0 );

		// A well-formed new key, so it is who asks that is refused, not the request's shape.
		$credential = array(
			'credential' => array(
				'id'       => 'new_key',
				'response' => array( 'clientDataJSON' => 'e30' ),
			),
		);
		foreach ( array( array( 'GET', '/passkeys', array() ), array( 'POST', '/passkeys', $credential ), array( 'POST', '/passkeys/options', array() ), array( 'DELETE', '/passkeys/abc_123', array() ) ) as [ $method, $path, $body ] ) {
			$response = self::ask( $method, $path, $body );
			$this->assertSame( 401, $response->get_status(), "$method $path" );
			$this->assertSame( 'rest_not_logged_in', $response->as_error()->get_error_code(), "$method $path" );
		}
		$this->assertCount( 1, Passkeys::all( $owner ), 'the key is where it was' );
	}

	public function test_a_listener_removes_only_their_own_key(): void {
		$owner = self::factory()->user->create();
		$other = self::factory()->user->create();
		self::key_for( $owner, 'abc_123' );
		self::key_for( $other, 'xyz_789' );

		wp_set_current_user( $other );
		$this->assertSame( 404, self::ask( 'DELETE', '/passkeys/abc_123' )->get_status(), 'someone else\'s key is not found, not removed' );
		$this->assertCount( 1, Passkeys::all( $owner ) );
		$this->assertSame( array( 'abc_123' ), get_user_meta( $owner, Passkeys::ID_META, false ) );

		$this->assertSame( 200, self::ask( 'DELETE', '/passkeys/xyz_789' )->get_status() );
		$this->assertSame( array(), Passkeys::all( $other ) );
		$this->assertSame( array(), get_user_meta( $other, Passkeys::ID_META, false ), 'and the index of credentials with it' );
	}

	public function test_the_list_holds_only_the_listeners_own_keys(): void {
		$owner = self::factory()->user->create();
		self::key_for( $owner, 'abc_123' );
		self::key_for( self::factory()->user->create(), 'xyz_789' );
		wp_set_current_user( $owner );

		$ids = wp_list_pluck( (array) ( self::ask( 'GET', '/passkeys' )->get_data()['items'] ?? array() ), 'id' );
		$this->assertSame( array( 'abc_123' ), array_values( $ids ) );
	}
}
