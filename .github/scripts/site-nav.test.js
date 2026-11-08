/**
 * One navigation on source.riffpress.com, drawn from site-nav.json: the same header everywhere, the
 * section bar and pager where they belong, each marked current, each place named once, and links
 * that still lead somewhere once developers-site.js has moved the pages to the host.
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
	nowhere.footer.push( 'gone' );
	assert.match( nav.validate( nowhere ).join( '\n' ), /footer links to "gone"/ );
	// A page outside what developers-site.js moves would stay behind, undeployed.
	const astray = clone();
	astray.sections[ 1 ].children.push( { key: 'learn', label: 'Learn', href: 'learn/' } );
	assert.match( nav.validate( astray ).join( '\n' ), /learn \(learn\/\) is a page developers-site\.js does not publish/ );
	const homeless = clone();
	delete homeless.sections[ 1 ].root;
	assert.match( nav.validate( homeless ).join( '\n' ), /one section, and only one, is the host's home/ );
	// A door is its own page with a summary, and each page on it says what it covers.
	const bare = clone();
	delete bare.sections[ 1 ].children[ 0 ].summary;
	delete bare.sections[ 1 ].children[ 0 ].children[ 1 ].summary;
	const found = nav.validate( bare ).join( '\n' );
	assert.match( found, /the door use needs a page of its own \(href\) and a summary/ );
	assert.match( found, /music is listed on the use door's page, so it needs a summary/ );
	// A door with no pages yet is reported, not a crash.
	const empty = clone();
	empty.sections[ 1 ].children.push( { key: 'soon', label: 'Soon', href: 'developers/soon/', door: true, summary: 'Soon.' } );
	assert.match( nav.validate( empty ).join( '\n' ), /the door soon has no pages/ );
} );

test( 'a door\'s page lists pages beside its groups as a list of their own', () => {
	const door = { key: 'd', door: true, children: [ { key: 'a', label: 'A', href: 'a/', summary: 'First.' }, { key: 'g', label: 'Group', children: [ { key: 'b', label: 'B', href: 'b/', summary: 'Second.' } ] }, { key: 'c', label: 'C', href: 'c/', summary: 'Third.' } ] };
	assert.equal( nav.doorPages( door, '' ), '<ul class="pages"><li><a href="a/">A</a><span>First.</span></li></ul><h2 class="pages-group" id="g">Group</h2><ul class="pages"><li><a href="b/">B</a><span>Second.</span></li></ul><ul class="pages"><li><a href="c/">C</a><span>Third.</span></li></ul>' );
	assert.equal( door.children[ 1 ].children.length, 1, 'the definition is left as it was' );
} );

test( 'adding a section is one entry, and its folder in developers-site.js: it joins the header of every page, in its place, and the docs stay Source\'s alone', () => {
	const more = clone();
	more.sections.splice( 1, 0, { key: 'learn', label: 'Learn', href: 'learn/', host: 'developers' } );
	assert.deepEqual( nav.validate( more ), [ 'site-nav.json: learn (learn/) is a page developers-site.js does not publish' ], 'until MOVED lists it' );
	const html = nav.header( nav.locate( 'learn/', { nav: more } ), '../', more );
	assert.match( html, />Download<\/a><a href="\.\.\/learn\/" aria-current="page">Learn<\/a><\/nav>/ );
	assert.doesNotMatch( html, />Docs</ );
} );

test( 'every page, written by hand or generated, has the same header in the same order', () => {
	const pages = new Map( nav.handWritten().map( ( f ) => [ f, read( `site/${ f }` ) ] ) );
	for ( const [ f, html ] of generated() ) {
		pages.set( f, html );
	}
	assert.ok( pages.size > 30 );
	const shapes = new Set();
	for ( const [ file, html ] of pages ) {
		const header = html.match( /<header class="nav[^"]*">.*<\/header>/ );
		assert.ok( header, `${ file } has the header` );
		// The same once the path back to the root, the band's colour and the current mark are set aside.
		shapes.add( header[ 0 ].replace( / aria-current="[a-z]+"/g, '' ).replace( /(href|src)="(\.\/(?=")|\{\{pages_url\}\}|(\.\.\/)*)/g, '$1="' ).replace( / alt"/, '"' ).replace( /wordmark-(ink|ivory)/, 'wordmark' ) );
		assert.match( html, /<a class="skip" href="#main">Skip to content<\/a>/, file );
		assert.match( html, /<main id="main"/, file );
		assert.match( html, /<footer>.*<nav aria-label="Footer"><ul>.*>Accessibility<.*>Support<.*>Security<.*>GitHub</, file );
		// riffpress.com is the wordmark's; the footer does not lead there again.
		assert.doesNotMatch( html.match( /<footer>.*<\/footer>/s )[ 0 ], /riffpress\.com/, file );
		assert.doesNotMatch( html, /Breadcrumbs/, `${ file }: the sidebar and the Menu button say where a page is` );
	}
	assert.equal( shapes.size, 1, [ ...shapes ].join( '\n' ) );
	// Riff | Source, search (docs.js shows it), and Download: Source is the docs, so no Docs as well.
	assert.match( [ ...shapes ][ 0 ], /<\/div><button class="search" type="button" aria-haspopup="dialog" hidden>.*<\/button><nav aria-label="Main"><a href="download\/">Download<\/a><\/nav>/ );
} );

test( 'the home lists the four doors, and a door its own pages, each with what it covers', () => {
	const home = read( 'site/developers/index.html' );
	assert.doesNotMatch( home, /docs-nav/, 'the home is no door, so it has no sidebar' );
	const doors = [ ...home.matchAll( /<li><h2><a href="\.\.\/developers\/([a-z]+)\/">([^<]+)<\/a><\/h2><p>([^<]+)<\/p>/g ) ].map( ( m ) => m[ 2 ] );
	assert.deepEqual( doors, [ 'Use Riff', 'Build on Riff', 'Run Riff for others', 'Contribute' ] );
	assert.match( home, /<p class="doors-first"><a href="\.\.\/add-music\/">Add your music<\/a><a href="\.\.\/developers\/music\/">Your music<\/a>/ );

	const build = read( 'site/developers/build/index.html' );
	assert.match( build, /<h2 class="pages-group" id="reference">Reference<\/h2><ul class="pages"><li><a href="\.\.\/\.\.\/developers\/php\/">PHP<\/a><span>[^<]+<\/span><\/li>/ );
	assert.match( build, /<h2 class="pages-group" id="guides">Guides<\/h2>/ );
	assert.match( build, /<span class="docs-where">Build on Riff<\/span>/ );
	// The switcher names the door, and lists all four.
	assert.match( build, /<details class="door-switch"><summary><span class="screen-reader-text">Door: <\/span>Build on Riff<\/summary><ul>(<li><a [^>]+>[^<]+<\/a><\/li>){4}<\/ul><\/details>/ );
	assert.match( build, /<a href="\.\.\/\.\.\/developers\/build\/" aria-current="true">Build on Riff<\/a>/ );
	const use = read( 'site/developers/use/index.html' );
	assert.match( use, /<ul class="pages"><li><a href="\.\.\/\.\.\/add-music\/">Add your music<\/a><span>From no site to an album playing/ );
} );

test( 'each level marks where the page is: Source in the header, the door in the sidebar, and the Menu button on a phone', () => {
	const pages = generated();
	const hook = pages.get( 'developers/hooks/riff_track/index.html' );
	assert.match( hook, /<a class="host" href="\.\.\/\.\.\/\.\.\/developers\/" aria-current="true">Source<\/a>/ );
	assert.match( hook, /<a href="\.\.\/\.\.\/\.\.\/developers\/php\/" aria-current="true">PHP<\/a>/ );
	assert.match( hook, /<span class="screen-reader-text">Menu: <\/span><span class="docs-where"><span class="docs-where-up">Build on Riff<\/span>riff_track<\/span>/ );
	assert.match( hook, /<nav class="pager" aria-label="Previous and next">/ );

	const php = pages.get( 'developers/php/index.html' );
	assert.match( php, /href="\.\.\/\.\.\/developers\/php\/" aria-current="page">PHP<\/a>/ );
	assert.match( php, /<span class="docs-where"><span class="docs-where-up">Build on Riff<\/span>PHP<\/span>/ );
	assert.equal( ( php.match( /aria-current="page"/g ) || [] ).length, 1, 'the sidebar alone' );
	// The sidebar holds its own door's pages, not the others'.
	const side = php.match( /<aside class="docs-nav".*?<\/aside>/ )[ 0 ];
	assert.match( side, /Track schema<\/a>.*Hooks<\/a>.*Built on the open web<\/a>/ );
	assert.doesNotMatch( side.replace( /<details class="door-switch">.*?<\/details>/, '' ), /music\/|built\/|verify\//, 'only Build on Riff\'s pages' );

	const dev = read( 'site/developers/index.html' );
	assert.match( dev, /<div class="brand"><a class="mark" href="https:\/\/riffpress\.com\/"><img [^>]*alt="Riff"[^>]*><\/a><a class="host" href="\.\.\/developers\/" aria-current="page">Source<\/a><\/div>/ );
	assert.doesNotMatch( dev, />Docs<\/a><\/nav>/, 'Source is the docs, so the header has no Docs as well' );

	const built = read( 'site/built/index.html' );
	assert.match( built, /class="host" href="\.\.\/developers\/" aria-current="true">Source</ );
	assert.match( built, /<span class="docs-where"><span class="docs-where-up">Contribute<\/span>How Riff is built<\/span>/ );
	assert.match( built, /<a href="\.\.\/built\/" aria-current="page">How Riff is built<\/a>/ );

	const music = read( 'site/add-music/index.html' );
	assert.match( music, /<a href="\.\.\/add-music\/" aria-current="page">Add your music<\/a>/ );
	assert.match( music, /<span class="docs-where-up">Use Riff<\/span>Add your music/ );
	// Outside every door: no sidebar, and the footer marks it.
	const a11y = read( 'site/accessibility/index.html' );
	assert.doesNotMatch( a11y, /docs-nav/ );
	assert.match( a11y, /<a href="\.\.\/accessibility\/" aria-current="page">Accessibility<\/a>/ );
	assert.doesNotMatch( read( 'site/404.html' ), /aria-current/ );
} );

test( 'the lessons and the hooks have previous and next, in their order, and the open web is one page', () => {
	const pages = generated();
	assert.doesNotMatch( read( 'site/add-music/index.html' ), /rel="prev"/ );
	assert.match( read( 'site/add-music/index.html' ), /<a rel="next" href="\.\.\/developers\/music\/"><span class="pager-dir">Next<\/span> <span class="pager-name">Your music<\/span>/ );
	const music = pages.get( 'developers/music/index.html' );
	assert.match( music, /<a rel="prev" href="\.\.\/\.\.\/add-music\/">/ );
	assert.doesNotMatch( pages.get( 'developers/sign-in/index.html' ), /rel="next"/, 'the last lesson' );
	// The guides are not a sequence.
	assert.doesNotMatch( pages.get( 'developers/extensions/index.html' ), /class="pager"/ );
	// Every feature a section of the one page, none a page of its own.
	assert.deepEqual( [ ...pages.keys() ].filter( ( f ) => f.startsWith( 'web/' ) ), [ 'web/index.html' ] );
	const web = pages.get( 'web/index.html' );
	assert.match( web, /<section class="feature"><h3 id="media-session" class="is-toc-heading">/ );
	assert.match( web, /href="\.\.\/web\/" aria-current="page">Built on the open web/ );
	// A PHP hook's neighbours are PHP hooks.
	const isPhp = ( h ) => /php\/" aria-current="true">PHP</.test( h );
	const php = [ ...pages ].filter( ( [ f, h ] ) => f.startsWith( 'developers/hooks/riff' ) && isPhp( h ) );
	assert.ok( php.length > 10 );
	for ( const [ file, html ] of php ) {
		for ( const m of html.matchAll( /rel="(?:prev|next)" href="\.\.\/([^/]+)\/"/g ) ) {
			assert.ok( isPhp( pages.get( `developers/hooks/${ m[ 1 ] }/index.html` ) ), `${ file } -> ${ m[ 1 ] }` );
		}
	}
} );

test( 'titles name the host, Riff Source', () => {
	assert.match( read( 'site/built/index.html' ), /<title>How Riff is built \| Riff Source<\/title>/ );
	assert.match( read( 'site/download/index.html' ), /<title>Download \| Riff Source<\/title>/ );
	assert.match( read( 'site/developers/index.html' ), /<title>Riff Source<\/title>/ );
	for ( const [ file, html ] of generated() ) {
		assert.match( html, /<title>[^<|]+ \| Riff Source<\/title>/, file );
	}
} );

test( 'stamping keeps the page body, mends a drifted region, and fails a page it cannot place', () => {
	const page = read( 'site/download/index.html' );
	assert.equal( nav.stamp( page, 'download/index.html' ).html, page, 'already current' );
	const drifted = page.replace( '>Download</a>', '>Get it</a>' ).replace( '<title>Download | Riff</title>', '<title>Download | RiffPress</title>' );
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

test( 'moved to the host, the navigation links relative to each page and leads somewhere', () => {
	const SITE = 'https://riffpress.com/';
	const DEV = 'https://source.riffpress.com/';
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
		write( `${ node.href }index.html`, `<!doctype html><html><head></head><body>${ nav.header( ctx, up ) }${ nav.sectionBar( ctx, up ) }<main id="main">${ node.door ? nav.doorPages( node, up ) : '' }${ node.root ? nav.doorList( up ) : '' }${ nav.pager( ...nav.siblings( ctx, up ) ) }</main>${ nav.footer( ctx, up ) }</body></html>` );
	}
	write( 'brand/wordmark-ink.svg', '<svg/>' );
	write( 'web/web.css', '' );
	const { problems } = split( { out, dev, site: SITE, developers: DEV } );
	assert.deepEqual( problems, [] );

	const php = fs.readFileSync( path.join( dev, 'php', 'index.html' ), 'utf8' );
	// The header: the wordmark to riffpress.com, Source to this host's home, and current.
	assert.match( php, /class="mark" href="https:\/\/riffpress\.com\/"><img src="\.\.\/brand\/wordmark-ink\.svg"[^>]*><\/a><a class="host" href="\.\.\/" aria-current="true">Source<\/a>/ );
	assert.match( php, /<a href="\.\.\/download\/">Download<\/a><\/nav>/ );
	// The sidebar and the Menu button stay on the host.
	assert.match( php, /href="\.\.\/php\/" aria-current="page">PHP<\/a>.*href="\.\.\/web\/">Built on the open web/ );
	assert.match( php, /<span class="docs-where"><span class="docs-where-up">Build on Riff<\/span>PHP<\/span>/ );
	// The footer's pages moved with it.
	assert.match( php, /<a href="\.\.\/accessibility\/">Accessibility<\/a>/ );
	const home = fs.readFileSync( path.join( dev, 'index.html' ), 'utf8' );
	assert.match( home, /class="host" href="\.\/" aria-current="page"/ );
	assert.match( home, /<h2><a href="use\/">Use Riff<\/a><\/h2>/ );
	assert.match( fs.readFileSync( path.join( dev, 'build', 'index.html' ), 'utf8' ), /<li><a href="\.\.\/php\/">PHP<\/a><span>/ );
	assert.match( fs.readFileSync( path.join( dev, 'music', 'index.html' ), 'utf8' ), /rel="prev" href="\.\.\/add-music\/"/ );

	const built = fs.readFileSync( path.join( dev, 'built', 'index.html' ), 'utf8' );
	assert.match( built, /class="host" href="\.\.\/" aria-current="true"/ );
	assert.match( built, /<a href="\.\.\/download\/">Download<\/a><\/nav>/ );
	assert.match( built, /<a href="\.\.\/built\/" aria-current="page">How Riff is built/ );
	// Search reads an index of every page, written beside them.
	const index = JSON.parse( fs.readFileSync( path.join( dev, 'search.json' ), 'utf8' ) );
	assert.ok( index.some( ( p ) => p.u === 'php/' && p.d === 'Build on Riff' ) );
} );
