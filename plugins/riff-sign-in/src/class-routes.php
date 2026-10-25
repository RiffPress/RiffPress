<?php
/**
 * The REST routes the sheet talks to.
 *
 * @package Riff\SignIn
 */

namespace Riff\SignIn;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

// phpcs:set WordPress.WP.I18n text_domain[] riff-sign-in

defined( 'ABSPATH' ) || exit;

/**
 * The riff-sign-in/v1 routes: a code to an address and its answer, a passkey's answer, and the signed-in
 * listener's own passkeys. The routes a visitor calls take no nonce, since there is no cookie yet;
 * the ones about a listener's passkeys are theirs alone, with the nonce any cookie request needs.
 */
final class Routes {

	/**
	 * The namespace.
	 */
	public const NAMESPACE = 'riff-sign-in/v1';

	/**
	 * Hooks the routes.
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers the routes.
	 */
	public static function routes(): void {
		$public = '__return_true';
		$mine   = static fn() => is_user_logged_in() ? true : new WP_Error( 'rest_not_logged_in', __( 'Sign in first.', 'riff-sign-in' ), array( 'status' => 401 ) );
		$b64    = array(
			'type'    => 'string',
			'pattern' => '^[A-Za-z0-9_-]*$',
		);
		$answer = array(
			'type'       => 'object',
			'required'   => true,
			'properties' => array(
				'id'       => $b64 + array( 'required' => true ),
				'response' => array(
					'type'     => 'object',
					'required' => true,
				),
			),
		);
		register_rest_route(
			self::NAMESPACE,
			'/code',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'code' ),
				'permission_callback' => $public,
				'args'                => array(
					'email'    => array(
						'type'     => 'string',
						'format'   => 'email',
						'required' => true,
					),
					'redirect' => array(
						'type'    => 'string',
						'default' => '',
					),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/code/verify',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'verify_code' ),
				'permission_callback' => $public,
				'args'                => array(
					'token' => $b64 + array( 'required' => true ),
					'code'  => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/assertion/options',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'assertion_options' ),
				'permission_callback' => $public,
				'args'                => array(
					'email' => array(
						'type'    => 'string',
						'default' => '',
					),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/assertion',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'assertion' ),
				'permission_callback' => $public,
				'args'                => array(
					'session'    => $b64 + array( 'required' => true ),
					'credential' => $answer,
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/passkeys',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( self::class, 'passkeys' ),
					'permission_callback' => $mine,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( self::class, 'create_passkey' ),
					'permission_callback' => $mine,
					'args'                => array(
						'credential' => $answer,
						'name'       => array(
							'type'    => 'string',
							'default' => '',
						),
					),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/passkeys/options',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'creation_options' ),
				'permission_callback' => $mine,
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/passkeys/(?P<id>[A-Za-z0-9_-]+)',
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => array( self::class, 'delete_passkey' ),
				'permission_callback' => $mine,
			)
		);
	}

	/**
	 * POST /code.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function code( WP_REST_Request $request ) {
		if ( is_user_logged_in() ) {
			return new WP_Error( 'riff_sign_in_already', __( 'You are already signed in.', 'riff-sign-in' ), array( 'status' => 400 ) );
		}
		$sent = Codes::request( (string) $request['email'], (string) $request['redirect'] );
		return is_wp_error( $sent ) ? self::error( $sent ) : new WP_REST_Response( $sent );
	}

	/**
	 * POST /code/verify.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function verify_code( WP_REST_Request $request ) {
		$user = Codes::verify( (string) $request['token'], (string) $request['code'] );
		return is_wp_error( $user ) ? self::error( $user ) : self::signed_in( $user->ID );
	}

	/**
	 * POST /assertion/options.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function assertion_options( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( Passkeys::request_options( sanitize_email( (string) $request['email'] ) ) );
	}

	/**
	 * POST /assertion.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function assertion( WP_REST_Request $request ) {
		$user = Passkeys::verify( (string) $request['session'], (array) $request['credential'] );
		if ( is_wp_error( $user ) ) {
			return self::error( $user );
		}
		Sign_In::sign_in( $user );
		return self::signed_in( $user->ID );
	}

	/**
	 * GET /passkeys: the signed-in listener's, without their keys.
	 *
	 * @return WP_REST_Response
	 */
	public static function passkeys(): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'items' => array_map(
					static fn( array $k ) => array(
						'id'      => $k['id'],
						'name'    => $k['name'],
						'created' => (int) $k['created'],
						'used'    => (int) ( $k['used'] ?? 0 ),
					),
					Passkeys::all( get_current_user_id() )
				),
			)
		);
	}

	/**
	 * POST /passkeys/options.
	 *
	 * @return WP_REST_Response
	 */
	public static function creation_options(): WP_REST_Response {
		return new WP_REST_Response( Passkeys::creation_options( wp_get_current_user() ) );
	}

	/**
	 * POST /passkeys.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function create_passkey( WP_REST_Request $request ) {
		$made = Passkeys::create( wp_get_current_user(), (array) $request['credential'], (string) $request['name'] );
		if ( is_wp_error( $made ) ) {
			return self::error( $made );
		}
		$response = new WP_REST_Response( $made );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * DELETE /passkeys/{id}.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function delete_passkey( WP_REST_Request $request ) {
		if ( ! Passkeys::delete( get_current_user_id(), (string) $request['id'] ) ) {
			return new WP_Error( 'riff_sign_in_unknown', __( 'There is no such passkey.', 'riff-sign-in' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( array( 'deleted' => true ) );
	}

	/**
	 * The answer once a listener is signed in: a nonce for the routes that need one, and whether
	 * a passkey could be saved now.
	 *
	 * @param int $user_id The user.
	 * @return WP_REST_Response
	 */
	private static function signed_in( int $user_id ): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'signedIn' => true,
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'passkeys' => count( Passkeys::all( $user_id ) ),
			)
		);
	}

	/**
	 * An error with the status it carries, or 400.
	 *
	 * @param WP_Error $error The error.
	 * @return WP_Error
	 */
	private static function error( WP_Error $error ): WP_Error {
		$data = $error->get_error_data();
		if ( ! is_array( $data ) || empty( $data['status'] ) ) {
			$error->add_data( array( 'status' => 400 ) );
		}
		return $error;
	}
}

// phpcs:set WordPress.WP.I18n text_domain[] riff
