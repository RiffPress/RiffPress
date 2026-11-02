/**
 * One navigation on both hosts, drawn from site-nav.json: the same header everywhere, the section
 * bar, breadcrumbs and pager where they belong, each marked current, and links that still lead
 * somewhere once developers-site.js has split the site in two.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { spawnSync } = require( 'node:child_process' );
const nav = require( './site-nav.js' );
const { split } = require( './developers-site.js' );

const ROOT = path.join( __dirname, '..', '..' );
const read = ( file ) => fs.readFileSync( path.join( ROOT, file ), 'utf8' );
const clone = () => JSON.parse( JSON.stringify( nav.NAV ) );

// A generated page of each kind, built in memory.
const generated = () => {
	const hooks = require( './hooks-reference.js' );
	const refs = require( './reference-pages.js' );
	const pages = new Map();
	for ( const [ file, html ] of hooks.site( hooks.collect() ) ) {
		pages.set( path.relative( path.join( ROOT, 'site' ), file ), html );
	}
	for ( const [ file, html ] of refs.site( refs.collect() ) ) {
		pages.set( path.relative( path.join( ROOT, 'site' ), file ), html );
	}
	for ( const [ file, html ] of require( './handbook-pages.js' ).build().pages ) {
		pages.set( path.relative( path.join( ROOT, 'site' ), file ), html );
	}
	for ( const [ file, html ] of require( './web-pages.js' ).build() ) {
		if ( file.endsWith( '.html' ) ) {
			pages.set( path.relative( path.join( ROOT, 'site' ), file ), html );
		}
	}
	return pages;
};

test( 'the definition is consistent, and a broken one is caught', () => {
	assert.deepEqual( nav.validate(), [] );
	const twice = clone();
	twice.sections[ 1 ].key = 'download';
	assert.match( nav.validate( twice ).join( '\n' ), /key "download" is used twice/ );
	const nowhere = clone();
	nowhere.footer[ 0 ].links.push( 'gone' );
	assert.match( nav.validate( nowhere ).join( '\n' ), /footer links to "gone"/ );
	// A Developers page outside developers/ and web/ would stay behind on riffpress.com.
	const astray = clone();
	astray.sections[ 3 ].children.push( { key: 'learn', label: 'Learn', href: 'learn/' } );
	assert.match( nav.validate( astray ).join( '\n' ), /learn \(learn\/\) is on developers, but developers-site\.js keeps it on the site/ );
} );

test( 'adding a section is one entry: it joins the header of every page, in its place', () => {
	const more = clone();
	more.sections.splice( 3, 0, { key: 'learn', label: 'Learn', href: 'learn/' } );
	assert.deepEqual( nav.validate( more ), [] );
	const html = nav.header( nav.locate( 'learn/', { nav: more } ), '../', false, more );
	assert.match( html, />Add your music<\/a><a href="\.\.\/download\/">Download<\/a><a href="\.\.\/learn\/" aria-current="page">Learn<\/a><a href="\.\.\/developers\/">Developers<\/a>/ );
} );

test( 'every page, written by hand or generated, has the same header in the same order', () => {
	const pages = new Map( nav.handWritten().map( ( f ) => [ f, read( `site/${ f }` ) ] ) );
	for ( const [ f, html ] of generated() ) {
		pages.set( f, html );
	}
	assert.ok( pages.size > 50 );
	const shapes = new Set();
	for ( const [ file, html ] of pages ) {
		const header = html.match( /<header class="nav[^"]*">.*<\/header>/ );
		assert.ok( header, `${ file } has the header` );
		// The same once the path back to the root, the band's colour and the current mark are set aside.
		shapes.add( header[ 0 ].replace( / aria-current="[a-z]+"/g, '' ).replace( /(href|src)="(\.\/(?=")|\{\{pages_url\}\}|(\.\.\/)*)/g, '$1="' ).replace( / alt"/, '"' ).replace( /wordmark-(ink|ivory)/, 'wordmark' ) );
		assert.match( html, /<a class="skip" href="#main">Skip to content<\/a>/, file );
		assert.match( html, /<main id="main"/, file );
		assert.match( html, /<footer>.*<nav aria-label="Footer">.*>About<.*>How Riff is built<.*>Accessibility<.*>Help<.*>Support<.*>Security<.*>GitHub</, file );
	}
	assert.equal( shapes.size, 1, [ ...shapes ].join( '\n' ) );
	assert.match( [ ...shapes ][ 0 ], /<nav aria-label="Main"><a href="add-music\/">Add your music<\/a><a href="download\/">Download<\/a><a href="developers\/">Developers<\/a><\/nav>/ );
} );

test( 'each level marks where the page is: the header, the section bar and the breadcrumbs', () => {
	const pages = generated();
	const hook = pages.get( 'developers/hooks/riff_track/index.html' ) || [ ...pages ].find( ( [ f, h ] ) => f.startsWith( 'developers/hooks/riff_' ) && h.includes( 'apply_filters' ) )[ 1 ];
	assert.match( hook, /<a href="\.\.\/\.\.\/\.\.\/developers\/" aria-current="true">Developers<\/a><\/nav><\/div><\/header>/ );
	assert.match( hook, /<a href="\.\.\/\.\.\/\.\.\/developers\/php\/" aria-current="true">PHP<\/a>/ );
	assert.match( hook, /<nav aria-label="Breadcrumbs"><ol><li><a href="\.\.\/\.\.\/\.\.\/developers\/">Developers<\/a><\/li><li>Reference<\/li><li><a href="\.\.\/\.\.\/\.\.\/developers\/php\/">PHP<\/a><\/li><li aria-current="page">riff_/ );
	assert.match( hook, /<nav class="pager" aria-label="Previous and next">/ );

	const php = pages.get( 'developers/php/index.html' );
	assert.match( php, /href="\.\.\/\.\.\/developers\/php\/" aria-current="page">PHP<\/a>/ );
	assert.match( php, /<li aria-current="page">PHP<\/li><\/ol>/ );
	assert.equal( ( php.match( /aria-current="page"/g ) || [] ).length, 2, 'the bar and the breadcrumbs' );

	const dev = read( 'site/developers/index.html' );
	assert.match( dev, /class="local-title" href="\.\.\/developers\/" aria-current="page">Developers/ );
	assert.match( dev, /<a href="\.\.\/developers\/" aria-current="page">Developers<\/a><\/nav><\/div><\/header>/ );
	assert.doesNotMatch( dev, /Breadcrumbs/, 'a section root has none' );
	assert.match( dev, /<span class="local-label">Handbook<\/span><ul><li><a href="\.\.\/developers\/extensions\/">Extensions<\/a><\/li><li><a href="\.\.\/developers\/player\/">Player<\/a><\/li><\/ul>.*<span class="local-label">Reference<\/span><ul><li><a[^>]*>PHP<\/a><\/li><li><a[^>]*>JavaScript<\/a><\/li><li><a[^>]*>REST API<\/a><\/li><li><a[^>]*>CSS<\/a><\/li><\/ul><\/li><li><a href="\.\.\/web\/">Built on the open web<\/a>/ );

	const built = read( 'site/built/index.html' );
	assert.match( built, /class="mark" href="\.\.\/" aria-current="true"/ );
	assert.doesNotMatch( built, /local-nav/, 'the home section lists nothing in a bar' );
	assert.match( built, /<li><a href="\.\.\/">Riff<\/a><\/li><li aria-current="page">How Riff is built<\/li>/ );
	assert.match( built, /<a href="\.\.\/built\/" aria-current="page">How Riff is built<\/a>/ );

	const music = read( 'site/add-music/index.html' );
	assert.match( music, /<a href="\.\.\/add-music\/" aria-current="page">Add your music<\/a>/ );
	assert.doesNotMatch( music, /local-nav|Breadcrumbs/ );
	assert.doesNotMatch( read( 'site/404.html' ), /aria-current/ );
	assert.match( read( 'site/index.html' ), /<header class="nav alt">.*class="mark" href="\.\/" aria-current="page"><img src="brand\/wordmark-ivory\.svg"/ );
} );

test( 'a web feature, a hook and a handbook have previous and next, in their order', () => {
	const pages = generated();
	const ext = pages.get( 'developers/extensions/index.html' );
	const player = pages.get( 'developers/player/index.html' );
	assert.match( ext, /<a rel="next" href="\.\.\/\.\.\/developers\/player\/"><span class="pager-dir">Next<\/span> <span class="pager-name">Player<\/span>/ );
	assert.doesNotMatch( ext, /rel="prev"/ );
	assert.match( player, /<a rel="prev" href="\.\.\/\.\.\/developers\/extensions\/">/ );
	assert.match( player, /<li><a href="\.\.\/\.\.\/developers\/">Developers<\/a><\/li><li>Handbook<\/li><li aria-current="page">Player<\/li>/ );
	const web = [ ...pages ].filter( ( [ f ] ) => /^web\/[^/]+\/index\.html$/.test( f ) );
	assert.ok( web.length > 2 );
	for ( const [ file, html ] of web ) {
		assert.match( html, /class="pager"/, file );
		assert.match( html, /<li><a href="\.\.\/\.\.\/web\/">Built on the open web<\/a><\/li><li aria-current="page">/, file );
		assert.match( html, /href="\.\.\/\.\.\/web\/" aria-current="true">Built on the open web/, file );
	}
	// A PHP hook's neighbours are PHP hooks.
	const php = [ ...pages ].filter( ( [ f, h ] ) => f.startsWith( 'developers/hooks/' ) && h.includes( '>PHP</a></li><li aria-current' ) );
	for ( const [ file, html ] of php ) {
		for ( const m of html.matchAll( /rel="(?:prev|next)" href="\.\.\/([^/]+)\/"/g ) ) {
			assert.match( pages.get( `developers/hooks/${ m[ 1 ] }/index.html` ), />PHP<\/a><\/li><li aria-current/, `${ file } -> ${ m[ 1 ] }` );
		}
	}
} );

test( 'titles name the host: Riff on the site, Riff Developer on the developer host', () => {
	assert.match( read( 'site/built/index.html' ), /<title>How Riff is built \| Riff<\/title>/ );
	assert.match( read( 'site/download/index.html' ), /<title>Download \| Riff<\/title>/ );
	assert.match( read( 'site/developers/index.html' ), /<title>Developers \| Riff Developer<\/title>/ );
	assert.match( read( 'site/index.html' ), /<title>Riff, a music player for WordPress<\/title>/ );
	for ( const [ file, html ] of generated() ) {
		assert.match( html, /<title>[^<|]+ \| Riff Developer<\/title>/, file );
	}
} );

test( 'stamping keeps the page body, mends a drifted region, and fails a page it cannot place', () => {
	const page = read( 'site/download/index.html' );
	assert.equal( nav.stamp( page, 'download/index.html' ).html, page, 'already current' );
	const drifted = page.replace( '>Developers</a>', '>Devs</a>' ).replace( '<title>Download | Riff</title>', '<title>Download | RiffPress</title>' );
	assert.equal( nav.stamp( drifted, 'download/index.html' ).html, page );
	const body = page.replace( '<h1>', '<h1 data-x="kept">' );
	assert.match( nav.stamp( body, 'download/index.html' ).html, /data-x="kept"/ );
	assert.match( nav.stamp( page.replace( /<!-- \/?nav:footer -->/g, '' ), 'download/index.html' ).problems.join(), /no <!-- nav:footer -->/ );
	assert.match( nav.stamp( page, 'nowhere/index.html' ).problems.join(), /belongs to no section/ );
} );

test( '--check passes on the repository, and fails once a page drifts', () => {
	const run = spawnSync( process.execPath, [ path.join( __dirname, 'site-nav.js' ), '--check' ], { encoding: 'utf8' } );
	assert.equal( run.status, 0, run.stderr );
	const file = path.join( ROOT, 'site', 'add-music', 'index.html' );
	const before = fs.readFileSync( file, 'utf8' );
	try {
		fs.writeFileSync( file, before.replace( '>Download</a>', '>Get it</a>' ) );
		const bad = spawnSync( process.execPath, [ path.join( __dirname, 'site-nav.js' ), '--check' ], { encoding: 'utf8' } );
		assert.equal( bad.status, 1 );
		assert.match( bad.stderr, /site\/add-music\/index\.html: the navigation differs from site-nav\.json/ );
	} finally {
		fs.writeFileSync( file, before );
	}
} );

test( 'split across the two hosts, the navigation links relative on each and absolute to the other', () => {
	const SITE = 'https://riffpress.com/';
	const DEV = 'https://developer.riffpress.com/';
	const out = fs.mkdtempSync( path.join( os.tmpdir(), 'site-nav-' ) );
	const dev = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'site-nav-dev-' ) ), 'dev' );
	const write = ( file, text ) => {
		fs.mkdirSync( path.dirname( path.join( out, file ) ), { recursive: true } );
		fs.writeFileSync( path.join( out, file ), text );
	};
	// A page at every address the definition names, drawn as the generators draw them.
	for ( const { node } of nav.entries().values() ) {
		if ( typeof node.href !== 'string' ) {
			continue;
		}
		const ctx = nav.locate( node.href );
		const up = '../'.repeat( node.href.split( '/' ).length - 1 );
		write( `${ node.href }index.html`, `<!doctype html><html><head></head><body>${ nav.header( ctx, up ) }${ nav.sectionBar( ctx, up ) }${ nav.crumbs( ctx, up ) }<main id="main">${ nav.pager( ...nav.siblings( ctx, up ) ) }</main>${ nav.footer( ctx, up ) }</body></html>` );
	}
	write( 'brand/wordmark-ink.svg', '<svg/>' );
	write( 'web/web.css', '' );
	const { problems } = split( { out, dev, site: SITE, developers: DEV } );
	assert.deepEqual( problems, [] );

	const php = fs.readFileSync( path.join( dev, 'php', 'index.html' ), 'utf8' );
	// The header: the site's sections absolute, Developers relative and current.
	assert.match( php, /class="mark" href="https:\/\/riffpress\.com\/"><img src="\.\.\/brand\/wordmark-ink\.svg"/ );
	assert.match( php, /<a href="https:\/\/riffpress\.com\/add-music\/">Add your music<\/a><a href="https:\/\/riffpress\.com\/download\/">Download<\/a><a href="\.\.\/" aria-current="true">Developers<\/a>/ );
	// The section bar and the breadcrumbs stay on the host.
	assert.match( php, /href="\.\.\/extensions\/">Extensions<\/a>.*href="\.\.\/php\/" aria-current="page">PHP<\/a>.*href="\.\.\/web\/">Built on the open web/ );
	assert.match( php, /<li><a href="\.\.\/">Developers<\/a><\/li><li>Reference<\/li><li aria-current="page">PHP<\/li>/ );
	// The footer's pages are the site's.
	assert.match( php, /<a href="https:\/\/riffpress\.com\/built\/">How Riff is built<\/a>/ );
	assert.match( fs.readFileSync( path.join( dev, 'index.html' ), 'utf8' ), /class="local-title" href="\.\/" aria-current="page">Developers/ );
	assert.match( fs.readFileSync( path.join( dev, 'player', 'index.html' ), 'utf8' ), /rel="prev" href="\.\.\/extensions\/"/ );

	const built = fs.readFileSync( path.join( out, 'built', 'index.html' ), 'utf8' );
	assert.match( built, /<a href="\.\.\/add-music\/">Add your music<\/a><a href="\.\.\/download\/">Download<\/a><a href="https:\/\/developer\.riffpress\.com\/">Developers<\/a>/ );
	assert.match( built, /<a href="\.\.\/built\/" aria-current="page">How Riff is built/ );
	assert.ok( ! fs.existsSync( path.join( out, 'developers' ) ) );
} );
