/* How the album is pressed, from its whole track list on the library route, asked for once an album
 * and kept (record.js). A release of one or two tracks and ten minutes at most is a 7-inch single
 * at 45, a track a side. Anything longer is LPs at 33⅓: sides of 24 minutes at most, as an LP side
 * holds before its grooves crowd, each as near the same length as the album's order allows, two to
 * a record, A and B on the first, C and D on the second. Where the files' tags say which disc of a
 * set each track is on, and name more than one, each disc is a record of its own (or more, should
 * it run longer than two sides hold), its sides worked out from its own tracks, so no side runs
 * from one disc onto the next. Until the track list arrives the record has plain grooves. */
export const SIDE = 24 * 60;

export function split( lengths, at, start, count ) {
	const length = lengths.reduce( ( a, b ) => a + b, 0 );
	const sides = [];
	let from = 0;
	let into = 0;
	for ( let k = 0; k < count; k++ ) {
		const target = ( length - into ) / ( count - k );
		let to = from;
		let side = 0;
		// A track joins the side while the side, with half of it, is within the side's share,
		// and enough tracks are left for the sides still to come.
		while (
			to < lengths.length &&
			( to === from || k === count - 1 || ( side + lengths[ to ] / 2 <= target && lengths.length - to > count - k - 1 ) )
		) {
			side += lengths[ to++ ];
		}
		if ( to > from ) {
			sides.push( { from: at + from, to: at + to, start: start + into, length: side } );
		}
		from = to;
		into += side;
	}
	return sides;
}

export function press( lengths, discs = [] ) {
	const length = lengths.reduce( ( a, b ) => a + b, 0 );
	const single = lengths.length <= 2 && length <= 600;
	const named = discs.length === lengths.length && discs.every( ( d ) => d > 0 ) && new Set( discs ).size > 1;
	// The runs of tracks on one disc, in the album's order; the whole album as one, where the
	// tags don't say.
	const runs = [];
	for ( let k = 0; k < lengths.length; k++ ) {
		if ( k && named && discs[ k ] === discs[ k - 1 ] ) {
			runs[ runs.length - 1 ].to = k + 1;
		} else if ( ! k || named ) {
			runs.push( { from: k, to: k + 1 } );
		} else {
			runs[ 0 ].to = k + 1;
		}
	}
	const sides = [];
	let start = 0;
	let record = 0;
	for ( const run of runs ) {
		const part = lengths.slice( run.from, run.to );
		const span = part.reduce( ( a, b ) => a + b, 0 );
		const count = single ? part.length : Math.max( 1, Math.ceil( span / SIDE ) );
		const pressed = split( part, run.from, start, count );
		pressed.forEach( ( s, k ) => sides.push( { ...s, record: record + Math.floor( k / 2 ) } ) );
		record += Math.ceil( pressed.length / 2 );
		start += span;
	}
	sides.forEach( ( s, k ) => ( s.name = String.fromCharCode( 65 + k ) ) );
	return { format: single ? '7' : '12', sides };
}
