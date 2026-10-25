'use strict';

/*
 * The strings under riffpress.com's bar move as real strings do. site/src/string.js is the damped
 * wave equation; these check it against the physics: the shape returns once a period (2L / c), the
 * plucked corner splits in two and the halves run apart (Helmholtz motion), the sharp corner rounds
 * off before the note fades, a heavier gauge rings longer, and a long run stays bounded.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const path = require( 'node:path' );
const { pathToFileURL } = require( 'node:url' );

const load = () => import( pathToFileURL( path.join( __dirname, '..', '..', 'site', 'src', 'string.js' ) ).href );
const run = ( m, s, seconds, at = 2000 ) => {
	const dt = 1 / at;
	let peak = 0;
	for ( let t = 0; t < seconds; t += dt ) {
		peak = m.step( s, dt );
	}
	return peak;
};
const corner = ( m, s ) => {
	// Where the shape bends most: the kink.
	let best = 0;
	let at = 0;
	for ( let i = 1; i < m.POINTS; i++ ) {
		const bend = Math.abs( s.now[ i + 1 ] - 2 * s.now[ i ] + s.now[ i - 1 ] );
		if ( bend > best ) {
			best = bend;
			at = i;
		}
	}
	return { at, best };
};

test( 'after one period the string is back where it was plucked, near enough', async () => {
	const m = await load();
	const s = m.string( { hz: 5, ring: 1000 } );
	m.pluck( s, 0.3, 4 );
	const start = Array.from( s.now );
	run( m, s, 1 / 5 );
	const err = Math.max( ...start.map( ( v, i ) => Math.abs( v - s.now[ i ] ) ) );
	assert.ok( err < 0.6, `the shape after one period is ${ err.toFixed( 2 ) } px from the pluck` );
	// Half a period on, it is the pluck mirrored end to end and turned over: u(x, T/2) = -u(L - x, 0).
	run( m, s, 1 / 10 );
	const mirror = s.now[ Math.round( 0.7 * m.POINTS ) ];
	assert.ok( mirror < -3.4, `half a period later the mirror of the pluck point is at ${ mirror.toFixed( 2 ) } px` );
} );

test( 'the plucked corner splits in two that run apart (Helmholtz motion)', async () => {
	const m = await load();
	const s = m.string( { hz: 5, ring: 1000 } );
	m.pluck( s, 0.5, 4 );
	const k = m.POINTS / 2;
	run( m, s, 1 / 40 );
	// A tenth of a period on, the middle is flat and the bends have moved out either side.
	const left = s.now.slice( 0, k ).reduce( ( a, v, i, arr ) => ( i && Math.abs( arr[ i + 1 ] - 2 * v + arr[ i - 1 ] ) > a.b ? { b: Math.abs( arr[ i + 1 ] - 2 * v + arr[ i - 1 ] ), i } : a ), { b: 0, i: 0 } );
	assert.ok( left.i < k - 4, `the left corner moved out to ${ left.i } of ${ k }` );
	assert.ok( Math.abs( s.now[ k ] - s.now[ k - 2 ] ) < 0.05, 'between the corners the string is straight' );
} );

test( 'the corner rounds off before the note fades', async () => {
	const m = await load();
	const s = m.string( { hz: 5, ring: 2 } );
	m.pluck( s, 0.3, 4 );
	const sharp = corner( m, s ).best;
	const peak0 = Math.max( ...s.now );
	run( m, s, 0.6 );
	const sharpRatio = corner( m, s ).best / sharp;
	const peakRatio = Math.max( ...s.now.map( Math.abs ) ) / peak0;
	assert.ok( sharpRatio < peakRatio, `the corner kept ${ sharpRatio.toFixed( 2 ) } of its sharpness, the height ${ peakRatio.toFixed( 2 ) }` );
} );

test( 'a heavier gauge rings longer, and every string falls silent', async () => {
	const m = await load();
	const light = m.string( { hz: 7.5, ring: 1.6 } );
	const heavy = m.string( { hz: 3.5, ring: 3 } );
	m.pluck( light, 0.3, 4 );
	m.pluck( heavy, 0.3, 4 );
	const l = run( m, light, 1.2 );
	const h = run( m, heavy, 1.2 );
	assert.ok( h > l, `after 1.2 s the heavy string moves ${ h.toFixed( 2 ) } px, the light one ${ l.toFixed( 2 ) }` );
	// Down past 0.02 px, where neck.js stops drawing it, within three of its ring times.
	assert.ok( run( m, heavy, 3 * 3 - 1.2 ) < 0.02, 'and it falls silent' );
} );

test( 'a long run stays bounded at the step sizes neck.js uses', async () => {
	const m = await load();
	const s = m.string( { hz: 7.5, ring: 1000 } );
	m.pluck( s, 0.17, 6 );
	// neck.js keeps c dt at 0.8 of a segment: 2 * POINTS * hz * 1.25 steps a second.
	const peak = run( m, s, 3, 2 * m.POINTS * 7.5 * 1.25 );
	assert.ok( Number.isFinite( peak ) && peak <= 6.05, `peak after 3 s is ${ peak }` );
} );
