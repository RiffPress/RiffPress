/**
 * A plucked string, as physics: the damped wave equation on a line of points held still at both
 * ends, solved by finite differences. neck.js draws five of these; .github/scripts/string.test.js
 * holds them to what a real string does.
 */

export const POINTS = 96; // Segments along a string.

// One string: displacement now and a step ago, in pixels, at POINTS + 1 points.
export function string( spec ) {
	return {
		...spec,
		now: new Float32Array( POINTS + 1 ),
		was: new Float32Array( POINTS + 1 ),
		next: new Float32Array( POINTS + 1 ),
		moving: false,
	};
}

// One time step of the damped wave equation, by finite differences. c is in segments per second;
// the step keeps c * dt under one segment, which keeps it stable. The stiffness term takes the
// curvature's change, so sharp corners lose energy faster than the broad shape, as in a real string.
export function step( s, dt ) {
	const c = 2 * POINTS * s.hz;
	const r2 = ( c * dt ) ** 2;
	const decay = Math.exp( -dt / ( s.ring / 4 ) );
	const stiff = 0.04;
	const { now, was, next } = s;
	let peak = 0;
	for ( let i = 1; i < POINTS; i++ ) {
		const curve = now[ i + 1 ] - 2 * now[ i ] + now[ i - 1 ];
		const curveWas = was[ i + 1 ] - 2 * was[ i ] + was[ i - 1 ];
		next[ i ] =
			( 2 * now[ i ] - was[ i ] + r2 * curve + stiff * ( curve - curveWas ) ) *
			decay;
		peak = Math.max( peak, Math.abs( next[ i ] ) );
	}
	next[ 0 ] = 0;
	next[ POINTS ] = 0;
	s.was = now;
	s.now = next;
	s.next = was;
	return peak;
}

// Pulled into a triangle at `at` (0 to 1 along the string) by `by` pixels, and let go from rest.
export function pluck( s, at, by ) {
	const k = Math.min( POINTS - 1, Math.max( 1, Math.round( at * POINTS ) ) );
	for ( let i = 0; i <= POINTS; i++ ) {
		const v = i <= k ? ( by * i ) / k : ( by * ( POINTS - i ) ) / ( POINTS - k );
		s.now[ i ] = s.now[ i ] + v;
		s.was[ i ] = s.now[ i ];
	}
	s.moving = true;
}

