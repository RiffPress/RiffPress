'use strict';

/*
 * The demo's chord charts and melodies. packages/fixtures/chart.py lines a public-domain score up
 * with its recording and writes both into the album's lyrics.json; these checks keep what it wrote
 * honest afterwards, with the plugins' own readers: the manifest carries it, Riff Chords reads every
 * chord with a time and a fingering, Riff Sing reads the melody, both run forward inside the track
 * and start where the recording is sounding (from levels.json), and the track's manifest entry says
 * where the score came from and on what terms, beside the recording's own license.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'fs' );
const path = require( 'path' );

const ROOT = path.join( __dirname, '..', '..' );
const FIXTURES = path.join( ROOT, 'packages', 'fixtures' );

const chords = ( () => {
	const assets = path.join( ROOT, 'plugins', 'riff-chords', 'assets' );
	const window = {};
	new Function( 'globalThis', fs.readFileSync( path.join( assets, 'timing.js' ), 'utf8' ) )( window );
	new Function( 'window', fs.readFileSync( path.join( assets, 'chart.js' ), 'utf8' ) )( window );
	return window.riffChordsChart;
} )();
require( path.join( ROOT, 'plugins', 'riff-sing', 'assets', 'melody.js' ) );
const melody = globalThis.riffSingMelody;

const json = ( album, file ) => JSON.parse( fs.readFileSync( path.join( FIXTURES, album, file ), 'utf8' ) );
const charted = [];
for ( const album of fs.readdirSync( FIXTURES ) ) {
	if ( ! fs.existsSync( path.join( FIXTURES, album, 'lyrics.json' ) ) ) {
		continue;
	}
	for ( const [ id, entry ] of Object.entries( json( album, 'lyrics.json' ) ) ) {
		if ( entry.chords || entry.melody ) {
			charted.push( { album, id, entry } );
		}
	}
}

test( 'the demo has a charted song, for Riff Chords and Riff Sing to show', () => {
	assert.ok( charted.some( ( c ) => c.entry.chords ) );
	assert.ok( charted.some( ( c ) => c.entry.melody ) );
} );

for ( const { album, id, entry } of charted ) {
	const track = json( album, 'manifest.json' ).tracks.find( ( t ) => t.id === id );
	const envelope = json( album, 'levels.json' )[ id ];
	// The loudest level within half a second either side, since the envelope is coarse.
	const level = ( at ) => {
		const per = track.duration / envelope.length;
		const from = Math.max( 0, Math.floor( ( at - 0.5 ) / per ) );
		const to = Math.min( envelope.length - 1, Math.ceil( ( at + 0.5 ) / per ) );
		return Math.max( ...envelope.slice( from, to + 1 ).split( '' ).map( Number ) );
	};

	test( `${ album }/${ id }: the manifest carries the chart, with its score's source and rights`, () => {
		assert.ok( track, `${ id } is not in manifest.json` );
		assert.equal( track.chords, entry.chords, 'manifest.json is behind lyrics.json; run chart.py or album.js' );
		assert.equal( track.melody, entry.melody, 'manifest.json is behind lyrics.json; run chart.py or album.js' );
		assert.ok( track.license && track.license_url, 'the recording has no license' );
		for ( const key of [ 'score_source', 'score_by', 'score_license', 'score_license_url' ] ) {
			assert.ok( track[ key ], `${ id } has no ${ key }` );
		}
		assert.ok( fs.existsSync( path.join( FIXTURES, album, `${ id }.score.json` ) ), 'the score chart.py read is not here' );
	} );

	if ( entry.chords ) {
		test( `${ album }/${ id }: every chord is timed, in order, inside the track, where it sounds, and fingered`, () => {
			const read = chords.parse( entry.chords );
			const written = read.sections.flatMap( ( s ) => s.lines ).flatMap( ( l ) => l.pieces ).filter( ( p ) => p.chord );
			assert.ok( written.length > 0 );
			// Only a timed chord is in the list the view follows.
			assert.equal( read.chords.length, written.length, 'a chord has no time' );
			let last = -1;
			for ( const { piece } of read.chords ) {
				assert.ok( typeof piece.time === 'number', `${ piece.chord } has no time` );
				assert.ok( piece.time > last, `${ piece.chord } at ${ piece.time } s is out of order` );
				assert.ok( piece.time < track.duration );
				assert.ok( level( piece.time ) >= 2, `${ piece.chord } at ${ piece.time } s is in near silence` );
				assert.ok( chords.shape( piece.chord ), `no guitar fingering for ${ piece.chord }` );
				last = piece.time;
			}
		} );
	}

	if ( entry.melody ) {
		test( `${ album }/${ id }: the melody reads, in order, inside the track, each phrase starting where it sounds`, () => {
			const read = melody.parse( entry.melody );
			assert.ok( read, 'Riff Sing cannot read the melody' );
			const notes = read.phrases.flatMap( ( p ) => p.notes );
			assert.ok( notes.length > 0 );
			let last = -1;
			for ( const note of notes ) {
				assert.ok( note.start >= last, `a note at ${ note.start } s starts before the one before it` );
				assert.ok( note.end > note.start && note.end <= track.duration );
				last = note.end;
			}
			for ( const phrase of read.phrases ) {
				assert.ok( level( phrase.start ) >= 2, `the phrase at ${ phrase.start } s starts in near silence` );
			}
		} );
	}
}
