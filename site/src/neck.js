/**
 * The strings in the global bar's open middle, played. site.css and web.css draw them still, which
 * is what a reader without this script, or with reduced motion, sees; this lays five live strings in
 * their place and plucks one when the pointer crosses it, with the wave equation in string.js.
 *
 * A click on the strings asks them to sound. From then on each pluck also rings, as a steel string
 * (steel.js), tuned as the top five strings of a guitar: E, B, G, D, A. Holding a key while strumming
 * frets a chord, as a guitarist would name it: a letter for its major chord, Shift for minor, 7 held
 * for the seventh (chords.js); a string the shape does not play gives a muted thud. The chord's name
 * shows beside the strings while it is held. The first click strums all five, top to bottom, and a
 * Mute button appears beside them then, and only then.
 *
 * On a phone they sit between the wordmark and Download; a finger strums across them, or taps one.
 *
 * The strings are decoration: hidden from assistive technology, never focused. The Mute button is a
 * real button, in the tab order once there is sound to mute.
 */
import { POINTS, string, step, pluck } from './string.js';
import { OPEN, notes, chordFor } from './chords.js';
import { render } from './steel.js';

const SVG = 'http://www.w3.org/2000/svg';
const SET = [
	// Stroke width, the fundamental shown (cycles a second), how long it shows ringing (s), wound or plain: treble at the top.
	{ width: 1, hz: 7.5, ring: 2, wound: false }, // E4
	{ width: 1.25, hz: 6.3, ring: 2.2, wound: false }, // B3
	{ width: 1.7, hz: 5.2, ring: 2.5, wound: true }, // G3
	{ width: 2.2, hz: 4.3, ring: 2.8, wound: true }, // D3
	{ width: 2.8, hz: 3.5, ring: 3.1, wound: true }, // A2
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
	// A guitar's body under the strings: its air and wood resonances, and the fizz above taken off.
	let body = null;
	function bodyOf( ctx ) {
		const stages = [
			[ 'peaking', 105, 1.3, 3.5 ],
			[ 'peaking', 230, 1.4, 2.5 ],
			[ 'peaking', 2800, 0.9, 1.5 ],
			[ 'highshelf', 6000, 0.7, -5 ],
		].map( ( [ type, frequency, q, gain ] ) => {
			const f = ctx.createBiquadFilter();
			f.type = type;
			f.frequency.value = frequency;
			f.Q.value = q;
			f.gain.value = gain;
			return f;
		} );
		stages.reduce( ( a, b ) => a.connect( b ) );
		stages[ stages.length - 1 ].connect( ctx.destination );
		return stages[ 0 ];
	}
	function sound( s, i, at, force ) {
		if ( ! audio || muted ) {
			return;
		}
		const pitches = chord ? notes( chord ) : OPEN;
		const hz = pitches[ i ];
		const wave = render( {
			rate: audio.sampleRate,
			hz: hz || OPEN[ i ],
			seconds: hz ? 3.5 : 0.25,
			at,
			force,
			wound: s.wound,
			muted: ! hz,
		} );
		const buffer = audio.createBuffer( 1, wave.length, audio.sampleRate );
		buffer.copyToChannel( wave, 0 );
		const source = audio.createBufferSource();
		source.buffer = buffer;
		const gain = audio.createGain();
		gain.gain.value = 0.22;
		source.connect( gain ).connect( body );
		source.start();
	}

	// ---- Chords: the keys held while strumming, as a guitarist names them.
	let chord = null;
	const held = new Set();
	const label = document.createElement( 'span' );
	label.className = 'neck-chord';
	label.setAttribute( 'aria-hidden', 'true' );
	wrap.insertBefore( label, mute.nextSibling );
	const typing = ( e ) => e.target.closest?.( 'input, textarea, select, [contenteditable=""], [contenteditable="true"]' );
	const name = ( e ) => {
		const letters = [ ...held ].filter( ( k ) => /^[a-g]$/.test( k ) );
		chord = chordFor( letters[ letters.length - 1 ], e.shiftKey, held.has( '7' ) );
		label.textContent = chord || '';
	};
	document.addEventListener( 'keydown', ( e ) => {
		if ( ! audio || e.metaKey || e.ctrlKey || e.altKey || typing( e ) ) {
			return;
		}
		held.add( e.key.toLowerCase() === '&' ? '7' : e.key.toLowerCase() );
		name( e );
	} );
	document.addEventListener( 'keyup', ( e ) => {
		held.delete( e.key.toLowerCase() );
		held.delete( e.key.toLowerCase() === '&' ? '7' : '' );
		name( e );
	} );
	window.addEventListener( 'blur', () => {
		held.clear();
		chord = null;
		label.textContent = '';
	} );

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
		const i = lines.indexOf( s );
		// Under the fretting hand a string the chord does not play hardly moves.
		const damped = chord && ! notes( chord )[ i ];
		pluck( s, at, direction * ( height / ( lines.length + 1 ) ) * ( damped ? 0.12 : 0.45 ) * f );
		sound( s, i, at, f );
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
		body = bodyOf( audio );
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
