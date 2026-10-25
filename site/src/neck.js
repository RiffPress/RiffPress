/**
 * The strings in the global bar's open middle, played. site.css and web.css draw them still, which
 * is what a reader without this script, or with reduced motion, sees; this lays five live strings in
 * their place and plucks one when the pointer crosses it, with the wave equation in string.js.
 *
 * A click on the strings asks them to sound. From then on each pluck also rings: a Karplus-Strong
 * string, a delay line one period long, averaged and damped as it goes round, which is the physical
 * model of a plucked string, tuned to a D major pentatonic voicing so any strum is in key. The first
 * click strums all five, top to bottom. A Mute button appears beside them then, and only then.
 *
 * On a phone they sit between the wordmark and Download; a finger strums across them, or taps one.
 *
 * The strings are decoration: hidden from assistive technology, never focused. The Mute button is a
 * real button, in the tab order once there is sound to mute.
 */
import { POINTS, string, step, pluck } from './string.js';

const SVG = 'http://www.w3.org/2000/svg';
const SET = [
	// Stroke width, the fundamental shown (cycles a second), how long it rings (s), the note (Hz): treble at the top.
	{ width: 1, hz: 7.5, ring: 2, note: 587.33 }, // D5
	{ width: 1.25, hz: 6.3, ring: 2.2, note: 493.88 }, // B4
	{ width: 1.7, hz: 5.2, ring: 2.5, note: 369.99 }, // F♯4
	{ width: 2.2, hz: 4.3, ring: 2.8, note: 293.66 }, // D4
	{ width: 2.8, hz: 3.5, ring: 3.1, note: 220 }, // A3
];

