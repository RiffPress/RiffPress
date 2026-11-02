'use strict';

/*
 * Riff Chords' reading of a chart (plugins/riff-chords/assets/chart.js): ChordPro with LRC's times,
 * chords moved for transpose and capo, and the fingering it draws for each. Every fingering, on a
 * guitar in standard tuning, must sound only its chord's notes, and its root and the note that
 * makes it what it is (the third, or the second or fourth of a sus chord). The charts here are
 * placeholder words, not songs. Run by `node --test .github/scripts/*.test.js`.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const FILE = path.join( __dirname, '..', '..', 'plugins', 'riff-chords', 'assets', 'chart.js' );
// A classic script that sets window.riffChordsChart, run here as the browser runs it.
const load = () => {
	const window = {};
	new Function( 'window', fs.readFileSync( FILE, 'utf8' ) )( window );
	return window.riffChordsChart;
};
const chart = load();

const ROOTS = [ 'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B' ];
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
// Intervals of each quality: the notes it may sound, and the ones it must.
const QUALITIES = {
	'': { may: [ 0, 4, 7 ], must: [ 0, 4 ] },
	m: { may: [ 0, 3, 7 ], must: [ 0, 3 ] },
	7: { may: [ 0, 4, 7, 10 ], must: [ 0, 4, 10 ] },
	m7: { may: [ 0, 3, 7, 10 ], must: [ 0, 3, 10 ] },
	maj7: { may: [ 0, 4, 7, 11 ], must: [ 0, 4, 11 ] },
	sus2: { may: [ 0, 2, 7 ], must: [ 0, 2 ] },
	sus4: { may: [ 0, 5, 7 ], must: [ 0, 5 ] },
};
const TUNING = [ 4, 9, 2, 7, 11, 4 ];

test( 'every chord a diagram is drawn for sounds only its notes, with its root and its third', () => {
	for ( const root of ROOTS ) {
		for ( const [ quality, { may, must } ] of Object.entries( QUALITIES ) ) {
			const name = root + quality;
			const frets = chart.shape( name );
			assert.ok( Array.isArray( frets ) && frets.length === 6, `${ name } has a diagram` );
			const sounded = frets
				.map( ( f, i ) => ( f === null ? null : ( TUNING[ i ] + f ) % 12 ) )
				.filter( ( p ) => p !== null )
				.map( ( p ) => ( p - PC[ root ] + 12 ) % 12 );
			assert.ok( sounded.length >= 4, `${ name } plays at least four strings` );
			assert.deepEqual( sounded.filter( ( i ) => ! may.includes( i ) ), [], `${ name } (${ frets.join( ',' ) }) sounds a note not in the chord` );
			for ( const i of must ) {
				assert.ok( sounded.includes( i ), `${ name } (${ frets.join( ',' ) }) is missing ${ i } semitones above its root` );
			}
			// A hand spans four frets.
			const fretted = frets.filter( ( f ) => f );
			assert.ok( Math.max( ...fretted ) - Math.min( ...fretted ) <= 3, `${ name } fits under a hand` );
			assert.ok( Math.max( ...fretted ) <= 12, `${ name } is on the neck below the twelfth fret` );
		}
	}
} );

test( 'the shapes a guitarist learns first are the open ones', () => {
	assert.deepEqual( chart.shape( 'G' ), [ 3, 2, 0, 0, 0, 3 ] );
	assert.deepEqual( chart.shape( 'C' ), [ null, 3, 2, 0, 1, 0 ] );
	assert.deepEqual( chart.shape( 'Am' ), [ null, 0, 2, 2, 1, 0 ] );
	assert.deepEqual( chart.shape( 'F' ), [ 1, 3, 3, 2, 1, 1 ] );
	assert.deepEqual( chart.shape( 'Bm' ), [ null, 2, 4, 4, 3, 2 ] );
} );

test( 'a chord with no diagram, or not a chord, has none', () => {
	assert.equal( chart.shape( 'Cadd9' ), null );
	assert.equal( chart.shape( 'N.C.' ), null );
	assert.deepEqual( chart.shape( 'D/F#' ), chart.shape( 'D' ), 'a slash chord is fingered as its chord' );
} );

test( 'transpose moves the root and the bass and keeps the rest, spelled for the key', () => {
	assert.equal( chart.transpose( 'G', 2 ), 'A' );
	assert.equal( chart.transpose( 'Am7', -2 ), 'Gm7' );
	assert.equal( chart.transpose( 'D/F#', 2 ), 'E/G#' );
	assert.equal( chart.transpose( 'C', 1, 'Db' ), 'Db', 'flats in a flat key' );
	assert.equal( chart.transpose( 'C', 1, 'D' ), 'C#' );
	assert.equal( chart.transpose( 'Bb', 0 ), 'Bb', 'not moved, left as written' );
	assert.equal( chart.transpose( 'Bb', 12 ), 'Bb' );
	assert.equal( chart.transpose( 'Eb', 2 ), 'F', 'a flat chord stays flat without a key' );
	assert.equal( chart.transpose( 'N.C.', 3 ), 'N.C.' );
	assert.ok( chart.flatKey( 'Dm' ) );
	assert.ok( ! chart.flatKey( 'D' ) );
} );

test( 'a chart reads its directives, sections, words and chords', () => {
	const read = chart.parse(
		[
			'{title: Placeholder}',
			'{key: G}',
			'{capo: 2}',
			'# A note for whoever edits the chart',
			'{start_of_verse: Verse 1}',
			'[G]First line of [C]words',
			'',
			'Second [D]line',
			'{end_of_verse}',
			'{c: Slowly}',
			'{soc}',
			'[Em]Third line',
			'{eoc}',
			'{chorus}',
			'{start_of_tab}',
			'e|--0--|',
			'{end_of_tab}',
		].join( '\n' )
	);
	assert.deepEqual( read.meta, { title: 'Placeholder', key: 'G', capo: '2' } );
	assert.deepEqual(
		read.sections.map( ( s ) => [ s.kind, s.label ] ),
		[ [ 'verse', 'Verse 1' ], [ '', '' ], [ 'chorus', '' ], [ 'chorus', '' ], [ 'tab', '' ] ]
	);
	const [ first, second ] = read.sections[ 0 ].lines;
	assert.deepEqual( first.pieces.map( ( p ) => [ p.chord, p.text ] ), [ [ 'G', 'First line of ' ], [ 'C', 'words' ] ] );
	assert.ok( first.gapAfter );
	assert.deepEqual( second.pieces.map( ( p ) => [ p.chord, p.text ] ), [ [ null, 'Second ' ], [ 'D', 'line' ] ] );
	assert.equal( read.sections[ 1 ].lines[ 0 ].kind, 'comment' );
	assert.equal( read.sections[ 1 ].lines[ 0 ].text, 'Slowly' );
	assert.ok( read.sections[ 3 ].recall, '{chorus} calls the chorus back' );
	assert.equal( read.sections[ 4 ].lines[ 0 ].text, 'e|--0--|', 'a tab is kept as written' );
	assert.equal( read.timed, false );
} );

test( 'times: a line\'s, a chord\'s own, and the rest spread between them', () => {
	const read = chart.parse(
		[
			'{start_of_verse label="Verse"}',
			'[00:01.00][G]First [C]line [D]here',
			'[00:04.00]Second [01:00.50][Em]line',
			'{end_of_verse}',
			'{soc}',
			'[01:02.00][C]Third',
			'{eoc}',
		].join( '\n' )
	);
	const times = read.chords.map( ( c ) => [ c.piece.chord, Number( c.piece.time.toFixed( 2 ) ) ] );
	// G at the line's start; C and D spread evenly from there to the next line's start.
	assert.deepEqual( times, [ [ 'G', 1 ], [ 'C', 2 ], [ 'D', 3 ], [ 'Em', 60.5 ], [ 'C', 62 ] ] );
	assert.equal( read.sections[ 0 ].label, 'Verse' );
	assert.equal( read.sections[ 0 ].time, 1 );
	assert.equal( read.sections[ 1 ].time, 62 );
	assert.equal( read.sections[ 0 ].lines[ 1 ].time, 4 );
	assert.ok( read.timed );
} );

test( 'a chart with no times reads, and nothing in it is timed', () => {
	const read = chart.parse( '[G]First [C]line\n[D]Second line' );
	assert.equal( read.timed, false );
	assert.equal( read.sections.length, 1 );
	assert.deepEqual( read.chords, [] );
	assert.deepEqual( chart.parse( '' ).sections, [] );
} );
