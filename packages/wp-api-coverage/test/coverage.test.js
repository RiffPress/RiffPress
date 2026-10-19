const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const path = require( 'node:path' );
const { coverage, hookPattern, hookSlug } = require( '../lib/coverage.js' );
const { formatText } = require( '../lib/report.js' );

const FIXTURE = path.join( __dirname, 'fixtures', 'sample-plugin' );
const report = coverage( FIXTURE );
const area = ( name ) => report.areas.find( ( a ) => a.area === name );
const usedNames = ( name ) => area( name ).used.map( ( i ) => i.name );

test( 'the report follows the bundled catalog', () => {
	assert.equal( report.plugin, 'sample-plugin' );
	assert.match( report.wordpress, /^\d+\.\d+(\.\d+)?$/ );
	assert.ok( report.summary.used > 0 && report.summary.used < report.summary.available );
} );

test( 'used APIs land in their areas', () => {
	assert.ok( usedNames( 'REST API' ).includes( 'register_rest_route' ) );
	assert.ok( usedNames( 'REST API' ).includes( 'WP_REST_Request' ) );
	assert.ok( usedNames( 'REST API' ).includes( 'rest_api_init' ) );
	assert.ok( usedNames( 'Script Modules' ).includes( 'wp_enqueue_script_module' ) );
	assert.ok( usedNames( 'Interactivity API' ).includes( '@wordpress/interactivity' ) );
	assert.ok( usedNames( 'Blocks' ).includes( '@wordpress/blocks' ) );
	assert.ok( usedNames( 'REST API' ).includes( '@wordpress/api-fetch' ) );
	assert.ok( usedNames( 'Block supports' ).includes( 'interactivity' ) );
} );

test( 'a concrete hook name matches the dynamic hook core fires', () => {
	const posts = report.areas.flatMap( ( a ) => a.used ).filter( ( i ) => i.name === 'save_post_{$post->post_type}' );
	assert.equal( posts.length, 1 );
	assert.equal( posts[ 0 ].uses, 2, 'save_post_attachment and save_post_{$type} are both the same hook' );
} );

test( 'deprecated and private APIs in use are called out, and never suggested', () => {
	assert.deepEqual( report.deprecated.map( ( i ) => i.name ), [ 'get_page_by_title' ] );
	assert.ok( report.internal.some( ( i ) => i.name === '_prime_post_caches' ) );
	assert.ok( report.internal.some( ( i ) => i.name === '__experimentalBorder' ) );
	const suggested = report.areas.flatMap( ( a ) => a.unused ).map( ( i ) => i.name );
	assert.ok( ! suggested.some( ( n ) => n.startsWith( '__experimental' ) || /^_(?!_|e$|ex$|n$|nx$|x$|n_noop$|nx_noop$)/.test( n ) ) );
	assert.ok( ! suggested.includes( 'get_page_by_title' ) );
} );

test( 'unused APIs rank newest first', () => {
	const unused = area( 'Script Modules' ).unused;
	for ( let i = 1; i < unused.length; i++ ) {
		assert.ok( unused[ i - 1 ].score >= unused[ i ].score );
	}
	assert.ok( unused.every( ( i ) => i.url.startsWith( 'https://developer.wordpress.org/' ) ) );
} );

test( 'areas the plugin uses come first', () => {
	const firstUnused = report.areas.findIndex( ( a ) => a.usedCount === 0 );
	assert.ok( report.areas.slice( firstUnused ).every( ( a ) => a.usedCount === 0 ) );
} );

test( 'the text report lists areas, then what is not used yet', () => {
	const text = formatText( report, { limit: 2 } );
	assert.match( text, /^WordPress API coverage for sample-plugin, against WordPress / );
	assert.match( text, /Deprecated APIs still in use:\n {2}get_page_by_title/ );
	assert.match( text, /REST API: \d+ of \d+ used/ );
	assert.match( text, /Not touched at all: / );
	const only = formatText( report, { areas: [ 'abilities' ], limit: 1 } );
	assert.match( only, /Abilities: 0 of \d+ used\n {2}Not used yet:\n {4}\S+/ );
	assert.doesNotMatch( only, /REST API:/ );
} );

test( 'dynamic hook patterns need some literal text', () => {
	assert.equal( hookPattern( '{$hook}' ), null );
	assert.ok( hookPattern( 'save_post_{$post->post_type}' ).test( 'save_post_page' ) );
	assert.ok( ! hookPattern( 'save_post_{$post->post_type}' ).test( 'save_post' ) );
} );

test( 'hook links use the code reference slug', () => {
	assert.equal( hookSlug( 'save_post_{$post->post_type}' ), 'save_post_post-post_type' );
} );
