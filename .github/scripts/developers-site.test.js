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
const DEV = 'https://developer.riffpress.com/';

const page = ( up, body ) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${ SITE }PATH">
<link rel="stylesheet" href="${ up }web/web.css?v=abc">
<link rel="icon" href="${ up }icons/favicon.svg">
</head><body>
<a href="${ up }">Riff</a><a href="${ up }download/">Download</a><a href="${ up }developers/">Developers</a>
${ body }
<script type="module" src="${ up }js/neck.js"></script>
</body></html>`;

const site = ( extra = {} ) => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'developers-site-' ) );
	const files = {
		'index.html': page(
			'',
			'<a href="developers/php/#hooks">PHP</a><a href="web/">Web</a>'
		).replace( 'PATH', '' ),
		'download/index.html': page( '../', '' ).replace( 'PATH', 'download/' ),
		'developers/index.html': page(
			'../',
			'<a href="php/">PHP</a><a href="../web/has/">:has</a>'
		).replace( 'PATH', 'developers/' ),
		'developers/php/index.html': page(
			'../../',
			'<h2 id="hooks">Hooks</h2><a href="../../web/">Web</a><img src="../../shot.png" srcset="../../shot.png 1x, ../../icons/favicon.svg 2x">'
		).replace( 'PATH', 'developers/php/' ),
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
		'js/neck.js': '',
		'shot.png': '',
		'404.html': `<a href="${ SITE }developers/">Developers</a>`,
		'sitemap.xml': `<?xml version="1.0"?>\n<urlset>\n  <url><loc>${ SITE }</loc></url>\n  <url><loc>${ SITE }developers/php/</loc></url>\n  <url><loc>${ SITE }web/has/</loc></url>\n</urlset>\n`,
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

test( 'a link between two pages goes by way of the root, as the generated pages write them', () => {
	assert.equal( relative( '', 'php/' ), 'php/' );
	assert.equal( relative( 'php/', '' ), '../' );
	assert.equal( relative( '', '' ), './' );
	assert.equal(
		relative( 'hooks/riff_track/', 'web/web.css' ),
		'../../web/web.css'
	);
} );

test( 'moves /developers/ to the root of its host and /web/ under it, with their shared files', () => {
	const out = site();
	const dev = fs.mkdtempSync( path.join( os.tmpdir(), 'developers-out-' ) );
	const { problems } = split( { out, dev, site: SITE, developers: DEV } );
	assert.deepEqual( problems, [] );
	for ( const file of [
		'index.html',
		'php/index.html',
		'web/index.html',
		'web/has/index.html',
		'web/web.css',
		'icons/favicon.svg',
		'js/neck.js',
		'404.html',
		'robots.txt',
		'sitemap.xml',
		'_headers',
	] ) {
		assert.ok( fs.existsSync( path.join( dev, file ) ), file );
	}
	const php = read( dev, 'php/index.html' );
	assert.match(
		php,
		/rel="canonical" href="https:\/\/developer\.riffpress\.com\/php\/"/
	);
	assert.match( php, /href="\.\.\/web\/web\.css\?v=abc"/ );
	assert.match( php, /href="\.\.\/web\/">Web/ );
	assert.match( php, /href="\.\.\/">Developers/ );
	// Back on the site: its own pages and images.
	assert.match( php, /href="https:\/\/riffpress\.com\/">Riff/ );
	assert.match( php, /href="https:\/\/riffpress\.com\/download\/"/ );
	assert.match(
		php,
		/srcset="https:\/\/riffpress\.com\/shot\.png 1x, \.\.\/icons\/favicon\.svg 2x"/
	);
	assert.match( php, /content="width=device-width, initial-scale=1"/ );
	assert.match( read( dev, 'web/index.html' ), /href="\.\.\/php\/#hooks"/ );
	assert.match(
		read( dev, 'robots.txt' ),
		/Sitemap: https:\/\/developer\.riffpress\.com\/sitemap\.xml/
	);
} );

test( 'the site keeps its stylesheet, points at the new host, and redirects each old address', () => {
	const out = site();
	const dev = fs.mkdtempSync( path.join( os.tmpdir(), 'developers-out-' ) );
	split( { out, dev, site: SITE, developers: DEV } );
	assert.ok( ! fs.existsSync( path.join( out, 'developers' ) ) );
	assert.ok( ! fs.existsSync( path.join( out, 'web', 'has' ) ) );
	assert.ok( ! fs.existsSync( path.join( out, 'web', 'index.html' ) ) );
	assert.ok( fs.existsSync( path.join( out, 'web', 'web.css' ) ) );
	const index = read( out, 'index.html' );
	assert.match(
		index,
		/href="https:\/\/developer\.riffpress\.com\/php\/#hooks"/
	);
	assert.match( index, /href="https:\/\/developer\.riffpress\.com\/web\/"/ );
	assert.match( index, /href="web\/web\.css\?v=abc"/ );
	assert.match(
		read( out, '404.html' ),
		/href="https:\/\/developer\.riffpress\.com\/"/
	);
	const redirects = read( out, '_redirects' ).split( '\n' );
	assert.equal(
		redirects[ 0 ],
		'/demo https://playground.wordpress.net/ 302'
	);
	assert.ok(
		redirects.includes(
			'/developers/php/ https://developer.riffpress.com/php/ 301'
		)
	);
	assert.ok(
		redirects.includes(
			'/developers/php https://developer.riffpress.com/php/ 301'
		)
	);
	assert.ok(
		redirects.includes(
			'/web/has/ https://developer.riffpress.com/web/has/ 301'
		)
	);
	assert.equal(
		redirects.filter( Boolean ).at( -1 ),
		'/developers/* https://developer.riffpress.com/:splat 301'
	);
	// Not web/*: the stylesheet would leave with it.
	assert.ok( ! redirects.some( ( l ) => l.startsWith( '/web/*' ) ) );
	assert.match(
		read( out, 'sitemap.xml' ),
		/<loc>https:\/\/riffpress\.com\/<\/loc>/
	);
	assert.doesNotMatch( read( out, 'sitemap.xml' ), /developers|web\/has/ );
	assert.match(
		read( dev, 'sitemap.xml' ),
		/<loc>https:\/\/developer\.riffpress\.com\/php\/<\/loc>[\s\S]*<loc>https:\/\/developer\.riffpress\.com\/web\/has\/<\/loc>/
	);
} );

test( 'fails on a link, file or fragment that leads nowhere on either host', () => {
	const out = site( {
		'developers/css/index.html': page(
			'../../',
			'<a href="../php/#gone">PHP</a><a href="../nope/">Nope</a><img src="../../missing.png">'
		).replace( 'PATH', 'developers/css/' ),
	} );
	const dev = path.join(
		fs.mkdtempSync( path.join( os.tmpdir(), 'developers-out-' ) ),
		'dev'
	);
	const run = spawnSync( 'node', [ SCRIPT, out, dev, SITE, DEV ], {
		encoding: 'utf8',
	} );
	assert.equal( run.status, 1 );
	assert.match( run.stderr, /3 link\(s\) lead nowhere/ );
	assert.match( run.stderr, /\.\.\/php\/#gone \(no #gone\)/ );
	assert.match( run.stderr, /\.\.\/nope\// );
	assert.match( run.stderr, /https:\/\/riffpress\.com\/missing\.png/ );
} );

test( 'refuses addresses that are not a host and a slash, or one host for both', () => {
	const out = site();
	for ( const args of [
		[ SITE, SITE ],
		[ 'riffpress.com', DEV ],
		[ SITE, 'https://developer.riffpress.com' ],
	] ) {
		const run = spawnSync(
			'node',
			[ SCRIPT, out, path.join( out, 'x' ), ...args ],
			{ encoding: 'utf8' }
		);
		assert.equal( run.status, 1, args.join( ' ' ) );
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
		'js/neck.js': 'import"./chunks/a.js";',
	} );
	const dev = path.join(
		fs.mkdtempSync( path.join( os.tmpdir(), 'developers-out-' ) ),
		'dev'
	);
	const run = spawnSync( 'node', [ SCRIPT, out, dev, SITE, DEV ], {
		encoding: 'utf8',
	} );
	assert.ok( read( dev, 'js/index.html' ).includes( sample ) );
	assert.equal( run.status, 1 );
	assert.match( run.stderr, /4 link\(s\) lead nowhere/ );
	assert.match( run.stderr, /web\.css: \.\.\/fonts\/inter\.woff2/ );
	assert.match( run.stderr, /neck\.js: \.\/chunks\/a\.js/ );
} );
