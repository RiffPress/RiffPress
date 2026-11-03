'use strict';

/*
 * Riff Sing reads a MIDI file's vocal track as the melody (plugins/riff-sing/assets/midi.js). These
 * build small Standard MIDI Files here, byte by byte, as a score program writes them: a tempo track,
 * a piano and a voice, a karaoke file with its words on a track of their own, and a few broken ones,
 * and check that the voice comes out as the same chart an UltraStar one would.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const path = require( 'node:path' );

const ASSETS = path.join( __dirname, '..', '..', 'plugins', 'riff-sing', 'assets' );
require( path.join( ASSETS, 'melody.js' ) );
require( path.join( ASSETS, 'midi.js' ) );
const { read } = globalThis.riffSingMidi;
const { scorer } = globalThis.riffSingMelody;

const PPQ = 480;

const vlq = ( n ) => {
	const out = [ n & 0x7f ];
	while ( ( n >>= 7 ) ) {
		out.unshift( ( n & 0x7f ) | 0x80 );
	}
	return out;
};
const bytes = ( s ) => [ ...Buffer.from( s, 'utf8' ) ];
const u32 = ( n ) => [ ( n >>> 24 ) & 0xff, ( n >>> 16 ) & 0xff, ( n >>> 8 ) & 0xff, n & 0xff ];

// Events at absolute ticks, sorted and written with their deltas, and an end of track.
function track( events ) {
	const sorted = [ ...events ].sort( ( a, b ) => a.tick - b.tick );
	const data = [];
	let at = 0;
	for ( const e of sorted ) {
		data.push( ...vlq( e.tick - at ), ...e.data );
		at = e.tick;
	}
	data.push( 0, 0xff, 0x2f, 0 );
	return [ ...bytes( 'MTrk' ), ...u32( data.length ), ...data ];
}
// A track's events written exactly in the order given, for an order the sort in track() would change.
function bytesOf( events ) {
	const data = [];
	let at = 0;
	for ( const e of events ) {
		data.push( ...vlq( e.tick - at ), ...e.data );
		at = e.tick;
	}
	data.push( 0, 0xff, 0x2f, 0 );
	return [ ...bytes( 'MTrk' ), ...u32( data.length ), ...data ];
}
const file = ( tracks, division = PPQ ) =>
	new Uint8Array( [
		...bytes( 'MThd' ),
		...u32( 6 ),
		0,
		tracks.length > 1 ? 1 : 0,
		0,
		tracks.length,
		( division >> 8 ) & 0xff,
		division & 0xff,
		...tracks.flat(),
	] );

const meta = ( tick, type, payload ) => ( { tick, data: [ 0xff, type, ...vlq( payload.length ), ...payload ] } );
const name = ( text ) => meta( 0, 0x03, bytes( text ) );
const lyric = ( tick, text ) => meta( tick, 0x05, bytes( text ) );
const words = ( tick, text ) => meta( tick, 0x01, bytes( text ) );
const tempo = ( tick, bpm ) => {
	const us = Math.round( 60e6 / bpm );
	return meta( tick, 0x51, [ ( us >> 16 ) & 0xff, ( us >> 8 ) & 0xff, us & 0xff ] );
};
// A note, as on and off; `off` as a note on at velocity 0, as many programs write it.
const note = ( tick, length, key, { channel = 0, zero = false } = {} ) => [
	{ tick, data: [ 0x90 | channel, key, 100 ] },
	{ tick: tick + length, data: zero ? [ 0x90 | channel, key, 0 ] : [ 0x80 | channel, key, 64 ] },
];

// Do, re, mi, a crotchet each at 120 BPM, then two beats' rest, then fa, sol: two phrases.
const tune = ( keys = [ 60, 62, 64, 0, 0, 65, 67 ] ) =>
	keys.flatMap( ( k, i ) => ( k ? note( i * PPQ, PPQ, k ) : [] ) );
const strip = ( chart ) => chart.phrases.map( ( p ) => p.notes.map( ( n ) => [ n.start, n.end, n.midi, n.text ] ) );

test( 'a score\'s voice track is read as the melody, in phrases, its times through the tempo', () => {
	const chart = read(
		file( [
			track( [ name( 'Tempo' ), tempo( 0, 120 ) ] ),
			// A piano, louder and busier, before the voice: chords under the tune.
			track( [ name( 'Piano' ), ...[ 48, 52, 55 ].flatMap( ( k ) => note( 0, 4 * PPQ, k, { channel: 1 } ) ) ] ),
			track( [
				name( 'Voice' ),
				...tune(),
				lyric( 0, 'Do' ),
				lyric( PPQ, 're' ),
				lyric( 2 * PPQ, 'mi' ),
				lyric( 5 * PPQ, 'Fa-' ),
				lyric( 6 * PPQ, 'sol' ),
			] ),
		] )
	);
	assert.deepEqual( strip( chart ), [
		[
			[ 0, 0.5, 60, 'Do ' ],
			[ 0.5, 1, 62, 're ' ],
			[ 1, 1.5, 64, 'mi ' ],
		],
		[
			[ 2.5, 3, 65, 'Fa' ],
			[ 3, 3.5, 67, 'sol ' ],
		],
	] );
	assert.equal( chart.low, 60 );
	assert.equal( chart.high, 67 );
} );

test( 'a tempo change moves every note after it', () => {
	const chart = read( file( [ track( [ tempo( 0, 120 ), tempo( 2 * PPQ, 60 ), name( 'Melody' ), ...tune( [ 60, 62, 64, 65 ] ) ] ) ] ) );
	// Two beats at half a second, then a second each.
	assert.deepEqual(
		chart.phrases[ 0 ].notes.map( ( n ) => [ n.start, n.end ] ),
		[
			[ 0, 0.5 ],
			[ 0.5, 1 ],
			[ 1, 2 ],
			[ 2, 3 ],
		]
	);
} );

test( 'a karaoke file\'s words on their own track find the tune they fall on, and say where its lines end', () => {
	const chart = read(
		file( [
			track( [ tempo( 0, 120 ), words( 0, '@TTest' ) ] ),
			// Each word after the first starts with a space, and / or \\ starts a new line.
			track( [
				name( 'Words' ),
				...[ '\\Twin', 'kle', ' twin', 'kle', '/lit', 'tle' ].map( ( w, i ) => words( i * PPQ, w ) ),
			] ),
			// The accompaniment first, on other beats, then the tune, with no name to go by.
			track( [ ...note( PPQ / 2, PPQ, 40, { channel: 2 } ), ...note( 3 * PPQ / 2, PPQ, 43, { channel: 2 } ) ] ),
			track( tune( [ 60, 60, 67, 67, 69, 69 ] ) ),
		] )
	);
	assert.deepEqual(
		chart.phrases.map( ( p ) => p.notes.map( ( n ) => `${ n.midi }:${ n.text }` ) ),
		[
			[ '60:Twin', '60:kle', '67: twin', '67:kle' ],
			[ '69:lit', '69:tle' ],
		],
		'the words as written, the karaoke file\'s spaces its own'
	);
} );

test( 'one voice at a time: a chord gives its top note, an overlap ends the note before, drums are left out', () => {
	const chart = read(
		file( [
			track( [ ...note( 0, 4 * PPQ, 36, { channel: 9 } ), ...note( 0, 4 * PPQ, 38, { channel: 9 } ) ] ),
			track( [
				...note( 0, 2 * PPQ, 60, { zero: true } ),
				...note( 0, 2 * PPQ, 64, { zero: true } ),
				...note( PPQ, PPQ, 67, { zero: true } ),
			] ),
		] )
	);
	assert.deepEqual( strip( chart ), [
		[
			[ 0, 0.5, 64, '' ],
			[ 0.5, 1, 67, '' ],
		],
	] );
} );

test( 'a reset message first, running status across a lyric and Latin-1 words are read as files write them', () => {
	// A General MIDI reset (sysex) before anything, as score programs start a file.
	const reset = { tick: 0, data: [ 0xf0, 0x05, 0x7e, 0x7f, 0x09, 0x01, 0xf7 ] };
	// The second note leaves its status out, after a lyric, as some sequencers write it.
	const running = [
		{ tick: 0, data: [ 0x90, 60, 100 ] },
		{ tick: PPQ, data: [ 0x90, 60, 0 ] },
		meta( PPQ, 0x05, [ 0x4e, 0xe9 ] ), // "Né" in Latin-1.
		{ tick: PPQ, data: [ 62, 64 ] },
	];
	const chart = read( file( [ track( [ reset, name( 'Voice' ), ...running ] ) ] ) );
	assert.deepEqual( strip( chart ), [
		[
			[ 0, 0.5, 60, '' ],
		],
	] );
	// The second note never ends, so only the first is sung; its lyric is read all the same.
	const ended = read( file( [ track( [ reset, name( 'Voice' ), ...running, { tick: 2 * PPQ, data: [ 62, 0 ] } ] ) ] ) );
	assert.deepEqual( ended.phrases[ 0 ].notes.map( ( n ) => [ n.start, n.midi, n.text ] ), [
		[ 0, 60, '' ],
		[ 0.5, 62, 'Né ' ],
	] );
} );

test( 'a file with every part on one track finds the voice by the channel its lyrics fall on', () => {
	const chart = read(
		file( [
			track( [
				// Piano on channel 2, a beat behind the voice; bass on channel 3 under it; drums.
				...tune( [ 72, 74, 76 ] ).map( ( e ) => ( { tick: e.tick + PPQ / 2, data: [ e.data[ 0 ] | 2, ...e.data.slice( 1 ) ] } ) ),
				...note( 0, 3 * PPQ, 36, { channel: 3 } ),
				...note( 0, PPQ, 42, { channel: 9 } ),
				...tune( [ 60, 62, 64 ] ),
				lyric( 0, 'Do' ),
				lyric( PPQ, 're' ),
				lyric( 2 * PPQ, 'mi' ),
			] ),
		] )
	);
	assert.deepEqual( chart.phrases[ 0 ].notes.map( ( n ) => `${ n.midi }:${ n.text }` ), [ '60:Do ', '62:re ', '64:mi ' ] );
} );

test( 'a sax isn\'t a voice, and a comment isn\'t a lyric', () => {
	const chart = read(
		file( [
			track( [ tempo( 0, 120 ), words( 0, 'Created with a score program' ) ] ),
			track( [ name( 'Alto Sax' ), ...note( 0, PPQ, 70 ) ] ),
			track( [ name( 'Vocals' ), ...note( 0, PPQ, 60 ) ] ),
		] )
	);
	assert.deepEqual( strip( chart ), [ [ [ 0, 0.5, 60, '' ] ] ] );
	assert.equal( read( file( [ track( [ name( 'Tenor' ), ...note( 0, PPQ, 55 ) ] ), track( [ name( 'Piano' ), ...note( 0, PPQ, 48 ) ] ) ] ) ).low, 55, 'a choir\'s tenor is' );
} );

test( 'a repeated note is kept when its note on comes before the last one\'s note off', () => {
	// Each note on written before the note off of the one before it, at the same tick.
	const events = [ 0, 1, 2 ].flatMap( ( i ) => [
		lyric( i * PPQ, 'abc'[ i ] ),
		{ tick: i * PPQ, data: [ 0x90, 60, 100 ] },
		...( i ? [ { tick: i * PPQ, data: [ 0x80, 60, 64 ] } ] : [] ),
	] );
	events.push( { tick: 3 * PPQ, data: [ 0x80, 60, 64 ] } );
	const chart = read( file( [ track( [ name( 'Voice' ) ] ), [ ...bytesOf( events ) ] ] ) );
	assert.deepEqual( chart.phrases[ 0 ].notes.map( ( n ) => [ n.start, n.end, n.text ] ), [
		[ 0, 0.5, 'a ' ],
		[ 0.5, 1, 'b ' ],
		[ 1, 1.5, 'c ' ],
	] );
} );

test( 'the track with the lyrics is the voice, however it is named and whatever doubles it', () => {
	const chart = read(
		file( [
			track( [ name( 'Flute' ), ...tune( [ 72, 74, 76 ] ) ] ),
			track( [ name( 'Unchained' ), ...tune( [ 60, 62, 64 ] ), lyric( 0, 'Oh' ), lyric( PPQ, 'my' ), lyric( 2 * PPQ, 'love' ) ] ),
		] )
	);
	assert.deepEqual( chart.phrases[ 0 ].notes.map( ( n ) => n.midi ), [ 60, 62, 64 ] );
} );

test( 'a note off that never came costs only that note', () => {
	const chart = read(
		file( [
			track( [
				name( 'Voice' ),
				{ tick: 0, data: [ 0x90, 60, 100 ] },
				...[ 2, 6, 10 ].flatMap( ( beat ) => [ ...note( beat * PPQ, PPQ, 60 ), lyric( beat * PPQ, `x${ beat }` ) ] ),
			] ),
		] )
	);
	assert.deepEqual(
		chart.phrases.map( ( p ) => p.notes.map( ( n ) => [ n.start, n.end, n.text ] ) ),
		// The stuck note runs on to the next, and the rests between the rest still end their phrases.
		[
			[
				[ 0, 1, '' ],
				[ 1, 1.5, 'x2 ' ],
			],
			[ [ 3, 3.5, 'x6 ' ] ],
			[ [ 5, 5.5, 'x10 ' ] ],
		]
	);
} );

test( 'where the lyrics fall outranks a name, and a Rock Band chart\'s markers aren\'t sung', () => {
	// One track named for the song, bass on channel 1 before the voice on channel 0.
	const titled = read(
		file( [
			track( [
				name( 'Unchained Melody' ),
				...note( 0, 3 * PPQ, 36, { channel: 1 } ),
				...tune( [ 60, 62 ] ),
				lyric( 0, 'Oh' ),
				lyric( PPQ, 'my' ),
			] ),
		] )
	);
	assert.deepEqual( titled.phrases[ 0 ].notes.map( ( n ) => n.midi ), [ 60, 62 ] );
	// A phrase marker (105) over the phrase, as PART VOCALS has it.
	const band = read( file( [ track( [ name( 'PART VOCALS' ), ...note( 0, 2 * PPQ, 105 ), ...tune( [ 60, 62 ] ) ] ) ] ) );
	assert.deepEqual( band.phrases[ 0 ].notes.map( ( n ) => n.midi ), [ 60, 62 ] );
	assert.equal( band.high, 62 );
} );

test( 'the voice read from a MIDI file is scored as an UltraStar chart is', () => {
	const chart = read( file( [ track( [ name( 'Vocals' ), ...tune() ] ) ] ) );
	const s = scorer( chart );
	for ( let t = 0; t < 4; t += 0.025 ) {
		s.add( t, s.note( t )?.midi ?? null );
	}
	s.finish();
	assert.ok( s.total() > 0.95 );
} );

test( 'what isn\'t a MIDI file with notes is null, and a file cut short reads as far as it goes', () => {
	assert.equal( read( new Uint8Array( 0 ) ), null );
	assert.equal( read( new Uint8Array( bytes( '#BPM:120\n: 0 4 0 Do\nE' ) ) ), null );
	assert.equal( read( file( [ track( [ tempo( 0, 120 ), name( 'Voice' ) ] ) ] ) ), null, 'no notes' );
	assert.equal( read( file( [ track( note( 0, PPQ, 36, { channel: 9 } ) ) ] ) ), null, 'only drums' );
	const whole = file( [ track( [ name( 'Voice' ), ...tune() ] ) ] );
	// Cut after the third note: the fourth's note on and everything after it are gone.
	const cut = read( whole.subarray( 0, whole.length - 20 ) );
	assert.deepEqual( cut.phrases[ 0 ].notes.map( ( n ) => n.midi ), [ 60, 62, 64 ] );
} );
