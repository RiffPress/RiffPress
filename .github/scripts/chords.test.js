'use strict';

/*
 * The strings on riffpress.com play real chords. Each shape in site/src/chords.js, fretted on the
 * top five strings of standard tuning, must sound only the notes of its chord, and both its root
 * and its third, which is what a guitarist would hear as right.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const path = require( 'node:path' );
const { pathToFileURL } = require( 'node:url' );

const load = () => import( pathToFileURL( path.join( __dirname, '..', '..', 'site', 'src', 'chords.js' ) ).href );
const NOTE = [ 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B' ];
const pitch = ( hz ) => ( ( Math.round( 12 * Math.log2( hz / 440 ) ) % 12 ) + 12 + 9 ) % 12;
const tones = ( name ) => {
	const m = name.match( /^([A-G])(m?)(7?)$/ );
	const root = NOTE.indexOf( m[ 1 ] );
	const third = root + ( m[ 2 ] ? 3 : 4 );
	const want = [ root, third, root + 7 ];
	if ( m[ 3 ] ) {
		want.push( root + 10 );
	}
	return { root, third: third % 12, all: new Set( want.map( ( t ) => t % 12 ) ) };
};

test( 'the open strings are the top five of standard tuning: E, B, G, D, A', async () => {
	const { OPEN } = await load();
	assert.deepEqual( OPEN.map( ( hz ) => NOTE[ pitch( hz ) ] ), [ 'E', 'B', 'G', 'D', 'A' ] );
} );

test( 'every chord sounds only its own notes, with its root and its third', async () => {
	const { NAMES, notes } = await load();
	for ( const name of NAMES ) {
		const { root, third, all } = tones( name );
		const sounded = notes( name ).filter( Boolean ).map( pitch );
		const wrong = sounded.filter( ( p ) => ! all.has( p ) ).map( ( p ) => NOTE[ p ] );
		assert.deepEqual( wrong, [], `${ name } sounds ${ wrong.join( ', ' ) }, not in the chord` );
		assert.ok( sounded.includes( root ), `${ name } has no root` );
		assert.ok( sounded.includes( third ), `${ name } has no third` );
	}
} );

test( 'a held key asks for the chord a guitarist would name', async () => {
	const { chordFor } = await load();
	assert.equal( chordFor( 'a' ), 'A' );
	assert.equal( chordFor( 'a', true ), 'Am' );
	assert.equal( chordFor( 'g', false, true ), 'G7' );
	assert.equal( chordFor( 'e', true, true ), 'Em7' );
	assert.equal( chordFor( 'h' ), null );
	assert.equal( chordFor( '' ), null );
} );
