'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const { spawnSync } = require( 'child_process' );
const { split, relative } = require( './developers-site.js' );

const SCRIPT = path.join( __dirname, 'developers-site.js' );
const SITE = 'https://riffpress.com/';
const SRC = 'https://source.riffpress.com/';
const DEV = 'https://developer.riffpress.com/';

const page = ( up, body ) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${ SITE }PATH">
<link rel="stylesheet" href="${ up }web/web.css?v=abc">
<link rel="icon" href="${ up }icons/favicon.svg">
</head><body>
<a href="${ SITE }">Riff Cloud</a><a href="${ up }download/">Download</a><a href="${ up }developers/">Source</a><a href="${ up }developers/build/">Developers</a>
${ body }
<script type="module" src="${ up }js/docs.js"></script>
</body></html>`;

const site = ( extra = {} ) => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'developers-site-' ) );
	const files = {
		'download/index.html': page( '../', '' ).replace( 'PATH', 'download/' ),
		'developers/index.html': page(
			'../',
			'<a href="php/">PHP</a><a href="../web/has/">:has</a>'
		).replace( 'PATH', 'developers/' ),
		'developers/use/index.html': page( '../../', '<a href="../php/">PHP</a>' ).replace( 'PATH', 'developers/use/' ),
		'developers/build/index.html': page( '../../', '<a href="../php/">PHP</a><a href="../use/">Use</a>' ).replace( 'PATH', 'developers/build/' ),
		'developers/php/index.html': page(
			'../../',
			'<h2 id="hooks">Hooks</h2><a href="../../web/">Web</a><a href="../hooks/riff_track/">riff_track</a><img src="../../shot.png" srcset="../../shot.png 1x, ../../icons/favicon.svg 2x">'
		).replace( 'PATH', 'developers/php/' ),
		'developers/hooks/riff_track/index.html': page( '../../../', '<a href="../../php/#hooks">PHP</a>' ).replace( 'PATH', 'developers/hooks/riff_track/' ),
		'web/index.html': page(
			'../',
			'<a href="has/">:has</a><a href="../developers/php/#hooks">PHP</a>'
		).replace( 'PATH', 'web/' ),
		'web/has/index.html': page( '../../', '<a href="../">All</a>' ).replace(
			'PATH',
			'web/has/'
		),
		'web/web.css': 'body{}',
		'icons/favicon.svg': '<svg/>',
		'js/docs.js': '',
		'shot.png': '',
		'404.html': `<link rel="stylesheet" href="${ SITE }web/web.css"><a href="${ SITE }">Riff</a><a href="${ SITE }developers/">Back to the docs</a>`,
		'404-developer.html': `<link rel="stylesheet" href="${ SITE }web/web.css"><a href="${ SITE }developers/build/">Back to Build on Riff</a>`,
		'sitemap.xml': `<?xml version="1.0"?>\n<urlset>\n  <url><loc>${ SITE }</loc></url>\n  <url><loc>${ SITE }developers/build/</loc></url>\n  <url><loc>${ SITE }developers/php/</loc></url>\n  <url><loc>${ SITE }web/has/</loc></url>\n</urlset>\n`,
		_redirects: '/demo https://playground.wordpress.net/ 302\n',
		...extra,
	};
	for ( const [ name, text ] of Object.entries( files ) ) {
		fs.mkdirSync( path.dirname( path.join( dir, name ) ), {
			recursive: true,
		} );
		fs.writeFileSync( path.join( dir, name ), text );
	}
	return dir;
};
const read = ( dir, file ) => fs.readFileSync( path.join( dir, file ), 'utf8' );
const outs = () => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'developers-out-' ) );
	return { source: path.join( dir, 'source' ), developer: path.join( dir, 'developer' ) };
};
const run = ( out, dirs = outs() ) => ( {
	dirs,
	...split( {
		out,
		site: SITE,
		hosts: {
			source: { dir: dirs.source, url: SRC },
			developer: { dir: dirs.developer, url: DEV },
		},
	} ),
} );
const cli = ( out, dirs = outs() ) => spawnSync( 'node', [ SCRIPT, out, dirs.source, dirs.developer, SITE, SRC, DEV ], { encoding: 'utf8' } );

test( 'a link between two pages goes by way of the root, as the generated pages write them', () => {
	assert.equal( relative( '', 'php/' ), 'php/' );
	assert.equal( relative( 'php/', '' ), '../' );
	assert.equal( relative( '', '' ), './' );
	assert.equal(
		relative( 'hooks/riff_track/', 'web/web.css' ),
		'../../web/web.css'
	);
} );

test( 'each page goes to its host, at the host\'s root, with the shared files on both', () => {
	const { dirs, problems, moved } = run( site() );
	assert.deepEqual( problems, [] );
	assert.deepEqual( moved.developer.sort(), [ 'developers/build/', 'developers/hooks/riff_track/', 'developers/php/' ] );
	for ( const file of [ 'index.html', 'use/index.html', 'download/index.html', 'web/index.html', 'web/has/index.html' ] ) {
		assert.ok( fs.existsSync( path.join( dirs.source, file ) ), `source: ${ file }` );
		assert.ok( ! fs.existsSync( path.join( dirs.developer, file ) ) || file === 'index.html', `not developer: ${ file }` );
	}
	for ( const file of [ 'index.html', 'php/index.html', 'hooks/riff_track/index.html', 'shot.png' ] ) {
		assert.ok( fs.existsSync( path.join( dirs.developer, file ) ), `developer: ${ file }` );
	}
	assert.ok( ! fs.existsSync( path.join( dirs.source, 'php' ) ) );
	assert.ok( ! fs.existsSync( path.join( dirs.source, 'build' ) ) );
	for ( const dir of Object.values( dirs ) ) {
		for ( const file of [ 'web/web.css', 'icons/favicon.svg', 'js/docs.js', '404.html', 'robots.txt', 'sitemap.xml', 'search.json', '_headers', '_redirects' ] ) {
			assert.ok( fs.existsSync( path.join( dir, file ) ), `${ dir }: ${ file }` );
		}
	}
	const php = read( dirs.developer, 'php/index.html' );
	assert.match( php, /rel="canonical" href="https:\/\/developer\.riffpress\.com\/php\/"/ );
	assert.match( php, /href="\.\.\/web\/web\.css\?v=abc"/ );
	assert.match( php, /href="\.\.\/">Developers/ );
	assert.match( php, /href="\.\.\/hooks\/riff_track\/">riff_track/ );
	// A page on the other host is written out in full.
	assert.match( php, /href="https:\/\/source\.riffpress\.com\/web\/">Web/ );
	assert.match( php, /href="https:\/\/source\.riffpress\.com\/download\/"/ );
	assert.match( php, /href="https:\/\/source\.riffpress\.com\/">Source/ );
	// The images a page shows go with it.
	assert.match( php, /srcset="\.\.\/shot\.png 1x, \.\.\/icons\/favicon\.svg 2x"/ );
	// riffpress.com's home, written out in full, stays as it is.
	assert.match( php, /href="https:\/\/riffpress\.com\/">Riff Cloud/ );
	assert.match( php, /content="width=device-width, initial-scale=1"/ );
	assert.match( read( dirs.source, 'web/index.html' ), /href="https:\/\/developer\.riffpress\.com\/php\/#hooks"/ );
	assert.match( read( dirs.source, 'index.html' ), /href="https:\/\/developer\.riffpress\.com\/">Developers/ );
	assert.match( read( dirs.developer, 'index.html' ), /href="https:\/\/source\.riffpress\.com\/use\/">Use/ );
	assert.match( read( dirs.source, 'robots.txt' ), /Sitemap: https:\/\/source\.riffpress\.com\/sitemap\.xml/ );
	assert.match( read( dirs.developer, 'robots.txt' ), /Sitemap: https:\/\/developer\.riffpress\.com\/sitemap\.xml/ );
	// Each build says which it is, so a deploy can tell what a host serves.
	assert.match( read( dirs.source, '_headers' ), /^\/\*\n {2}X-Riff-Site: source\n/ );
	assert.match( read( dirs.developer, '_headers' ), /^\/\*\n {2}X-Riff-Site: developer\n/ );
} );

test( 'every address the one host served before the split still leads to its page', () => {
	const { dirs, redirects } = run( site() );
	// Source sends what moved to the developer host: a folder whole, Build on Riff to its root.
	assert.ok( redirects.source.includes( '/php/* https://developer.riffpress.com/php/:splat 301' ) );
	assert.ok( redirects.source.includes( '/php https://developer.riffpress.com/php/ 301' ) );
	assert.ok( redirects.source.includes( '/hooks/* https://developer.riffpress.com/hooks/:splat 301' ) );
	assert.ok( redirects.source.includes( '/build/ https://developer.riffpress.com/ 301' ) );
	assert.ok( redirects.source.includes( '/build https://developer.riffpress.com/ 301' ) );
	assert.ok( redirects.developer.includes( '/build/ https://developer.riffpress.com/ 301' ), 'and on its own host' );
	// The developer host sends what stays on Source, the demo's files with it. web/ keeps its
	// stylesheet there, so it goes page by page rather than whole.
	assert.ok( redirects.developer.includes( '/download/* https://source.riffpress.com/download/:splat 301' ) );
	assert.ok( redirects.developer.includes( '/use/* https://source.riffpress.com/use/:splat 301' ) );
	assert.ok( redirects.developer.includes( '/demo/* https://source.riffpress.com/demo/:splat 301' ) );
	assert.ok( redirects.developer.includes( '/riff.zip https://source.riffpress.com/riff.zip 301' ) );
	assert.ok( redirects.developer.includes( '/web/has/ https://source.riffpress.com/web/has/ 301' ) );
	assert.ok( ! redirects.developer.some( ( r ) => r.startsWith( '/web/*' ) ), 'web/web.css stays served' );
	// Every page answers on both hosts at the address the one host gave it: served, or sent on.
	const rules = ( key ) => redirects[ key ].map( ( r ) => r.split( ' ' )[ 0 ] );
	for ( const old of [ '/', '/use/', '/download/', '/web/', '/web/has/', '/php/', '/hooks/riff_track/', '/build/' ] ) {
		for ( const key of [ 'source', 'developer' ] ) {
			const served = fs.existsSync( path.join( dirs[ key ], old, 'index.html' ) );
			const sent = rules( key ).some( ( r ) => r === old || ( r.endsWith( '/*' ) && old.startsWith( r.slice( 0, -1 ) ) ) );
			assert.ok( served !== sent, `${ key }${ old }: ${ served ? 'served' : 'not served' } and ${ sent ? 'sent on' : 'not sent on' }` );
		}
	}
	// Neither host's home is sent anywhere, and nothing is sent to a host that serves it.
	for ( const key of [ 'source', 'developer' ] ) {
		assert.ok( ! redirects[ key ].some( ( r ) => /^\/ |^\/\* /.test( r ) ), key );
		assert.equal( read( dirs[ key ], '_redirects' ), redirects[ key ].join( '\n' ) + '\n' );
		for ( const r of redirects[ key ] ) {
			const from = r.split( ' ' )[ 0 ].replace( /\*$/, '' );
			assert.ok( ! fs.existsSync( path.join( dirs[ key ], from, 'index.html' ) ), `${ key } serves ${ from } and sends it away` );
		}
	}
} );

test( 'each host has its own 404 and sitemap, and the assembled site is only read', () => {
	const out = site();
	const before = read( out, '_redirects' );
	const { dirs } = run( out );
	assert.ok( fs.existsSync( path.join( out, 'developers', 'index.html' ) ) );
	assert.equal( read( out, '_redirects' ), before, 'riffpress.com\'s repository carries its redirects' );
	// Each 404 is drawn with its host's files, and links to its host's home.
	const missed = read( dirs.source, '404.html' );
	assert.match( missed, /href="https:\/\/source\.riffpress\.com\/web\/web\.css"/ );
	assert.match( missed, /href="https:\/\/source\.riffpress\.com\/">Back to the docs/ );
	assert.match( missed, /href="https:\/\/riffpress\.com\/">Riff/ );
	const lost = read( dirs.developer, '404.html' );
	assert.match( lost, /href="https:\/\/developer\.riffpress\.com\/web\/web\.css"/ );
	assert.match( lost, /href="https:\/\/developer\.riffpress\.com\/">Back to Build on Riff/ );
	// Each host's pages, at their new addresses, and not riffpress.com's home.
	const src = read( dirs.source, 'sitemap.xml' );
	assert.match( src, /<loc>https:\/\/source\.riffpress\.com\/web\/has\/<\/loc>/ );
	assert.doesNotMatch( src, /php|developer\.riffpress|riffpress\.com\/<\/loc>/ );
	const dev = read( dirs.developer, 'sitemap.xml' );
	assert.match( dev, /<loc>https:\/\/developer\.riffpress\.com\/<\/loc><\/url>\n {2}<url><loc>https:\/\/developer\.riffpress\.com\/php\/<\/loc>/ );
	assert.doesNotMatch( dev, /source\.riffpress|web\/has/ );
} );

test( 'fails on a link, file or fragment that leads nowhere on either host, or off them to riffpress.com', () => {
	const out = site( {
		'developers/css/index.html': page(
			'../../',
			'<a href="../php/#gone">PHP</a><a href="../nope/">Nope</a><img src="../../missing.png"><a href="../../">Home</a><a href="https://riffpress.com/pricing/">Pricing</a><a href="../../web/#gone">Web</a>'
		).replace( 'PATH', 'developers/css/' ),
	} );
	const result = cli( out );
	assert.equal( result.status, 1 );
	assert.match( result.stderr, /6 link\(s\) lead nowhere/ );
	assert.match( result.stderr, /\.\.\/php\/#gone \(no #gone\)/ );
	// A page under developers/ that no entry names is Source's, and checked there, as a link to the
	// other host is.
	assert.match( result.stderr, /css\/index\.html: https:\/\/source\.riffpress\.com\/nope\// );
	assert.match( result.stderr, /https:\/\/source\.riffpress\.com\/web\/#gone \(no #gone\)/ );
	// A relative link to a file or page neither host serves, and anything on riffpress.com but its
	// home, which isn't built from here.
	assert.match( result.stderr, /css\/index\.html: https:\/\/riffpress\.com\/missing\.png/ );
	assert.match( result.stderr, /css\/index\.html: https:\/\/riffpress\.com\/\n/ );
	assert.match( result.stderr, /css\/index\.html: https:\/\/riffpress\.com\/pricing\// );
} );

test( 'refuses addresses that are not a host and a slash, or one address for two', () => {
	const out = site();
	for ( const args of [
		[ SITE, SRC, SRC ],
		[ SITE, SITE, DEV ],
		[ 'riffpress.com', SRC, DEV ],
		[ SITE, 'https://source.riffpress.com', DEV ],
	] ) {
		const result = spawnSync(
			'node',
			[ SCRIPT, out, path.join( out, 'x' ), path.join( out, 'y' ), ...args ],
			{ encoding: 'utf8' }
		);
		assert.equal( result.status, 1, args.join( ' ' ) );
	}
} );

test( 'leaves a code sample alone, and reads stylesheets and modules for the files they need', () => {
	const sample =
		'<pre><code>&lt;a href="https://riffpress.com/developers/php/"&gt;</code></pre>';
	const out = site( {
		'developers/js/index.html': page( '../../', sample ).replace(
			'PATH',
			'developers/js/'
		),
		'web/web.css': 'body{font-family:x;src:url(../fonts/inter.woff2)}',
		'js/docs.js': 'import"./chunks/a.js";',
	} );
	const dirs = outs();
	const result = cli( out, dirs );
	assert.ok( read( dirs.source, 'js/index.html' ).includes( sample ) );
	assert.equal( result.status, 1 );
	// Each host has its own copy of the shared files, so each fails.
	assert.match( result.stderr, /4 link\(s\) lead nowhere/ );
	assert.match( result.stderr, /source\/web\/web\.css: \.\.\/fonts\/inter\.woff2/ );
	assert.match( result.stderr, /developer\/js\/docs\.js: \.\/chunks\/a\.js/ );
} );

test( 'search indexes each page by its title and door, and the headings it does not share with every other page', () => {
	const { searchIndex } = require( './developers-site.js' );
	const dev = fs.mkdtempSync( path.join( os.tmpdir(), 'search-' ) );
	const page = ( dir, title, door, body, host = 'Riff Developer' ) => {
		fs.mkdirSync( path.join( dev, dir ), { recursive: true } );
		fs.writeFileSync( path.join( dev, dir, 'index.html' ), `<title>${ title } | ${ host }</title><meta name="description" content="About ${ title }."><span class="docs-where"><span class="docs-where-up">${ door }</span>${ title }</span><main>${ body }</main>` );
	};
	for ( const name of [ 'riff_a', 'riff_b', 'riff_c', 'riff_d' ] ) {
		page( `hooks/${ name }`, name, 'Build on Riff', '<h2 id="parameters">Parameters</h2>' );
	}
	page( 'web', 'Built on the open web', 'Contribute', '<h2 id="group-media">Media</h2><section class="feature"><h3 id="media-session">Media Session</h3></section>', 'Riff Source' );
	const index = searchIndex( dev );
	assert.deepEqual( index.find( ( p ) => p.u === 'web/' ), { u: 'web/', t: 'Built on the open web', d: 'Contribute', s: 'About Built on the open web.', h: [ [ 'group-media', 'Media' ], [ 'media-session', 'Media Session' ] ] } );
	assert.equal( index.find( ( p ) => p.u === 'hooks/riff_a/' ).t, 'riff_a', 'the host\'s name is left off' );
	assert.deepEqual( index.find( ( p ) => p.u === 'hooks/riff_a/' ).h, [], 'a heading on more than three pages is left out' );
} );
