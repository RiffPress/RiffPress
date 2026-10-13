<?php
/**
 * Resets the permanent demo site to the seed: the album post, its artwork, the Listen page, the
 * site's name and icon, and nothing a visitor left behind. Run on the demo host after a deploy and
 * every night, as `wp eval-file wp-content/riff-demo/demo-reset.php`.
 *
 * @package Riff
 */

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- a WP-CLI script, not plugin code.

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/seed.php';

$riff_demo_dir = __DIR__ . '/compositions';

// Everything a visitor could have changed goes: the demo post and every attachment, so the seed
// imports a clean set and the Media Library holds only what the demo needs.
$riff_demo_old = get_page_by_path( 'compositions', OBJECT, 'post' );
if ( $riff_demo_old ) {
	wp_delete_post( $riff_demo_old->ID, true );
}
foreach ( get_posts(
	array(
		'post_type'      => 'attachment',
		'post_status'    => 'any',
		'posts_per_page' => -1,
		'fields'         => 'ids',
	)
) as $riff_demo_attachment ) {
	wp_delete_attachment( (int) $riff_demo_attachment, true );
}

riff_seed_site( __DIR__ . '/mark.png' );
$riff_demo_id = riff_seed( $riff_demo_dir );
if ( $riff_demo_id ) {
	wp_update_post(
		array(
			'ID'          => $riff_demo_id,
			'post_author' => 1,
		)
	);
	$riff_demo_cat = term_exists( 'Jazz', 'category' );
	if ( ! $riff_demo_cat ) {
		$riff_demo_cat = wp_insert_term( 'Jazz', 'category' );
	}
	if ( is_array( $riff_demo_cat ) ) {
		wp_set_post_categories( $riff_demo_id, array( (int) $riff_demo_cat['term_id'] ) );
	}
}

// The Listen page, on its template, once.
if ( ! get_page_by_path( 'listen', OBJECT, 'page' ) ) {
	wp_insert_post(
		array(
			'post_type'     => 'page',
			'post_status'   => 'publish',
			'post_title'    => 'Listen',
			'post_name'     => 'listen',
			'page_template' => 'listen',
			'post_content'  => '<!-- wp:riff/app {"align":"full"} /-->',
		)
	);
}

// The demo lands inside the player: the Listen page is the front page, the admin bar stays off.
$riff_demo_listen = get_page_by_path( 'listen', OBJECT, 'page' );
if ( $riff_demo_listen ) {
	update_option( 'show_on_front', 'page' );
	update_option( 'page_on_front', $riff_demo_listen->ID );
}
update_user_meta( 1, 'show_admin_bar_front', 'false' );
flush_rewrite_rules();

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	WP_CLI::success( $riff_demo_id ? 'Demo reset: ' . get_permalink( $riff_demo_id ) : 'Demo reset.' );
}
