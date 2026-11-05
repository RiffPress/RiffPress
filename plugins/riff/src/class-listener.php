<?php
/**
 * Who a listener's REST routes answer to.
 *
 * @since 6.1.1
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_REST_Request;

defined( 'ABSPATH' ) || exit;

/**
 * The checks the routes over a listener's own things make, their likes and history, their
 * playlists and the Together room: who is asking (signed_in()), and, where a route names a user,
 * whether they may read and change that user's (allowed()). Each controller adds what is its own,
 * as Playlists_Rest checks the playlist is that user's.
 */
final class Listener {
	/**
	 * Whether whoever is asking is a listener here: a signed-in user who can read this site. Over
	 * cookies that means a valid REST nonce too, since without one WordPress treats the request as
	 * a visitor's. The check for a route that names no user whose things it changes, or names one
	 * for another reason, as Together's name the listener followed.
	 *
	 * The words are likes', where the check began; playlists and Together answer with them too.
	 *
	 * @since 6.1.1
	 *
	 * @return true|WP_Error
	 */
	public static function signed_in() {
		if ( ! is_user_logged_in() ) {
			return new WP_Error( 'rest_not_logged_in', __( 'Sign in to keep likes in your account.', 'riff' ), array( 'status' => 401 ) );
		}
		if ( ! current_user_can( 'read' ) ) {
			return new WP_Error( 'rest_forbidden', __( 'Sorry, you are not allowed to keep likes on this site.', 'riff' ), array( 'status' => 403 ) );
		}
		return true;
	}

	/**
	 * Whether the request may read and change the things of the user it names: a listener
	 * (signed_in()), for their own (me, or their own ID); for anyone else's, a user who can edit
	 * that user, as core's application passwords route asks.
	 *
	 * @since 6.1.1
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	public static function allowed( WP_REST_Request $request ) {
		$signed_in = self::signed_in();
		if ( true !== $signed_in ) {
			return $signed_in;
		}
		$user = self::user( $request );
		if ( get_current_user_id() !== $user ) {
			if ( ! $user || ! get_userdata( $user ) ) {
				return new WP_Error( 'rest_user_invalid_id', __( 'Invalid user ID.', 'riff' ), array( 'status' => 404 ) );
			}
			if ( ! current_user_can( 'edit_user', $user ) ) {
				return new WP_Error( 'rest_forbidden', __( 'Sorry, you are not allowed to see that user\'s likes.', 'riff' ), array( 'status' => 403 ) );
			}
		}
		return true;
	}

	/**
	 * The user a request names: the signed-in user for me, or the ID given.
	 *
	 * @since 6.1.1
	 *
	 * @param WP_REST_Request $request Request.
	 * @return int User ID.
	 */
	public static function user( WP_REST_Request $request ): int {
		$user = (string) $request['user'];
		return 'me' === $user || '' === $user ? get_current_user_id() : (int) $user;
	}
}
