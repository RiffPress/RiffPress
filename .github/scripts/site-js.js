#!/usr/bin/env node
/**
 * Builds the site's two animated pieces from site/src into site/js, which the Pages workflow
 * runs before it publishes site/: neck.js (the strings under the global bar, with anime.js) and
 * crate.js (the demo's covers as a crate of records, which loads three.js only when it is wanted,
 * as a chunk of its own). Each is an ES module the page loads with type="module"; the page works
 * without them. The built files are not committed: minified three.js reads as
 * misspellings to the spell check and as findings to CodeQL, and it is not ours to review.
 *
 * Usage: node .github/scripts/site-js.js
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const esbuild = require( 'esbuild' );

const root = path.join( __dirname, '..', '..' );
const out = path.join( root, 'site', 'js' );

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
	fs.rmSync( out, { recursive: true, force: true } );
	await build( out );
	process.stdout.write( `site/js built: ${ files( out ).join( ', ' ) }\n` );
} )();
