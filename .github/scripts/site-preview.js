#!/usr/bin/env node
/**
 * Readies a pull request's site for its preview: fills the placeholders the Pages workflow fills
 * for the live site ({{pages_url}}, {{version}}, {{stable}}, {{commit}}) with the preview's own,
 * so its "Try the demo" opens the pull request's Playground, and keeps it out of search engines.
 * Runs from the base branch on files the pull request built, so it only reads and rewrites text:
 * it follows no links and runs nothing from them.
 *
 * Usage: node .github/scripts/site-preview.js <dir> <base-url> <version> <stable> <commit>
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const [ dir, base, version, stable, commit ] = process.argv.slice( 2 );
if ( ! dir || ! /^https:\/\/[a-z0-9.-]+\/$/.test( base || '' ) || ! /^[0-9][0-9A-Za-z.-]*$/.test( version || '' ) || ! /^[0-9][0-9A-Za-z.-]*$/.test( stable || '' ) || ! /^[0-9a-f]{40}$/.test( commit || '' ) ) {
	process.stderr.write( 'Usage: site-preview.js <dir> <https://host/> <version> <stable> <40-hex commit>\n' );
	process.exit( 1 );
}

const texts = ( from ) =>
	fs.readdirSync( from, { withFileTypes: true } ).flatMap( ( entry ) => {
		const file = path.join( from, entry.name );
		if ( entry.isSymbolicLink() ) {
			throw new Error( `refusing a link: ${ file }` );
		}
		if ( entry.isDirectory() ) {
			return texts( file );
		}
		return /\.(html|xml|txt)$/.test( entry.name ) ? [ file ] : [];
	} );

let left = 0;
for ( const file of texts( dir ) ) {
	let text = fs.readFileSync( file, 'utf8' );
	if ( stable === version ) {
		// While the two agree there is no older release to offer, as on the live site.
		text = text.replace( /^.*class="fine stable".*\n/m, '' );
	}
	text = text
		.replaceAll( '{{pages_url}}', base )
		.replaceAll( '{{version}}', version )
		.replaceAll( '{{stable}}', stable )
		.replaceAll( '{{commit}}', commit );
	left += ( text.match( /\{\{[a-z_]+\}\}/g ) || [] ).length;
	fs.writeFileSync( file, text );
}
// A preview is not the site: nothing should index it.
fs.writeFileSync( path.join( dir, 'robots.txt' ), 'User-agent: *\nDisallow: /\n' );
fs.writeFileSync( path.join( dir, '_headers' ), '/*\n  X-Robots-Tag: noindex\n' );
if ( left ) {
	process.stderr.write( `${ left } placeholder(s) left unfilled\n` );
	process.exit( 1 );
}
process.stdout.write( `preview ready for ${ base }\n` );
