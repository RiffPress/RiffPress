/**
 * The e2e specs make what they need through own.js, so each removes only what it made. A spec that
 * calls requestUtils directly leaves its post behind on the site, and the next project's library
 * count is off by one. Run by `node --test .github/scripts/*.test.js`.
 */
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { test } = require( 'node:test' );

const PLUGINS = path.resolve( __dirname, '..', '..', 'plugins' );
const DIRS = fs
	.readdirSync( PLUGINS )
	.map( ( p ) => path.join( PLUGINS, p, 'tests', 'e2e' ) )
	.filter( ( d ) => fs.existsSync( d ) );
// own.spec.js makes a post the suite does not own on purpose, to check cleanup leaves it alone.
const EXEMPT = new Set( [ 'own.js', 'own.spec.js' ] );

test( 'every spec makes posts, pages and media through own.js', () => {
	const direct = [];
	for ( const file of DIRS.flatMap( ( d ) => fs.readdirSync( d ).map( ( f ) => path.join( d, f ) ) ).filter( ( f ) => f.endsWith( '.js' ) && ! EXEMPT.has( path.basename( f ) ) ) ) {
		fs.readFileSync( file, 'utf8' )
			.split( '\n' )
			.forEach( ( line, i ) => {
				if ( /requestUtils\.(createPost|createPage|uploadMedia)\(/.test( line ) ) {
					direct.push( `${ path.relative( PLUGINS, file ) }:${ i + 1 }` );
				}
			} );
	}
	assert.deepEqual( direct, [], 'use made.post(), made.page() or made.media() from own.js' );
} );
