const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { scanCoreFile } = require( '../scripts/build-catalog.js' );
const catalog = require( '../catalog/wordpress.json' );

test( 'core files: global functions and classes, not methods or namespaced code', () => {
	const src = `<?php
/**
 * @since 6.5.0
 */
function wp_thing() {
	/** This filter is documented in wp-includes/other.php */
	$x = apply_filters( 'thing', 1 );
	/**
	 * Fires after a thing.
	 *
	 * @since 6.6.0
	 */
	do_action( "thing_{$type}", $x );
	do_action_deprecated( 'old_thing', array(), '6.0.0' );
}
if ( ! function_exists( 'wp_guarded' ) ) :
	/** @since 2.0.0 */
	function wp_guarded() {}
endif;
/**
 * @since 6.4.0
 * @access private
 */
final class WP_Thing {
	public function method() {}
	public static function &ref() {}
}
$anon = new class {
	public function also_a_method() {}
};
`;
	const found = scanCoreFile( src, 'wp-includes/thing.php' );
	assert.deepEqual( found.functions.map( ( f ) => [ f.name, f.since ] ), [ [ 'wp_thing', '6.5.0' ], [ 'wp_guarded', '2.0.0' ] ] );
	assert.deepEqual( found.classes.map( ( c ) => [ c.name, c.private ] ), [ [ 'WP_Thing', true ] ] );
	assert.deepEqual( found.hooks.map( ( h ) => [ h.name, h.type, h.since, h.deprecated ] ), [
		[ 'thing', 'filter', null, false ],
		[ 'thing_{$type}', 'action', '6.6.0', false ],
		[ 'old_thing', 'action', null, true ],
	] );
	assert.deepEqual( scanCoreFile( '<?php namespace WordPress\\AiClient; function helper() {}', 'x.php' ).functions, [] );
} );

test( 'the bundled catalog is the pinned release', () => {
	const script = fs.readFileSync( path.join( __dirname, '..', 'scripts', 'build-catalog.js' ), 'utf8' );
	const pinned = /const PINNED = '([^']+)'/.exec( script )[ 1 ];
	assert.equal( catalog.wordpress, pinned, 'run npm run catalog after changing PINNED' );
	assert.equal( catalog.source, `https://downloads.wordpress.org/release/wordpress-${ pinned }-no-content.zip` );
} );

test( 'the bundled catalog has the areas the report is for', () => {
	const find = ( kind, name ) => catalog[ kind ].find( ( e ) => e.name === name );
	assert.equal( find( 'functions', 'wp_register_ability' ).area, 'Abilities' );
	assert.equal( find( 'functions', 'current_user_can' ).area, 'Users and auth' );
	assert.equal( find( 'functions', 'wp_interactivity_state' ).area, 'Interactivity API' );
	assert.equal( find( 'classes', 'WP_HTML_Processor' ).area, 'HTML API' );
	assert.equal( find( 'functions', 'wp_register_script_module' ).area, 'Script Modules' );
	assert.equal( find( 'functions', 'register_rest_route' ).area, 'REST API' );
	assert.equal( find( 'functions', 'wp_get_attachment_metadata' ).area, 'Media' );
	assert.equal( find( 'functions', 'load_plugin_textdomain' ).area, 'i18n' );
	assert.equal( find( 'functions', 'get_option' ).area, 'Options' );
	assert.equal( find( 'functions', 'add_rewrite_rule' ).area, 'Rewrite and permalinks' );
	assert.equal( find( 'hooks', 'init' ).type, 'action' );
	assert.equal( find( 'hooks', 'the_content' ).type, 'filter' );
	assert.equal( find( 'modules', '@wordpress/interactivity' ).area, 'Interactivity API' );
	assert.equal( find( 'packages', '@wordpress/api-fetch' ).global, 'wp.apiFetch' );
	assert.ok( find( 'supports', 'interactivity' ) );
	assert.ok( find( 'functions', 'get_page_by_title' ).deprecated );
	assert.ok( find( 'functions', '_prime_post_caches' ).private );
	assert.ok( ! find( 'functions', '__' ).private, 'the translation functions are public' );
	assert.equal( find( 'functions', 'str_starts_with' ), undefined, 'PHP polyfills are not WordPress APIs' );
} );
