/**
 * Every pair of design tokens the player and the Listen app set text or a control in keeps the
 * contrast WCAG 2.2 asks: 4.5:1 for text, 3:1 for a control's outline or a focus ring. A change
 * to tokens.css or to standalone mode's dark tokens cannot regress it quietly.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const assert = require( 'node:assert/strict' );
const { test } = require( 'node:test' );

const ROOT = path.resolve( __dirname, '..', '..' );
const read = ( file ) => fs.readFileSync( path.join( ROOT, file ), 'utf8' );

// The tokens, as written: --name: value; from tokens.css, and standalone mode's from its PHP.
function tokens() {
	const out = {};
	for ( const m of read( 'plugins/riff/assets/tokens.css' ).matchAll( /(--riff-[a-z0-9-]+):\s*([^;]+);/g ) ) {
		out[ m[ 1 ] ] = m[ 2 ].trim();
	}
	const dark = {};
	for ( const m of read( 'plugins/riff/features/listen/class-standalone.php' ).matchAll( /'(--riff-app-[a-z-]+)'\s*=>\s*'([^']+)'/g ) ) {
		dark[ m[ 1 ] ] = m[ 2 ];
	}
	const bg = read( 'plugins/riff/features/listen/class-standalone.php' ).match( /BACKGROUND = '(#[0-9a-f]{6})'/i );
	dark[ '--riff-app-bg' ] = dark[ '--riff-app-bg' ] === 'self::BACKGROUND' || ! dark[ '--riff-app-bg' ] ? bg[ 1 ] : dark[ '--riff-app-bg' ];
	return { light: out, dark: { ...out, ...dark } };
}

// A colour as [r, g, b, a] from #rgb, #rrggbb, rgb(r g b / a) or rgb(r, g, b).
function parse( value ) {
	let m = value.match( /^#([0-9a-f]{6})$/i );
	if ( m ) {
		return [ 0, 2, 4 ].map( ( i ) => parseInt( m[ 1 ].slice( i, i + 2 ), 16 ) ).concat( 1 );
	}
	m = value.match( /^#([0-9a-f]{3})$/i );
	if ( m ) {
		return [ ...m[ 1 ] ].map( ( c ) => parseInt( c + c, 16 ) ).concat( 1 );
	}
	m = value.match( /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/ );
	if ( m ) {
		return [ Number( m[ 1 ] ), Number( m[ 2 ] ), Number( m[ 3 ] ), m[ 4 ] === undefined ? 1 : Number( m[ 4 ] ) ];
	}
	throw new Error( `cannot parse colour ${ value }` );
}

// The colour seen: a translucent one laid over its background.
const over = ( fg, bg ) => fg.slice( 0, 3 ).map( ( c, i ) => c * fg[ 3 ] + bg[ i ] * ( 1 - fg[ 3 ] ) );

function luminance( [ r, g, b ] ) {
	const lin = ( c ) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : ( ( s + 0.055 ) / 1.055 ) ** 2.4;
	};
	return 0.2126 * lin( r ) + 0.7152 * lin( g ) + 0.0722 * lin( b );
}

function contrast( fgValue, bgValue ) {
	const bg = parse( bgValue ).slice( 0, 3 );
	const fg = over( parse( fgValue ), bg );
	const [ a, b ] = [ luminance( fg ), luminance( bg ) ].sort( ( x, y ) => y - x );
	return ( a + 0.05 ) / ( b + 0.05 );
}

// What is drawn in what, and the least each may be. Text is 4.5:1 (1.4.3); a control's edge, a
// focus ring or a mark that carries meaning is 3:1 (1.4.11).
const PAIRS = [
	[ 'player', '--riff-fg', '--riff-bg', 4.5, 'the title on the bar' ],
	[ 'player', '--riff-fg-2', '--riff-bg', 4.5, 'the artist under it' ],
	[ 'player', '--riff-fg-3', '--riff-bg', 3, 'a time, a count: small print that is never the only copy' ],
	[ 'player', '--riff-accent', '--riff-bg', 4.5, 'the quality pill and the filament' ],
	[ 'player', '--riff-fg', '--riff-surface', 4.5, 'text on a menu' ],
	[ 'player', '--riff-fg-2', '--riff-surface', 4.5, 'secondary text on a menu' ],
	[ 'player', '--riff-accent', '--riff-surface', 4.5, 'the accent on a menu' ],
	[ 'app', '--riff-app-ink', '--riff-app-bg', 4.5, 'a title in the Listen app' ],
	[ 'app', '--riff-app-ink-2', '--riff-app-bg', 4.5, 'a card\'s second line' ],
	[ 'app', '--riff-app-ink', '--riff-app-surface', 4.5, 'text on a card' ],
	[ 'app', '--riff-app-ink-2', '--riff-app-surface', 4.5, 'secondary text on a card' ],
	[ 'app', '--riff-app-accent', '--riff-app-bg', 4.5, 'a link, the current chip' ],
	[ 'app', '--riff-app-accent', '--riff-app-surface', 4.5, 'a link on a card' ],
	[ 'app', '--riff-app-on-accent', '--riff-app-accent', 4.5, 'the words on a Play pill' ],
	[ 'app', '--riff-app-accent', '--riff-app-accent-tint', 4.5, 'the accent on its tint' ],
	[ 'app', '--riff-app-accent-deep', '--riff-app-bg', 4.5, 'a pressed pill' ],
	[ 'app', '--riff-app-line', '--riff-app-bg', 1.2, 'a hairline, decoration only' ],
	[ 'dark', '--riff-app-ink', '--riff-app-bg', 4.5, 'a title in standalone mode' ],
	[ 'dark', '--riff-app-accent', '--riff-app-bg', 4.5, 'the accent in standalone mode' ],
];

test( 'every token pair the player and the app draw text or a control in keeps its contrast', () => {
	const { light, dark } = tokens();
	const failures = [];
	for ( const [ where, fg, bg, least, what ] of PAIRS ) {
		const set = where === 'dark' ? dark : light;
		assert.ok( set[ fg ] && set[ bg ], `${ fg } and ${ bg } are defined for ${ where }` );
		const ratio = contrast( set[ fg ], set[ bg ] );
		if ( ratio < least ) {
			failures.push( `${ where }: ${ fg } on ${ bg } is ${ ratio.toFixed( 2 ) }:1, under ${ least }:1 (${ what })` );
		}
	}
	assert.deepEqual( failures, [] );
} );

test( 'the contrast arithmetic is WCAG\'s', () => {
	assert.equal( contrast( '#000', '#fff' ).toFixed( 0 ), '21' );
	assert.equal( contrast( '#767676', '#ffffff' ).toFixed( 2 ), '4.54' );
	// Half white over black is 127.5, a shade between two bytes: within a hundredth of either.
	assert.ok( Math.abs( contrast( 'rgb(255 255 255 / 0.5)', '#000000' ) - contrast( '#808080', '#000000' ) ) < 0.05 );
} );
