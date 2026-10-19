const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { scanPlugin } = require( '../lib/scan.js' );

const FIXTURE = path.join( __dirname, 'fixtures', 'sample-plugin' );
const names = ( uses ) => [ ...uses.map.keys() ].sort();

test( 'PHP: calls count, but not comments, strings, methods or namespaced functions', () => {
	const { found, files } = scanPlugin( FIXTURE );
	assert.deepEqual( files, { php: 2, js: 2, blockJson: 1 } );
	const fns = names( found.functions );
	for ( const name of [ 'add_action', 'register_block_type', 'wp_enqueue_script_module', '_prime_post_caches', 'wp_list_pluck', 'get_page_by_title', 'register_rest_route', 'rest_ensure_response', 'update_post_meta', 'esc_html', 'get_bloginfo', '__return_false' ] ) {
		assert.ok( fns.includes( name ), `${ name } is counted` );
	}
	for ( const name of [ 'get_option', 'update_option', 'delete_option', 'wp_insert_post', 'get_posts', 'get_params', 'format', 'register', 'routes', 'saved' ] ) {
		assert.ok( ! fns.includes( name ), `${ name } is not counted` );
	}
} );

test( 'PHP: classes count from new, type declarations and imports', () => {
	const { found } = scanPlugin( FIXTURE );
	assert.ok( found.classes.map.has( 'wp_query' ) );
	assert.ok( found.classes.map.has( 'wp_rest_request' ) );
} );

test( 'PHP: hooks keep their literal and dynamic names', () => {
	const { found } = scanPlugin( FIXTURE );
	assert.deepEqual( names( found.hooks ), [ 'init', 'rest_api_init', 'save_post_attachment', 'save_post_{$type}', 'the_content' ] );
} );

test( 'PHP and block.json: script handles and module IDs in strings', () => {
	const { found } = scanPlugin( FIXTURE );
	assert.deepEqual( names( found.handles ), [ 'wp-api-fetch', 'wp-blocks' ] );
	assert.deepEqual( names( found.modules ), [ '@wordpress/interactivity' ] );
} );

test( 'JS: imports and wp globals, but not commented-out imports or names in strings', () => {
	const { found } = scanPlugin( FIXTURE );
	assert.deepEqual( names( found.imports ), [ '@wordpress/interactivity' ] );
	assert.deepEqual( names( found.globals ), [ 'wp.blockEditor', 'wp.blocks', 'wp.i18n' ] );
} );

test( 'block.json: supports two levels deep, without the default-controls settings', () => {
	const { found } = scanPlugin( FIXTURE );
	assert.deepEqual( names( found.supports ), [ '__experimentalBorder', '__experimentalBorder.radius', 'color', 'color.background', 'html', 'interactivity' ] );
} );

test( 'node_modules, vendor and tests are skipped unless told otherwise', () => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'wp-api-coverage-' ) );
	try {
		fs.writeFileSync( path.join( dir, 'plugin.php' ), '<?php get_option( "a" );' );
		for ( const sub of [ 'node_modules', 'vendor', 'tests' ] ) {
			fs.mkdirSync( path.join( dir, sub ) );
			fs.writeFileSync( path.join( dir, sub, 'x.php' ), '<?php wp_delete_post( 1 );' );
		}
		assert.deepEqual( names( scanPlugin( dir ).found.functions ), [ 'get_option' ] );
		assert.deepEqual( names( scanPlugin( dir, { ignore: [ 'node_modules' ] } ).found.functions ), [ 'get_option', 'wp_delete_post' ] );
	} finally {
		fs.rmSync( dir, { recursive: true, force: true } );
	}
} );
