#!/usr/bin/env node
/**
 * Builds the site's two animated pieces from site/src into site/js, which the Pages workflow
 * publishes with the rest of site/: neck.js (the strings under the global bar, with anime.js) and
 * crate.js (the demo's covers as a crate of records, which loads three.js only when it is wanted,
 * as a chunk of its own). Each is an ES module the page loads with type="module"; the page works
 * without them. The built files are committed, so the site needs no build step to deploy.
 *
 * Usage: node .github/scripts/site-js.js [--check]
 *   --check  fails if site/js is not what site/src builds to.
 */
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const esbuild = require( 'esbuild' );

const root = path.join( __dirname, '..', '..' );
const out = path.join( root, 'site', 'js' );
const check = process.argv.includes( '--check' );

const build = ( outdir ) =>
	esbuild.build( {
		entryPoints: [ 'neck', 'crate' ].map( ( n ) =>
			path.join( root, 'site', 'src', `${ n }.js` )
		),
		bundle: true,
		splitting: true,
		format: 'esm',
		minify: true,
		target: [ 'es2022' ],
		outdir,
		entryNames: '[name]',
		chunkNames: 'chunks/[name]-[hash]',
		legalComments: 'linked',
		logLevel: 'warning',
	} );

const files = ( dir ) =>
	fs.existsSync( dir )
		? fs
				.readdirSync( dir, { recursive: true } )
				.filter( ( f ) => fs.statSync( path.join( dir, f ) ).isFile() )
				.sort()
		: [];

( async () => {
	if ( ! check ) {
		fs.rmSync( out, { recursive: true, force: true } );
		await build( out );
		process.stdout.write(
			`site/js built: ${ files( out ).join( ', ' ) }\n`
		);
		return;
	}
	const tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'site-js-' ) );
	await build( tmp );
	const want = files( tmp );
	const have = files( out );
	const stale = want.filter(
		( f ) =>
			! have.includes( f ) ||
			! fs
				.readFileSync( path.join( tmp, f ) )
				.equals( fs.readFileSync( path.join( out, f ) ) )
	);
	const extra = have.filter( ( f ) => ! want.includes( f ) );
	fs.rmSync( tmp, { recursive: true, force: true } );
	if ( stale.length || extra.length ) {
		process.stderr.write(
			`site/js is not what site/src builds to (${ [ ...stale, ...extra ].join( ', ' ) }); run node .github/scripts/site-js.js\n`
		);
		process.exit( 1 );
	}
	process.stdout.write( `site/js is current (${ want.length } files)\n` );
} )();
