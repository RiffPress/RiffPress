'use strict';

/*
 * The turntable's maths, which needs no page: how an album is pressed into sides
 * (plugins/riff/assets/player/turntable/press.js), and where the tonearm puts the stylus
 * (turntable/geometry.js), set up by Baerwald's alignment, its angle for each moment of a side and
 * the moment for each angle.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const path = require( 'node:path' );
const { pathToFileURL } = require( 'node:url' );

const DIR = path.join( __dirname, '..', '..', 'plugins', 'riff', 'assets', 'player', 'turntable' );
const load = ( file ) => import( pathToFileURL( path.join( DIR, file ) ).href );
const minutes = ( ...m ) => m.map( ( n ) => n * 60 );
const shape = ( { sides } ) => sides.map( ( s ) => `${ s.name }${ s.record }:${ s.from }-${ s.to }` );

test( 'one or two tracks of ten minutes at most are a 7-inch single, a track a side', async () => {
	const { press } = await load( 'press.js' );
	const single = press( minutes( 4, 5 ) );
	assert.equal( single.format, '7' );
	assert.deepEqual( shape( single ), [ 'A0:0-1', 'B0:1-2' ] );
	assert.deepEqual( single.sides.map( ( s ) => [ s.start, s.length ] ), [ [ 0, 240 ], [ 240, 300 ] ] );
	// Three short tracks, or two that run longer, are an LP.
	assert.equal( press( minutes( 3, 3, 3 ) ).format, '12' );
	assert.equal( press( minutes( 6, 6 ) ).format, '12' );
} );

test( 'an LP has sides of 24 minutes at most, as even as the order allows, two to a record', async () => {
	const { press, SIDE } = await load( 'press.js' );
	assert.equal( SIDE, 24 * 60 );
	assert.deepEqual( shape( press( minutes( 3, 3, 3 ) ) ), [ 'A0:0-3' ] );
	const lp = press( Array( 10 ).fill( 300 ) );
	assert.deepEqual( shape( lp ), [ 'A0:0-3', 'B0:3-7', 'C1:7-10' ] );
	for ( const side of lp.sides ) {
		assert.ok( side.length <= SIDE, `${ side.name } runs ${ side.length } s` );
	}
	// Each side starts where the one before it ended, and together they hold the whole album.
	assert.deepEqual( lp.sides.map( ( s ) => s.start ), [ 0, 900, 2100 ] );
	assert.equal( lp.sides.reduce( ( a, s ) => a + s.length, 0 ), 3000 );
} );

test( 'each disc a set names is a record of its own, and no side runs from one disc onto the next', async () => {
	const { press } = await load( 'press.js' );
	assert.deepEqual( shape( press( minutes( 10, 10, 10, 10 ), [ 1, 1, 2, 2 ] ) ), [ 'A0:0-2', 'B1:2-4' ] );
	// A disc longer than two sides holds is records of its own, the next disc on the record after.
	assert.deepEqual( shape( press( minutes( 10, 10, 10, 10, 10, 10 ), [ 1, 1, 1, 1, 1, 2 ] ) ), [ 'A0:0-2', 'B0:2-4', 'C1:4-5', 'D2:5-6' ] );
	// Tags that name one disc, or not every track's, say nothing: the album is pressed as one.
	assert.deepEqual( shape( press( minutes( 10, 10, 10, 10 ), [ 1, 1, 1, 1 ] ) ), [ 'A0:0-2', 'B0:2-4' ] );
	assert.deepEqual( shape( press( minutes( 10, 10, 10, 10 ), [ 1, 0, 2, 2 ] ) ), [ 'A0:0-2', 'B0:2-4' ] );
} );

test( 'the arm is aligned by Baerwald: 232.5 mm long, its headshell turned in 23.7°', async () => {
	const { ARM, OFFSET } = await load( 'geometry.js' );
	assert.ok( Math.abs( ARM * 302 - 232.5 ) < 0.1, `${ ARM * 302 } mm` );
	assert.ok( Math.abs( ( OFFSET * 180 ) / Math.PI - 23.7 ) < 0.05, `${ ( OFFSET * 180 ) / Math.PI }°` );
} );

test( 'the stylus runs from the lead-in to the lead-out as the side plays, and back again', async () => {
	const { angle, playedOf, BASE, ARM, LEAD_IN, REST } = await load( 'geometry.js' );
	// The stylus's distance from the centre, as a share of the radius, with the arm at an angle.
	const radius = ( deg ) => {
		const r = ( deg * Math.PI ) / 180;
		return Math.hypot( BASE[ 0 ] - ARM * Math.sin( r ) - 0.5, BASE[ 1 ] + ARM * Math.cos( r ) - 0.5 ) / 0.5;
	};
	for ( const leadOut of [ 0.4, 0.56 ] ) {
		assert.ok( Math.abs( radius( angle( 0, leadOut ) ) - LEAD_IN ) < 1e-5 );
		assert.ok( Math.abs( radius( angle( 1, leadOut ) ) - leadOut ) < 1e-5 );
		// Playing time runs evenly across the radius, so halfway through is halfway across.
		assert.ok( Math.abs( radius( angle( 0.5, leadOut ) ) - ( LEAD_IN + leadOut ) / 2 ) < 1e-5 );
		let last = -Infinity;
		for ( let i = 0; i <= 10; i++ ) {
			const deg = angle( i / 10, leadOut );
			assert.ok( deg > last, 'the arm turns in as the side plays' );
			last = deg;
			assert.ok( Math.abs( playedOf( deg, leadOut ) - i / 10 ) < 1e-5, 'put down there, it is the same moment' );
		}
		// At its rest, or past the lead-out, the moment is the side's start or its end.
		assert.equal( playedOf( REST, leadOut ), 0 );
		assert.equal( playedOf( angle( 1, leadOut ) + 5, leadOut ), 1 );
	}
} );
