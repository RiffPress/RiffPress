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
