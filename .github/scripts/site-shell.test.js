/**
 * The pages written by hand carry the same bar and breadcrumbs as the generated ones.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { localNav, crumbs, foot } = require( './site-shell.js' );

const read = ( file ) => fs.readFileSync( path.join( __dirname, '..', '..', file ), 'utf8' );

test( 'the Developers page has the Developers bar, marked as the page', () => {
	const html = read( 'site/developers/index.html' );
	assert.ok( html.includes( localNav( '../', 'developers' ) ) );
	assert.match( localNav( '../', 'developers' ), /class="local-title" href="\.\.\/developers\/" aria-current="page"/ );
} );

test( 'a top-level page has no breadcrumbs: the section bar under the global one already says where it is', () => {
	for ( const file of [ 'site/developers/index.html', 'site/add-music/index.html', 'site/download/index.html', 'site/built/index.html', 'site/accessibility/index.html' ] ) {
		assert.doesNotMatch( read( file ), /class="crumbs"|class="crumb"/, `${ file } still has breadcrumbs` );
	}
	// Nor does a page one level under Developers, which the bar marks; one deeper keeps a way back up.
	assert.doesNotMatch( read( 'site/web/index.html' ), /class="crumbs"/ );
	assert.doesNotMatch( crumbs( [ [ 'PHP' ] ] ), /Breadcrumbs/ );
	assert.match( crumbs( [ [ 'Built on the open web', '../' ], [ 'Inert' ] ] ), /href="\.\.\/">Built on the open web<\/a>.*Inert/ );
} );

test( 'the hand-written pages carry the shared footer, with its links relative to the page', () => {
	for ( const [ file, up ] of [ [ 'site/index.html', '' ], [ 'site/add-music/index.html', '../' ], [ 'site/download/index.html', '../' ], [ 'site/developers/index.html', '../' ], [ 'site/built/index.html', '../' ], [ 'site/accessibility/index.html', '../' ] ] ) {
		const footer = foot( up ).match( /<footer>.*<\/footer>/s )[ 0 ];
		assert.ok( read( file ).includes( footer ), `${ file } has the footer with links from ${ up || 'the root' }` );
	}
} );

test( 'every page under /web/ has the bar, with Built on the open web current', () => {
	const dir = path.join( __dirname, '..', '..', 'site', 'web' );
	// The pages are built, not committed; a fresh checkout has none until they are.
	if ( ! fs.existsSync( path.join( dir, 'index.html' ) ) ) {
		require( 'node:child_process' ).execFileSync( process.execPath, [ path.join( __dirname, 'web-pages.js' ) ] );
	}
	const pages = [ 'index.html', ...fs.readdirSync( dir, { withFileTypes: true } ).filter( ( e ) => e.isDirectory() ).map( ( e ) => `${ e.name }/index.html` ) ];
	for ( const page of pages ) {
		const html = fs.readFileSync( path.join( dir, page ), 'utf8' );
		assert.match( html, /<div class="local-nav">.*<a class="aside-link" href="[./]*web\/" aria-current="true">Built on the open web<\/a>/, page );
	}
} );

test( 'the current page is underlined in the global bar, but not when it is the Download button', () => {
	for ( const file of [ 'site/site.css', 'site/web/web.css' ] ) {
		const css = read( file );
		assert.match( css, /\.nav nav a:not\(\.btn\)\[aria-current\]/, `${ file } underlines the current link` );
		assert.doesNotMatch( css, /\.nav nav a\[aria-current\]/, `${ file } would underline the Download button on its own page` );
	}
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
