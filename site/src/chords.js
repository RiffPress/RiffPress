/**
 * The strings as a guitar's: the top five strings of standard tuning, and the chord shapes a
 * guitarist learns first, fretted on them. Frets are given for the strings top to bottom as the
 * site draws them, high E first, then B, G, D and A; `null` is a string the shape does not play,
 * which is muted under the fretting hand. .github/scripts/chords.test.js checks every shape sounds
 * only its chord's notes, with its root and third.
 */

// The open strings, top to bottom as drawn: E4, B3, G3, D3, A2 (hertz, A4 = 440).
export const OPEN = [ 329.63, 246.94, 196.0, 146.83, 110.0 ];

// Standard shapes, written as a guitarist writes them, low A to high E ("x" muted), on the five
// strings from A up: so C is x32010 on six strings, 32010 here.
const SHAPES = {
	C: '32010',
	Cm: '35543',
	C7: '32310',
	Cm7: '35343',
	D: 'x0232',
	Dm: 'x0231',
	D7: 'x0212',
	Dm7: 'x0211',
	E: '22100',
	Em: '22000',
	E7: '20100',
	Em7: '22030',
	F: '33211',
	Fm: '33111',
	F7: '31211',
	Fm7: '31111',
	G: '20003',
	Gm: '55333',
	G7: '20001',
	Gm7: '53333',
	A: '02220',
	Am: '02210',
	A7: '02020',
	Am7: '02010',
	B: '24442',
	Bm: '24432',
	B7: '21202',
	Bm7: '20202',
};

// A chord's frets for the strings as drawn, high E first: null for a muted string.
export function frets( name ) {
	const shape = SHAPES[ name ];
	if ( ! shape ) {
		return null;
	}
	return [ ...shape ]
		.map( ( f ) => ( f === 'x' ? null : Number( f ) ) )
		.reverse();
}

// The pitch each string sounds in the chord, high E first, or null where it is muted.
export function notes( name ) {
	const f = frets( name );
	return f ? f.map( ( fret, i ) => ( fret === null ? null : OPEN[ i ] * 2 ** ( fret / 12 ) ) ) : null;
}

// The chord a held key asks for: a letter for its major chord, Shift for minor, 7 held for the
// seventh. Anything else is no chord.
export function chordFor( letter, minor, seventh ) {
	const root = String( letter || '' ).toUpperCase();
	if ( ! /^[A-G]$/.test( root ) ) {
		return null;
	}
	const name = root + ( minor ? 'm' : '' ) + ( seventh ? '7' : '' );
	return SHAPES[ name ] ? name : null;
}

export const NAMES = Object.keys( SHAPES );
