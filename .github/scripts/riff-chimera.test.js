'use strict';

/*
 * Riff Chimera (plugins/riff-chimera): the melody readers it shares with Riff Sing, the copy of
 * CHIMERA it carries, and how voice.js turns a melody into CHIMERA's sung notes. Run by
 * `node --test .github/scripts/*.test.js`.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const crypto = require( 'node:crypto' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const PLUGINS = path.join( __dirname, '..', '..', 'plugins' );
const ASSETS = path.join( PLUGINS, 'riff-chimera', 'assets' );
const VENDOR = path.join( ASSETS, 'chimera' );

const scope = {};
new Function( 'globalThis', fs.readFileSync( path.join( ASSETS, 'voice.js' ), 'utf8' ) )( scope );
const V = scope.riffChimeraVoice;

test( 'Riff Chimera carries the same melody.js and midi.js as Riff Sing', () => {
	for ( const file of [ 'melody.js', 'midi.js' ] ) {
		const own = fs.readFileSync( path.join( PLUGINS, 'riff-sing', 'assets', file ), 'utf8' );
		const copy = fs.readFileSync( path.join( ASSETS, file ), 'utf8' );
		assert.equal( copy, own, `plugins/riff-chimera/assets/${ file } differs; copy Riff Sing's over it` );
	}
} );

test( 'the copy of CHIMERA is the build SOURCE.txt names, with its licences beside it', () => {
	const source = fs.readFileSync( path.join( VENDOR, 'SOURCE.txt' ), 'utf8' );
	assert.match( source, /^Commit: [0-9a-f]{40}$/m );
	const sums = [ ...source.matchAll( /^([0-9a-f]{64}) {2}(\S+)$/gm ) ];
	assert.deepEqual( sums.map( ( m ) => m[ 2 ] ).sort(), [ 'chimera.js', 'chimera.wasm', 'cmudict.txt.gz', 'processor.js' ] );
	for ( const [ , sum, file ] of sums ) {
		const got = crypto.createHash( 'sha256' ).update( fs.readFileSync( path.join( VENDOR, file ) ) ).digest( 'hex' );
		assert.equal( got, sum, `${ file } is not the build SOURCE.txt names; rebuild with .github/scripts/build-chimera.sh` );
	}
	assert.match( fs.readFileSync( path.join( VENDOR, 'LICENSE.txt' ), 'utf8' ), /^MIT License\n\nCopyright \(c\) 2026 Jameson Hodge/ );
	assert.ok( fs.existsSync( path.join( VENDOR, 'CMUDICT-LICENSE.txt' ) ) );
	// One module with no imports, so nothing but the engine runs in the worklet.
	const wasm = new WebAssembly.Module( fs.readFileSync( path.join( VENDOR, 'chimera.wasm' ) ) );
	assert.deepEqual( WebAssembly.Module.imports( wasm ), [] );
} );

test( 'nothing CHIMERA runs is fetched from anywhere but the plugin', () => {
	for ( const file of [ 'chimera.js', 'processor.js' ] ) {
		const code = fs.readFileSync( path.join( VENDOR, file ), 'utf8' );
		assert.doesNotMatch( code, /https?:\/\/(?!github\.com\/jamesondh)/, `${ file } names a host` );
	}
} );

// CHIMERA's lyricsToSyllables as far as these tests need it: a word's hyphens break its syllables,
// and a lone "~" holds the vowel before it.
const fake = ( fn, args ) => {
	assert.equal( fn, 'lyricsToSyllables' );
	return args.text
		.split( /\s+/ )
		.filter( Boolean )
		.flatMap( ( word ) =>
			word === '~' ? [ { text: '~', melisma: true } ] : word.split( '-' ).map( ( s, i, all ) => ( { text: s, wordEnd: i === all.length - 1 } ) )
		);
};

test( 'each note of a chart gets its own syllable, a word\'s split as the chart splits it and a held note as a melisma', () => {
	const notes = [
		{ start: 1, end: 1.5, midi: 69, text: 'Si' },
		{ start: 1.5, end: 2, midi: 71, text: 'lent ' },
		{ start: 2, end: 3, midi: 69, text: 'night, ' },
		{ start: 3, end: 4, midi: 66, text: '' },
	];
	const [ phrase ] = V.syllables( fake, [ { start: 1, end: 4, notes } ], true );
	assert.deepEqual(
		phrase.notes.map( ( n ) => [ n.syl.text, !! n.syl.melisma ] ),
		[
			[ 'Si', false ],
			[ 'lent', false ],
			[ 'night,', false ],
			[ '~', true ],
		]
	);
	assert.equal( phrase.notes.at( -1 ).syl.phraseEnd, true, 'the phrase breathes at its end' );
	const ah = V.syllables( fake, [ { start: 1, end: 4, notes } ], false )[ 0 ];
	assert.ok( ah.notes.every( ( n ) => n.syl.nucleus.ipa === 'ɑ' ), 'words CHIMERA can\'t read are sung on "ah"' );
} );

test( 'a phrase is planned from where the song is, at its speed, each note held to the next', () => {
	let asked;
	const call = ( fn, args ) => ( asked = { fn, ...args } );
	const phrase = V.syllables( fake, [ { start: 10, end: 13, notes: [
		{ start: 10, end: 10.5, midi: 60, text: 'la' },
		{ start: 11, end: 13, midi: 62, text: 'la ' },
	] } ], true )[ 0 ];
	V.plan( call, phrase, 8, 2, { female: 1, child: 0 } );
	assert.equal( asked.fn, 'planSong' );
	assert.equal( asked.options.t0, 1, 'two seconds of song away at double speed is one second' );
	assert.equal( asked.options.bpm, 120, 'a beat is a second of the song' );
	assert.deepEqual( asked.notes.map( ( n ) => n.beats ), [ 1, 2 ], 'the gap after the first note is legato' );
	V.plan( call, phrase, 9.95, 1, {} );
	assert.deepEqual( asked.notes.map( ( n ) => n.midi ), [ 62 ], 'a note about to start has no time for its consonants and is left out' );
	assert.equal( V.plan( call, phrase, 12, 1, {} ), null, 'nothing is left of a phrase already sung' );
} );

test( 'a duet\'s two singers get two bodies that sound apart, a low part a man and a high part a woman', () => {
	const [ low, high ] = V.bodies( [ 50, 69 ] );
	assert.ok( low.female < 0.2 && high.female > 0.8 );
	const close = V.bodies( [ 64, 67 ] );
	assert.ok( Math.abs( close[ 0 ].female - close[ 1 ].female ) >= 0.5 || close[ 1 ].child > close[ 0 ].child, 'two alto-ish parts are pulled apart' );
	assert.deepEqual( V.bodies( [ 40 ] ), [ { female: 0, child: 0 } ] );
} );
