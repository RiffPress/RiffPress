<?php
/**
 * Plugin Name: Sample Plugin
 *
 * A fixture for the tests: every line here is something the scan should, or should not, count.
 */

namespace Sample;

use WP_REST_Request;

// get_option() in a comment is not a call.
/* Nor is update_option() in a block comment. */

add_action( 'init', __NAMESPACE__ . '\\register' );
add_filter( 'the_content', '__return_false' );
add_action( "save_post_{$type}", 'Sample\\saved' );
add_action( 'save_post_attachment', 'Sample\\saved' );
add_action( 'rest_api_init', 'Sample\\routes' );

function register() {
	register_block_type( __DIR__ . '/block' );
	wp_enqueue_script_module( 'sample/view', plugins_url( 'view.js', __FILE__ ), array( '@wordpress/interactivity' ) );
	$label = 'delete_option( "x" ) inside a string';
	$html  = <<<HTML
	<p>wp_insert_post() inside a heredoc</p>
	HTML;
	$query = new \WP_Query( array( 'post_type' => 'post' ) );
	_prime_post_caches( wp_list_pluck( $query->posts, 'ID' ) );
	$query->get_posts();
	$page = get_page_by_title( 'About' );
	helper\format( $page );
}

function routes() {
	register_rest_route(
		'sample/v1',
		'/items',
		array(
			'callback' => static fn( WP_REST_Request $request ) => rest_ensure_response( $request->get_params() ),
		)
	);
}

function saved( int $post_id ): void {
	update_post_meta( $post_id, 'sample', 1 );
}
?>
<div><?php echo esc_html( get_bloginfo( 'name' ) ); ?></div>
