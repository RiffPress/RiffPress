/**
 * What the pages share beyond their navigation, which site-nav.test.js covers.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const read = ( file ) => fs.readFileSync( path.join( __dirname, '..', '..', file ), 'utf8' );

test( 'the current section is underlined in the header', () => {
	assert.match( read( 'site/web/web.css' ), /\.nav nav a\[aria-current\]/, 'web.css underlines the current link' );
} );

test( 'every share image a page names is a committed file, so a link never previews blank', () => {
	const { execFileSync } = require( 'node:child_process' );
	const root = path.join( __dirname, '..', '..' );
	const tracked = new Set( execFileSync( 'git', [ 'ls-files', 'site' ], { cwd: root, encoding: 'utf8' } ).split( '\n' ) );
	const missing = [];
	for ( const file of tracked ) {
		if ( ! file.endsWith( '.html' ) ) {
			continue;
		}
		for ( const m of read( file ).matchAll( /<meta (?:property="og:image"|name="twitter:image") content="\{\{pages_url\}\}([^"]+)">/g ) ) {
			if ( ! tracked.has( `site/${ m[ 1 ] }` ) ) {
				missing.push( `${ file }: ${ m[ 1 ] }` );
			}
		}
	}
	assert.deepEqual( missing, [], 'commit the card (site/og/ is listed in .gitignore\'s exceptions)' );
} );
