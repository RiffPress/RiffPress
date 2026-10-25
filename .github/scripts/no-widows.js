#!/usr/bin/env node
/**
 * No lone last word on a line: in every paragraph, heading, list item, caption and definition of
 * the built site, the last two words are joined by a no-break space, so no browser can leave the
 * last word on a line of its own. The stylesheets' text-wrap: pretty and balance do the rest of the
 * shaping where browsers have them; this is the floor under them. Run by the Pages workflow on the
 * assembled site, so the sources stay as written. Text inside <pre>, <code>, <kbd> and <script>
 * is left alone, and a block of fewer than three words is too.
 *
 * Usage: node .github/scripts/no-widows.js <dir>
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const BLOCKS = /<(p|h[1-4]|li|figcaption|dd|dt|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const KEEP = /<(pre|code|kbd|script|style|svg)\b[\s\S]*?<\/\1>/gi;

// The block's inner HTML with its last two words joined, where its text has three words or more.
function bind( inner ) {
	// Text only, with tags (and anything that must not change) masked to same-length runs.
	const masked = inner.replace( KEEP, ( m ) => '\u0000'.repeat( m.length ) ).replace( /<[^>]*>/g, ( m ) => '\u0000'.repeat( m.length ) );
	const words = masked.replace( /\u0000/g, '' ).trim().split( /\s+/ );
	if ( words.length < 3 ) {
		return inner;
	}
	// The last run of plain spaces between two words, outside any tag.
	for ( let i = masked.length - 1; i > 0; i-- ) {
		if ( masked[ i ] === ' ' && /\S/.test( masked.slice( i + 1 ).replace( /\u0000/g, '' ) ) && /\S/.test( masked.slice( 0, i ).replace( /\u0000/g, '' ) ) ) {
			// Only between two words: the run must not be the last thing in the block.
			let j = i;
			while ( j > 0 && masked[ j - 1 ] === ' ' ) {
				j--;
			}
			return inner.slice( 0, j ) + '&#160;' + inner.slice( i + 1 );
		}
	}
	return inner;
}

function widowless( html ) {
	return html.replace( BLOCKS, ( whole, tag, inner ) => {
		const open = whole.slice( 0, whole.indexOf( '>' ) + 1 );
		return `${ open }${ bind( inner ) }</${ tag }>`;
	} );
}

if ( require.main === module ) {
	const dir = process.argv[ 2 ];
	if ( ! dir ) {
		process.stderr.write( 'Usage: no-widows.js <dir>\n' );
		process.exit( 1 );
	}
	const walk = ( d ) =>
		fs.readdirSync( d, { withFileTypes: true } ).flatMap( ( e ) =>
			e.isDirectory() ? walk( path.join( d, e.name ) ) : e.name.endsWith( '.html' ) ? [ path.join( d, e.name ) ] : []
		);
	let changed = 0;
	for ( const file of walk( dir ) ) {
		const html = fs.readFileSync( file, 'utf8' );
		const out = widowless( html );
		if ( out !== html ) {
			fs.writeFileSync( file, out );
			changed++;
		}
	}
	process.stdout.write( `no-widows: ${ changed } pages\n` );
}

module.exports = { widowless, bind };
