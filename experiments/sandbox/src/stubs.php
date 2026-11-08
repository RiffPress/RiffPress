<?php
/**
 * The WordPress and Riff an extension sees in the sandbox: a few of their functions, each a call
 * across the bridge to the real site, where the host checks it against the extension's
 * isolation.json. Nothing here touches a database, a file of the site's or the network; there is
 * none of those in this PHP to touch. A refused call fails the way the function fails in
 * WordPress (false, an empty string, a WP_Error), and is recorded by the host.
 *
 * @package Riff\Sandbox
 */

/**
 * One call across the bridge.
 *
 * @param string $op   The op.
 * @param array  $args Its arguments.
 * @return array { ok: bool, value?: mixed, error?: string }
 */
function riff_sandbox_call( string $op, array $args = array() ): array {
	$answer = json_decode( (string) post_message_to_js( json_encode( array( 'op' => $op, 'args' => $args ) ) ), true );
	return is_array( $answer ) ? $answer : array( 'ok' => false, 'error' => 'no answer' );
}

final class WP_Error {
	public function __construct( public string $code = '', public string $message = '' ) {}
	public function get_error_message(): string {
		return $this->message;
	}
}

function is_wp_error( $thing ): bool {
	return $thing instanceof WP_Error;
}

$GLOBALS['riff_sandbox_actions'] = array();

function add_action( string $hook, callable $callback, int $priority = 10, int $accepted_args = 1 ): bool {
	$GLOBALS['riff_sandbox_actions'][ $hook ][ $priority ][] = array( $callback, $accepted_args );
	return true;
}

function add_filter( string $hook, callable $callback, int $priority = 10, int $accepted_args = 1 ): bool {
	return add_action( $hook, $callback, $priority, $accepted_args );
}

function do_action( string $hook, ...$args ): void {
	$by = $GLOBALS['riff_sandbox_actions'][ $hook ] ?? array();
	ksort( $by );
	foreach ( $by as $callbacks ) {
		foreach ( $callbacks as list( $callback, $accepted ) ) {
			$callback( ...array_slice( $args, 0, $accepted ) );
		}
	}
}

function get_post_meta( int $id, string $key = '', bool $single = false ) {
	$answer = riff_sandbox_call( 'meta.get', array( $id, $key ) );
	return $answer['ok'] ? (string) $answer['value'] : ( $single ? '' : array() );
}

function update_post_meta( int $id, string $key, $value ): bool {
	return riff_sandbox_call( 'meta.set', array( $id, $key, is_scalar( $value ) ? (string) $value : json_encode( $value ) ) )['ok'];
}

function wp_remote_get( string $url, array $args = array() ) {
	unset( $args );
	$answer = riff_sandbox_call( 'http.get', array( $url ) );
	return $answer['ok'] ? $answer['value'] : new WP_Error( 'http_request_failed', (string) $answer['error'] );
}

function wp_remote_retrieve_body( $response ): string {
	return is_array( $response ) ? (string) ( $response['body'] ?? '' ) : '';
}

function wp_remote_retrieve_response_code( $response ): int {
	return is_array( $response ) ? (int) ( $response['status'] ?? 0 ) : 0;
}

function riff_register_view( string $id, array $args = array() ): bool {
	return riff_sandbox_call( 'view', array( $id, $args ) )['ok'];
}

/**
 * A track, as Riff's REST API has it, or null.
 *
 * @param int $id Attachment ID.
 * @return array|null
 */
function riff_sandbox_track( int $id ): ?array {
	$answer = riff_sandbox_call( 'track', array( $id ) );
	return $answer['ok'] && is_array( $answer['value'] ) ? $answer['value'] : null;
}

function riff_sandbox_log( string $message ): bool {
	return riff_sandbox_call( 'log', array( $message ) )['ok'];
}
