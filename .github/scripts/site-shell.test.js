/**
 * The pages written by hand carry the same bar and breadcrumbs as the generated ones.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { localNav, crumbs } = require( './site-shell.js' );

const read = ( file ) => fs.readFileSync( path.join( __dirname, '..', '..', file ), 'utf8' );

test( 'the Developers page has the Developers bar, marked as the page', () => {
	const html = read( 'site/developers/index.html' );
	assert.ok( html.includes( localNav( '../', 'developers' ) ) );
	assert.match( localNav( '../', 'developers' ), /class="local-title" href="\.\.\/developers\/" aria-current="page"/ );
} );

test( 'the hand-written pages use the shared breadcrumbs', () => {
	assert.ok( read( 'site/developers/index.html' ).includes( crumbs( [ [ 'RiffPress', '../' ], [ 'Developers' ] ] ) ) );
	assert.ok( read( 'site/add-music/index.html' ).includes( crumbs( [ [ 'RiffPress', '../' ], [ 'Add your music' ] ] ) ) );
	assert.ok( read( 'site/download/index.html' ).includes( crumbs( [ [ 'RiffPress', '../' ], [ 'Get Riff' ] ] ) ) );
	for ( const file of [ 'site/developers/index.html', 'site/add-music/index.html', 'site/download/index.html' ] ) {
		assert.doesNotMatch( read( file ), /class="crumb"/, `${ file } still has the old breadcrumb` );
	}
} );

test( 'every page under /web/ has the bar, with Built on the open web current', () => {
	const dir = path.join( __dirname, '..', '..', 'site', 'web' );
	const pages = [ 'index.html', ...fs.readdirSync( dir, { withFileTypes: true } ).filter( ( e ) => e.isDirectory() ).map( ( e ) => `${ e.name }/index.html` ) ];
	for ( const page of pages ) {
		const html = fs.readFileSync( path.join( dir, page ), 'utf8' );
		assert.match( html, /<div class="local-nav">.*<a href="[./]*web\/" aria-current="true">Built on the open web<\/a>/, page );
	}
} );