function neck( bar ) {
	const wrap = bar.querySelector( '.wrap' );
	const region = document.createElement( 'div' );
	region.className = 'neck-live';
	region.setAttribute( 'aria-hidden', 'true' );
	const svg = document.createElementNS( SVG, 'svg' );
	svg.setAttribute( 'focusable', 'false' );
	svg.setAttribute( 'fill', 'none' );
	region.append( svg );
	wrap.insertBefore( region, wrap.querySelector( ':scope > nav' ) );
	bar.classList.add( 'has-neck-live' );

	const lines = SET.map( ( spec ) => {
		const path = document.createElementNS( SVG, 'path' );
		path.setAttribute( 'stroke', '#9c8f7b' );
		path.setAttribute( 'stroke-width', String( spec.width ) );
		path.setAttribute( 'stroke-linecap', 'round' );
		// Light along the top of a round wire: one hairline above the string's centre.
		const shine = document.createElementNS( SVG, 'path' );
		shine.setAttribute( 'stroke', 'rgba(255,255,255,.55)' );
		shine.setAttribute( 'stroke-width', String( Math.max( 0.5, spec.width * 0.3 ) ) );
		shine.setAttribute( 'stroke-linecap', 'round' );
		shine.setAttribute( 'transform', `translate(0 ${ -spec.width * 0.25 })` );
		svg.append( path, shine );
		return { ...string( spec ), path, shine, y: 0 };
	} );

	let width = 0;
	let height = 0;
	const draw = ( s ) => {
		let d = `M2 ${ s.y } H ${ width - 2 }`;
		if ( s.moving ) {
			d = '';
			for ( let i = 0; i <= POINTS; i++ ) {
				const x = 2 + ( i / POINTS ) * ( width - 4 );
				d += `${ i ? 'L' : 'M' }${ x.toFixed( 1 ) } ${ ( s.y + s.now[ i ] ).toFixed( 2 ) }`;
			}
		}
		s.path.setAttribute( 'd', d );
		s.shine.setAttribute( 'd', d );
	};
	const size = () => {
		width = region.clientWidth;
		height = region.clientHeight;
		svg.setAttribute( 'viewBox', `0 0 ${ width } ${ height }` );
		lines.forEach( ( s, i ) => {
			s.y = ( height * ( i + 1 ) ) / ( lines.length + 1 );
			draw( s );
		} );
	};
	new ResizeObserver( size ).observe( region );
	size();

	// ---- Sound, once asked for.
	let audio = null;
	let muted = false;
	const mute = document.createElement( 'button' );
	mute.type = 'button';
	mute.className = 'neck-mute';
	mute.textContent = '♪';
	mute.setAttribute( 'aria-label', 'Mute the strings' );
	mute.setAttribute( 'aria-pressed', 'false' );
	mute.hidden = true;
	// Beside the strings, not in them: they are hidden from assistive technology, and it is not.
	wrap.insertBefore( mute, region.nextSibling );
	mute.addEventListener( 'click', ( e ) => {
		e.stopPropagation();
		muted = ! muted;
		mute.setAttribute( 'aria-pressed', String( muted ) );
	} );
	function sound( s, at, force ) {
		if ( ! audio || muted ) {
			return;
		}
		const rate = audio.sampleRate;
		const period = Math.round( rate / s.note );
		const length = Math.round( rate * s.ring );
		const buffer = audio.createBuffer( 1, length, rate );
		const out = buffer.getChannelData( 0 );
		const ring = new Float32Array( period );
		const k = Math.max( 1, Math.round( at * period ) );
		for ( let i = 0; i < period; i++ ) {
			// The pluck's triangle, and a little noise for the pick.
			const tri = i <= k ? i / k : ( period - i ) / ( period - k );
			ring[ i ] = ( tri - 0.5 ) * 0.6 + ( Math.random() - 0.5 ) * 0.4;
		}
		const damp = 0.994 + s.width * 0.0008;
		for ( let n = 0; n < length; n++ ) {
			const j = n % period;
			out[ n ] = ring[ j ];
			ring[ j ] = damp * 0.5 * ( ring[ j ] + ring[ ( j + 1 ) % period ] );
		}
		const source = audio.createBufferSource();
		source.buffer = buffer;
		const gain = audio.createGain();
		gain.gain.value = 0.16 * force;
		source.connect( gain ).connect( audio.destination );
		source.start();
	}

	// ---- Motion: the loop runs only while a string moves.
	let running = false;
	let then = 0;
	const frame = ( time ) => {
		const dt = Math.min( 0.05, ( time - then ) / 1000 );
		then = time;
		let any = false;
		for ( const s of lines ) {
			if ( ! s.moving ) {
				continue;
			}
			const steps = Math.max( 1, Math.ceil( dt * 2 * POINTS * s.hz * 1.25 ) );
			let peak = 0;
			for ( let n = 0; n < steps; n++ ) {
				peak = step( s, dt / steps );
			}
			if ( peak < 0.02 ) {
				s.now.fill( 0 );
				s.was.fill( 0 );
				s.moving = false;
			}
			draw( s );
			any = any || s.moving;
		}
		running = any;
		if ( running ) {
			requestAnimationFrame( frame );
		}
	};
	// A pluck pulls as far as the stroke was fast, and never so far it would touch the next string.
	function strike( s, at, direction, force ) {
		const f = Math.max( 0.35, Math.min( 1, force ) );
		pluck( s, at, direction * ( height / ( lines.length + 1 ) ) * 0.45 * f );
		sound( s, at, f );
		if ( ! running ) {
			running = true;
			then = performance.now();
			requestAnimationFrame( frame );
		}
	}

	region.addEventListener( 'click', () => {
		if ( audio ) {
			return;
		}
		audio = new ( window.AudioContext || window.webkitAudioContext )();
		mute.hidden = false;
		lines.forEach( ( s, i ) => setTimeout( () => strike( s, 0.5, 1, 0.9 ), i * 70 ) );
	} );
	let last = null;
	let lastTime = 0;
	region.addEventListener( 'pointermove', ( e ) => {
		const box = region.getBoundingClientRect();
		const y = e.clientY - box.top;
		const x = ( e.clientX - box.left ) / box.width;
		if ( last !== null ) {
			const speed = Math.abs( y - last ) / Math.max( 1, e.timeStamp - lastTime );
			for ( const s of lines ) {
				if ( ( last < s.y && y >= s.y ) || ( last > s.y && y <= s.y ) ) {
					strike( s, x, Math.sign( y - last ), 0.3 + speed * 1.5 );
				}
			}
		}
		last = y;
		lastTime = e.timeStamp;
	} );
	region.addEventListener( 'pointerleave', () => ( last = null ) );
	// A finger can tap a string as well as strum: the one nearest the touch is plucked where it was
	// touched. Inside the strings a drag strums rather than scrolls (touch-action in the stylesheet).
	region.addEventListener( 'pointerdown', ( e ) => {
		if ( e.pointerType === 'mouse' ) {
			return;
		}
		const box = region.getBoundingClientRect();
		const y = e.clientY - box.top;
		const nearest = lines.reduce( ( a, s ) => ( Math.abs( s.y - y ) < Math.abs( a.y - y ) ? s : a ) );
		strike( nearest, ( e.clientX - box.left ) / box.width, 1, 0.7 );
		last = y;
		lastTime = e.timeStamp;
	} );
	region.addEventListener( 'pointerup', () => ( last = null ) );
}

const bar = document.querySelector( '.nav' );
if (
	bar &&
	! window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches
) {
	neck( bar );
}
