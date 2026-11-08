#!/usr/bin/env node
/**
 * Source's share of riffpress.com's look: the tokens and the two families, copied byte for byte from
 * riffpress-com's site/, as its network plugin copies them (check-site.py there). site/tokens.css
 * is the one set of tokens; web.css uses their names and sets none of its own over them.
 *
 * site/brand/shared.json pins each copy's SHA-256, so a copy edited here instead of there fails the
 * tests (tokens.test.js). To take a new version, copy it over from a riffpress-com checkout, which
 * rewrites the pins; to see whether the copies still match it, check against it.
 *
 * Usage:
 *   node .github/scripts/tokens.js --copy  --from <riffpress-com>/site
 *   node .github/scripts/tokens.js --check --from <riffpress-com>/site
 *   node .github/scripts/tokens.js --check                          the copies against their pins
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const crypto = require( 'node:crypto' );

const ROOT = path.resolve( __dirname, '..', '..' );
const SITE = path.join( ROOT, 'site' );
const PINS = path.join( SITE, 'brand', 'shared.json' );
// What Source takes from riffpress-com's site/, at the same paths under site/.
const COPIES = [
	'tokens.css',
	'fonts/schibsted-grotesk.woff2',
	'fonts/schibsted-grotesk-OFL.txt',
	'fonts/eb-garamond.woff2',
	'fonts/eb-garamond-OFL.txt',
];

const sha = ( file ) => crypto.createHash( 'sha256' ).update( fs.readFileSync( file ) ).digest( 'hex' );

/**
 * The copies that no longer match their pins, or, given riffpress-com's site/, that copy.
 *
 * @param {string} from riffpress-com's site/, or nothing to check against the pins.
 * @return {string[]} Problems.
 */
function stale( from = '' ) {
	const pins = JSON.parse( fs.readFileSync( PINS, 'utf8' ) ).files;
	const problems = [];
	for ( const file of COPIES ) {
		const mine = path.join( SITE, file );
		if ( ! fs.existsSync( mine ) ) {
			problems.push( `site/${ file } is missing; copy it from riffpress-com's site/` );
			continue;
		}
		if ( pins[ file ] !== sha( mine ) ) {
			problems.push( `site/${ file } is not the copy site/brand/shared.json pins; change it in riffpress-com and copy it over with --copy` );
		}
		if ( from && ( ! fs.existsSync( path.join( from, file ) ) || ! fs.readFileSync( path.join( from, file ) ).equals( fs.readFileSync( mine ) ) ) ) {
			problems.push( `site/${ file } is not a copy of ${ path.join( from, file ) }; copy it over with --copy` );
		}
	}
	return problems;
}

/**
 * Copies each file over from riffpress-com's site/ and pins it.
 *
 * @param {string} from riffpress-com's site/.
 */
function copy( from ) {
	const files = {};
	for ( const file of COPIES ) {
		fs.mkdirSync( path.dirname( path.join( SITE, file ) ), { recursive: true } );
		fs.copyFileSync( path.join( from, file ), path.join( SITE, file ) );
		files[ file ] = sha( path.join( SITE, file ) );
	}
	const pins = {
		$comment: 'The SHA-256 of each file Source copies from riffpress-com\'s site/, written by .github/scripts/tokens.js --copy. Change the files there, then copy them over; never edit them here.',
		from: 'riffpress-com, site/',
		files,
	};
	fs.writeFileSync( PINS, JSON.stringify( pins, null, '\t' ) + '\n' );
}

function main() {
	const at = process.argv.indexOf( '--from' );
	const from = at > -1 ? path.resolve( process.argv[ at + 1 ] || '' ) : '';
	if ( process.argv.includes( '--copy' ) ) {
		if ( ! from ) {
			console.error( 'Usage: tokens.js --copy --from <riffpress-com>/site' );
			process.exit( 1 );
		}
		copy( from );
		console.log( `Copied ${ COPIES.join( ', ' ) } from ${ from }` );
		return;
	}
	const problems = stale( from );
	if ( problems.length ) {
		problems.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
	console.log( from ? `site/ holds riffpress.com's ${ COPIES.length } shared files as ${ from } has them` : `site/ holds the ${ COPIES.length } shared files site/brand/shared.json pins` );
}

if ( require.main === module ) {
	main();
}

module.exports = { COPIES, stale };
