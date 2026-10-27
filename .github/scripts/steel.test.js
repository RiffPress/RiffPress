'use strict';

/*
 * The strings on riffpress.com sound in tune and ring like steel. site/src/steel.js renders a note;
 * these measure its pitch by autocorrelation and its decay, against the guitar's open strings and
 * the frets a chord uses.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const path = require( 'node:path' );
const { pathToFileURL } = require( 'node:url' );

const load = () => import( pathToFileURL( path.join( __dirname, '..', '..', 'site', 'src', 'steel.js' ) ).href );
const RATE = 48000;

// The fundamental, from the strongest autocorrelation within the guitar's range.
function pitch( wave, from, to ) {
	const slice = wave.slice( from, to );
	let best = 0;
	let lag = 0;
	for ( let l = Math.floor( RATE / 1000 ); l < Math.ceil( RATE / 70 ); l++ ) {
		let sum = 0;
		for ( let i = 0; i + l < slice.length; i++ ) {
			sum += slice[ i ] * slice[ i + l ];
		}
		if ( sum > best ) {
			best = sum;
			lag = l;
		}
	}
	// Refine between samples with a parabola through the peak.
	const at = ( l ) => {
		let sum = 0;
		for ( let i = 0; i + l < slice.length; i++ ) {
			sum += slice[ i ] * slice[ i + l ];
		}
		return sum;
	};
	const a = at( lag - 1 );
	const b = at( lag );
	const c = at( lag + 1 );
	const shift = ( a - c ) / ( 2 * ( a - 2 * b + c ) );
	return RATE / ( lag + shift );
}
const cents = ( got, want ) => 1200 * Math.log2( got / want );
const rms = ( wave, from, to ) => Math.sqrt( wave.slice( from, to ).reduce( ( s, v ) => s + v * v, 0 ) / ( to - from ) );

test( 'every open string and a chord\'s fretted notes are within 5 cents', async () => {
	const { render } = await load();
	// The open strings, and C major's fretted notes (C4 on B, E3 on D, C3 on A).
	for ( const hz of [ 329.63, 246.94, 196, 146.83, 110, 261.63, 164.81, 130.81 ] ) {
		const wave = render( { rate: RATE, hz, seconds: 0.5, at: 0.3 } );
		const got = pitch( wave, RATE * 0.1, RATE * 0.35 );
		assert.ok( Math.abs( cents( got, hz ) ) < 5, `${ hz } Hz came out ${ got.toFixed( 2 ) } Hz, ${ cents( got, hz ).toFixed( 1 ) } cents off` );
	}
} );

test( 'it rings like steel, the wound strings longer, and a muted string is a short thud', async () => {
	const { render } = await load();
	const mute = render( { rate: RATE, hz: 110, seconds: 1, at: 0.3, muted: true } );
	// A pluck is noise, so one note can ring short by chance (about one in forty): the average of
	// eight is what a listener hears, and never comes near the line.
	const kept = ( note ) => {
		let sum = 0;
		for ( let i = 0; i < 8; i++ ) {
			const w = render( { rate: RATE, seconds: 3, at: 0.3, ...note } );
			sum += rms( w, RATE * 1.5, RATE * 1.6 ) / rms( w, RATE * 0.05, RATE * 0.15 );
		}
		return sum / 8;
	};
	const plain = kept( { hz: 329.63 } );
	assert.ok( plain > 0.03, `a plain string keeps ${ plain.toFixed( 3 ) } of its level after 1.5 s` );
	assert.ok( kept( { hz: 110, wound: true } ) > plain, 'a wound string rings longer' );
	assert.ok( rms( mute, RATE * 0.3, RATE * 0.4 ) < 0.001, 'a muted string is silent within a third of a second' );
} );

test( 'plucked mid-string the even harmonics cancel, as on a real string; near the bridge they stay', async () => {
	const { render } = await load();
	// A harmonic's strength by Goertzel's algorithm at that frequency.
	const at = ( w, hz ) => {
		const k = 2 * Math.cos( ( 2 * Math.PI * hz ) / RATE );
		let a = 0;
		let b = 0;
		for ( let n = RATE * 0.02; n < RATE * 0.22; n++ ) {
			const c = w[ n ] + k * a - b;
			b = a;
			a = c;
		}
		return Math.sqrt( a * a + b * b - k * a * b );
	};
	const second = ( place ) => {
		let sum = 0;
		for ( let n = 0; n < 8; n++ ) {
			const w = render( { rate: RATE, hz: 196, seconds: 0.25, at: place } );
			sum += at( w, 392 ) / at( w, 196 );
		}
		return sum / 8;
	};
	const middle = second( 0.5 );
	const bridge = second( 0.1 );
	assert.ok( middle < bridge / 3, `the 2nd harmonic is ${ middle.toFixed( 3 ) } of the fundamental mid-string, ${ bridge.toFixed( 3 ) } near the bridge` );
} );
