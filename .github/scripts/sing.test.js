'use strict';

/*
 * Riff Sing hears the note being sung and scores it against the song's melody. These run its pitch
 * detector (plugins/riff-sing/assets/pitch.js) on generated tones, a voice's range of sines and
 * buzzier ones with overtones, at the rate the worklet runs it, and its UltraStar reader and scorer
 * (assets/melody.js) on small charts made here: a scale, sung in tune, out of tune and an octave up.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const vm = require( 'node:vm' );

const ASSETS = path.join( __dirname, '..', '..', 'plugins', 'riff-sing', 'assets' );
require( path.join( ASSETS, 'pitch.js' ) );
require( path.join( ASSETS, 'melody.js' ) );
const { detect } = globalThis.riffSingPitch;
const { parse, cents, midi, scorer, grade } = globalThis.riffSingMelody;

// The worklet halves a 48 kHz microphone and looks at 2048 of those samples at a time.
const RATE = 24000;
const SIZE = 2048;
const hzOf = ( note ) => 440 * 2 ** ( ( note - 69 ) / 12 );
const off = ( got, want ) => 1200 * Math.log2( got / want );

function tone( hz, { overtones = 0, level = 0.5, noise = 0, seed = 1 } = {} ) {
	let s = seed;
	const random = () => {
		s = ( s * 16807 ) % 2147483647;
		return s / 2147483647 - 0.5;
	};
	const out = new Float32Array( SIZE );
	for ( let i = 0; i < SIZE; i++ ) {
		let v = Math.sin( ( 2 * Math.PI * hz * i ) / RATE );
		for ( let k = 2; k <= overtones + 1; k++ ) {
			v += Math.sin( ( 2 * Math.PI * hz * k * i ) / RATE ) / k;
		}
		out[ i ] = level * v + noise * random();
	}
	return out;
}

test( 'a sine anywhere in a voice\'s range is found within 5 cents', () => {
	// E2, a low bass, up to C6, a child's top: every few semitones between.
	for ( let note = 40; note <= 84; note += 3 ) {
		const hz = hzOf( note );
		const { hz: got } = detect( tone( hz ), RATE );
		assert.ok( Math.abs( off( got, hz ) ) < 5, `${ hz.toFixed( 1 ) } Hz came out ${ got.toFixed( 1 ) } Hz` );
	}
} );

test( 'a voice with overtones and some noise is heard at its fundamental, not an overtone', () => {
	for ( const hz of [ 110, 196, 261.63, 440, 659.25 ] ) {
		const { hz: got, clarity } = detect( tone( hz, { overtones: 5, level: 0.3, noise: 0.05 } ), RATE );
		assert.ok( Math.abs( off( got, hz ) ) < 10, `${ hz } Hz came out ${ got.toFixed( 1 ) } Hz` );
		assert.ok( clarity > 0.5 );
	}
} );

test( 'silence and noise are no note', () => {
	assert.equal( detect( new Float32Array( SIZE ), RATE ).hz, 0 );
	assert.equal( detect( tone( 440, { level: 0.002 } ), RATE ).hz, 0, 'too quiet to be singing' );
	const hiss = tone( 0, { level: 0, noise: 0.5, seed: 7 } );
	assert.equal( detect( hiss, RATE ).hz, 0 );
} );

test( 'the worklet halves a 48 kHz microphone and posts the pitch it hears, block by block', () => {
	let Processor = null;
	const posted = [];
	class AudioWorkletProcessor {
		constructor() {
			this.port = { postMessage: ( m ) => posted.push( m ) };
		}
	}
	const scope = {
		sampleRate: 48000,
		AudioWorkletProcessor,
		registerProcessor: ( name, cls ) => {
			assert.equal( name, 'riff-sing-pitch' );
			Processor = cls;
		},
		Float32Array,
		Math,
	};
	scope.globalThis = scope;
	vm.runInNewContext( fs.readFileSync( path.join( ASSETS, 'pitch.js' ), 'utf8' ), scope );
	const node = new Processor();
	const hz = 220;
	for ( let block = 0; block < 400; block++ ) {
		const input = new Float32Array( 128 );
		for ( let i = 0; i < 128; i++ ) {
			input[ i ] = 0.4 * Math.sin( ( 2 * Math.PI * hz * ( block * 128 + i ) ) / 48000 );
		}
		assert.equal( node.process( [ [ input ] ] ), true );
	}
	// 400 blocks of 128 is 25,600 halved samples: one post every 512 of them.
	assert.equal( posted.length, 50 );
	const last = posted[ posted.length - 1 ];
	assert.ok( Math.abs( off( last.hz, hz ) ) < 5, `came out ${ last.hz }` );
	node.port.onmessage( { data: 'stop' } );
	assert.equal( node.process( [ [ new Float32Array( 128 ) ] ] ), false, 'stopped, it lets the node go' );
} );

// A scale from middle C, a beat each at 120 BPM (UltraStar counts quarter beats: 4 of them a beat),
// in two phrases, half a second in. The syllables are solfège.
const SCALE = `#TITLE:Scale
#ARTIST:Test
#BPM:120
#GAP:500
: 0 4 0 Do
: 4 4 2 Re
: 8 4 4 Mi
* 12 4 5 Fa
- 18
: 20 4 7 Sol
: 24 4 9 La
F 28 4 11 Ti
: 32 4 12 Do
E
`;

test( 'an UltraStar chart is read into phrases of notes with their times in seconds', () => {
	const chart = parse( SCALE );
	assert.equal( chart.title, 'Scale' );
	assert.equal( chart.phrases.length, 2 );
	const [ first, second ] = chart.phrases;
	assert.deepEqual( first.notes.map( ( n ) => n.text ), [ 'Do', 'Re', 'Mi', 'Fa' ] );
	assert.deepEqual( first.notes.map( ( n ) => n.midi ), [ 60, 62, 64, 65 ] );
	// A beat is 60 / 120 / 4 = 0.125 s, so beat 4 is 0.5 s after the gap.
	assert.equal( first.start, 0.5 );
	assert.equal( first.notes[ 1 ].start, 1 );
	assert.equal( first.end, 2.5 );
	assert.equal( first.notes[ 3 ].golden, true );
	assert.equal( second.notes[ 2 ].free, true, 'freestyle is shown but not scored' );
	assert.equal( chart.low, 60 );
	assert.equal( chart.high, 72, 'the range leaves freestyle out' );
} );

test( 'what can\'t be read is null: no BPM, no notes', () => {
	assert.equal( parse( ': 0 4 0 Do' ), null );
	assert.equal( parse( '#BPM:120\nE' ), null );
	assert.equal( parse( '' ), null );
} );

// The scale again, its beats counted from the start of each line: the second line's break falls 18
// beats in and its count starts 20 beats on, where the absolute chart has Sol.
const RELATIVE = `#TITLE:Scale
#BPM:120
#GAP:500
#RELATIVE:yes
: 0 4 0 Do
: 4 4 2 Re
: 8 4 4 Mi
* 12 4 5 Fa
- 18 20
: 0 4 7 Sol
: 4 4 9 La
F 8 4 11 Ti
: 12 4 12 Do
E
`;

test( 'a relative chart counts each line from where the break before it says, and comes out as the absolute one', () => {
	const strip = ( chart ) => chart.phrases.map( ( p ) => p.notes.map( ( n ) => [ n.start, n.end, n.midi, n.text ] ) );
	const chart = parse( RELATIVE );
	assert.deepEqual( strip( chart ), strip( parse( SCALE ) ) );
	assert.equal( chart.phrases[ 1 ].start, 0.5 + 20 * 0.125 );
	// Offsets add up line after line, and a break with one number starts the next line where it falls.
	const three = parse( '#BPM:120\n#RELATIVE:yes\n: 0 4 0 a\n- 4 8\n: 0 4 0 b\n- 6\n: 0 4 0 c\nE' );
	assert.deepEqual(
		three.phrases.map( ( p ) => p.start ),
		[ 0, 8 * 0.125, 14 * 0.125 ]
	);
	// A blank line among the headers doesn't end them: what comes after it is still read.
	assert.equal( parse( '#BPM:120\n\n#RELATIVE:yes\n: 0 4 0 a\n- 4 8\n: 0 4 0 b\nE' ).phrases[ 1 ].start, 1 );
	assert.equal( parse( '#BPM:120\n\n#GAP:1000\n: 0 4 0 a\nE' ).phrases[ 0 ].start, 1, 'an absolute chart\'s gap too' );
	// The same lines read as absolute beats would all start together.
	assert.equal( parse( '#BPM:120\n: 0 4 0 a\n- 4 8\n: 0 4 0 b\nE' ).phrases[ 1 ].start, 0 );
} );

test( 'a decimal comma, a tilde, a duet and Windows line ends are read as UltraStar writes them', () => {
	const chart = parse( '#BPM:240,5\r\n#GAP:0\r\nP1 \r\n: 0 2 0 Ah \r\n: 2 2 2 ~\r\nP2\r\n: 0 2 7 Oh\r\nE' );
	assert.equal( chart.phrases.length, 1, 'the chart\'s own lines are the first singer\'s' );
	assert.equal( chart.singers[ 1 ].phrases[ 0 ].notes[ 0 ].text, 'Oh', 'and the second\'s are their own' );
	assert.deepEqual( chart.phrases[ 0 ].notes.map( ( n ) => n.text ), [ 'Ah ', '' ], 'the space that ends a word is kept' );
	assert.ok( Math.abs( chart.phrases[ 0 ].notes[ 1 ].start - ( 2 * 60 ) / 240.5 / 4 ) < 1e-9 );
} );

// Two singers taking turns, then singing a line together (P3), each in a relative chart's own count.
const DUET = `#TITLE:Duet
#BPM:120
#GAP:0
#RELATIVE:yes
#P1:Ada
#P2:Bo
P1
: 0 4 0 Do
- 8 16
: 0 4 4 Mi
P2
: 8 4 7 Sol
- 12 32
P3
: 0 4 12 Do
E
`;

test( 'a duet is read as two singers, each with their own lines, a P3 line both of theirs', () => {
	const chart = parse( DUET );
	assert.equal( chart.singers.length, 2 );
	const [ ada, bo ] = chart.singers;
	assert.equal( ada.name, 'Ada' );
	assert.equal( bo.name, 'Bo' );
	const lines = ( who ) => who.phrases.map( ( p ) => p.notes.map( ( n ) => [ n.start, n.midi ] ) );
	// Ada's count moves 16 beats at her break, Bo's 32 at his: P3's line falls where each is.
	assert.deepEqual( lines( ada ), [ [ [ 0, 60 ] ], [ [ 2, 64 ] ], [ [ 2, 72 ] ] ] );
	assert.deepEqual( lines( bo ), [ [ [ 1, 67 ] ], [ [ 4, 72 ] ] ] );
	assert.equal( ada.low, 60 );
	assert.equal( bo.low, 67 );
	assert.notEqual( ada.phrases[ 2 ].notes[ 0 ], bo.phrases[ 1 ].notes[ 0 ], 'a note both sing is scored for each apart' );
	assert.equal( chart.phrases, ada.phrases, 'the chart\'s own lines are the first singer\'s' );

	const solo = parse( SCALE );
	assert.equal( solo.singers.length, 1, 'a chart with no P lines is one singer' );
	assert.equal( solo.singers[ 0 ].name, '' );
	assert.equal( parse( '#BPM:120\nP1\nF 0 4 0 a\nP2\n: 0 4 0 b\nE' ).singers.length, 1, 'a singer with nothing scored has no lane' );
} );

test( 'each singer of a duet is scored on their own', () => {
	const chart = parse( DUET );
	const [ ada, bo ] = chart.singers.map( ( who ) => scorer( who ) );
	for ( let t = 0; t < 5; t += 0.025 ) {
		// Ada sings every note; Bo is silent.
		ada.add( t, ada.note( t )?.midi ?? null );
		bo.add( t, null );
	}
	ada.finish();
	bo.finish();
	assert.ok( ada.total() > 0.95 );
	assert.ok( bo.total() < 0.01 );
} );

test( 'cents leave the octave out', () => {
	assert.equal( cents( 72, 60 ), 0 );
	assert.equal( cents( 48, 60 ), 0 );
	assert.equal( Math.round( cents( 60.5, 60 ) ), 50 );
	assert.equal( Math.round( cents( 71.5, 60 ) ), -50 );
	assert.equal( Math.round( midi( 440 ) ), 69 );
	assert.equal( midi( 0 ), null );
} );

// Sings the chart, forty frames a second, as `sung( note )` says for each note in turn.
function sing( chart, sung, options ) {
	const s = scorer( chart, options );
	const done = [];
	for ( let t = 0; t < 5.5; t += 0.025 ) {
		const note = s.note( t );
		done.push( ...s.add( t, note ? sung( note ) : null ) );
	}
	done.push( ...s.finish() );
	return { s, done };
}

test( 'sung in tune, each phrase scores in full as it ends, and the song with it', () => {
	const chart = parse( SCALE );
	const { s, done } = sing( chart, ( n ) => n.midi + 0.2 );
	assert.deepEqual( done.map( ( d ) => d.index ), [ 0, 1 ] );
	assert.ok( done.every( ( d ) => d.score > 0.95 ) );
	assert.ok( s.total() > 0.95 );
	assert.equal( grade( s.total() ), 'great' );
} );

test( 'an octave up still counts; a tone off does not, until the tolerance takes it in', () => {
	const chart = parse( SCALE );
	assert.ok( sing( chart, ( n ) => n.midi + 12 ).s.total() > 0.95, 'an octave above' );
	assert.ok( sing( chart, ( n ) => n.midi - 24 ).s.total() > 0.95, 'two below' );
	assert.ok( sing( chart, ( n ) => n.midi + 2 ).s.total() < 0.05, 'a whole tone sharp, at 100 cents' );
	assert.ok( sing( chart, ( n ) => n.midi + 2, { tolerance: 200 } ).s.total() > 0.95, 'easy takes it' );
	assert.ok( sing( chart, ( n ) => n.midi + 0.7, { tolerance: 50 } ).s.total() < 0.05, 'strict does not take 70 cents' );
} );

test( 'silence scores nothing, half the notes half, and a phrase never sung has no score', () => {
	const chart = parse( SCALE );
	assert.ok( sing( chart, () => null ).s.total() < 0.01 );
	// Do and Mi in tune, Re and Fa (golden, so counted twice) silent.
	const { done } = sing( chart, ( n ) => ( [ 60, 64 ].includes( n.midi ) ? n.midi : null ) );
	assert.ok( Math.abs( done[ 0 ].score - 2 / 5 ) < 0.05, `got ${ done[ 0 ].score }` );
	assert.equal( grade( 0.4 ), 'close' );
	assert.equal( grade( 0.1 ), 'keep' );

	const s = scorer( chart );
	for ( let t = 3; t < 5.5; t += 0.025 ) {
		s.add( t, s.note( t )?.midi ?? null );
	}
	s.finish();
	assert.ok( s.total() > 0.95, 'only the second phrase was sung, and only it counts' );
} );

test( 'a seek back forgets the phrases from there on, to be sung again', () => {
	const chart = parse( SCALE );
	const s = scorer( chart );
	for ( let t = 0; t < 5.5; t += 0.025 ) {
		s.add( t, null );
	}
	assert.ok( s.total() < 0.01 );
	for ( let t = 3; t < 5.5; t += 0.025 ) {
		s.add( t, s.note( t )?.midi ?? null );
	}
	s.finish();
	const total = s.total();
	assert.ok( total > 0.4 && total < 0.6, `the first phrase missed, the second sung again in tune: ${ total }` );
} );
