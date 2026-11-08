/**
 * Source and riffpress.com are one system: site/tokens.css and the two families are riffpress.com's
 * files byte for byte, pinned in site/brand/shared.json, and web.css builds on them without setting
 * any of their values again.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { stale } = require( './tokens.js' );
const nav = require( './site-nav.js' );

const ROOT = path.join( __dirname, '..', '..' );
const read = ( file ) => fs.readFileSync( path.join( ROOT, file ), 'utf8' );
const names = ( css ) => new Set( [ ...css.matchAll( /^\s*(--[a-z0-9-]+)\s*:/gm ) ].map( ( m ) => m[ 1 ] ) );

test( 'the shared files are the copies their pins name', () => {
	assert.deepEqual( stale(), [] );
} );

test( 'web.css sets none of the shared tokens and declares none of the shared faces', () => {
	const shared = names( read( 'site/tokens.css' ) );
	const web = read( 'site/web/web.css' );
	const again = [ ...names( web ) ].filter( ( n ) => shared.has( n ) );
	assert.deepEqual( again, [], 'set it in riffpress-com\'s tokens.css, then copy it over' );
	for ( const face of [ 'EB Garamond', 'Schibsted Grotesk' ] ) {
		assert.doesNotMatch( web, new RegExp( `@font-face\\s*\\{[^}]*font-family:\\s*"${ face }"` ), `tokens.css declares ${ face }` );
	}
	// Every token web.css uses is one it or tokens.css defines.
	const own = names( web );
	const missing = [ ...new Set( [ ...web.matchAll( /var\(\s*(--[a-z0-9-]+)/g ) ].map( ( m ) => m[ 1 ] ) ) ].filter( ( n ) => ! shared.has( n ) && ! own.has( n ) );
	assert.deepEqual( missing, [] );
} );

test( 'every page written by hand loads tokens.css before web.css', () => {
	for ( const file of nav.handWritten() ) {
		const html = read( `site/${ file }` );
		const tokens = html.search( /<link rel="stylesheet" href="[^"]*tokens\.css">/ );
		const web = html.search( /<link rel="stylesheet" href="[^"]*web\/web\.css">/ );
		assert.ok( tokens > -1 && tokens < web, `site/${ file }` );
	}
	assert.match( require( './site-shell.js' ).head( 'T', 'D', 'developers/php/', 2, '../../web/web.css' ), /<link rel="stylesheet" href="\.\.\/\.\.\/tokens\.css">\n<link rel="stylesheet" href="\.\.\/\.\.\/web\/web\.css">/ );
} );
