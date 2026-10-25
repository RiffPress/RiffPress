/**
 * The global bar is the neck, and its five strings can be played. site.css and web.css draw them
 * still, as a background behind the wordmark and the links, which is what a reader without this
 * script, or with reduced motion, sees. This lays five live strings over them, in the same places
 * and gauges, and plucks one when the pointer crosses it.
 *
 * Each string is the wave equation, solved on a line of points held still at both ends: a pluck
 * pulls it into a triangle at the point crossed, as a pick does, and lets go. What follows is what
 * a real string does: the corner splits into two that run to the ends and back (Helmholtz motion),
 * the sharpest part of the shape fades first, so the corner rounds off, and the whole note dies
 * away. A heavier gauge vibrates slower and rings longer; a faster stroke pulls further. The only
 * thing not as in life is the speed, slowed from a few hundred cycles a second to a few, so the eye
 * can follow it.
 *
 * It is decoration: hidden from assistive technology, and it never takes focus or a click.
 */

import { POINTS, string, step, pluck } from './string.js';

const SVG = 'http://www.w3.org/2000/svg';
const STRINGS = [
	// Stroke width, the fundamental as shown (cycles a second), how long it rings (seconds): treble at the top.
	{ width: 1, hz: 7.5, ring: 1.6 },
	{ width: 1.35, hz: 6.3, ring: 1.9 },
	{ width: 1.8, hz: 5.2, ring: 2.2 },
	{ width: 2.4, hz: 4.3, ring: 2.6 },
	{ width: 3, hz: 3.5, ring: 3 },
];

function neck( bar ) {
	const svg = document.createElementNS( SVG, 'svg' );
	svg.setAttribute( 'class', 'neck-live' );
	svg.setAttribute( 'aria-hidden', 'true' );
	svg.setAttribute( 'focusable', 'false' );
	const lines = STRINGS.map( ( spec ) => {
		const path = document.createElementNS( SVG, 'path' );
		path.setAttribute( 'stroke-width', String( spec.width ) );
		svg.append( path );
		return { ...string( spec ), path, y: 0 };
	} );
	bar.prepend( svg );
	bar.classList.add( 'has-neck-live' );

	let width = 0;
	let height = 0;
	const draw = ( s ) => {
		if ( ! s.moving ) {
			s.path.setAttribute( 'd', `M0 ${ s.y } H ${ width }` );
			return;
		}
		let d = '';
		for ( let i = 0; i <= POINTS; i++ ) {
			const x = ( ( i / POINTS ) * width ).toFixed( 1 );
			d += `${ i ? 'L' : 'M' }${ x } ${ ( s.y + s.now[ i ] ).toFixed( 2 ) }`;
		}
		s.path.setAttribute( 'd', d );
	};
	// Five strings evenly through the bar's height, as the stylesheet draws them.
	const size = () => {
		width = svg.clientWidth;
		height = svg.clientHeight;
		svg.setAttribute( 'viewBox', `0 0 ${ width } ${ height }` );
		lines.forEach( ( s, i ) => {
			s.y = ( height * ( i + 1 ) ) / ( lines.length + 1 );
			draw( s );
		} );
	};
	new ResizeObserver( size ).observe( svg );
	size();

	// The frame loop runs only while a string still moves, in steps short enough to stay stable.
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
	const start = () => {
		if ( ! running ) {
			running = true;
			then = performance.now();
			requestAnimationFrame( frame );
		}
	};

	// A pointer crossing a string's line between two moves plucks it, in the way it was moving, as
	// far as the stroke was fast, and never so far it would touch the next string.
	let last = null;
	let lastTime = 0;
	bar.addEventListener( 'pointermove', ( e ) => {
		const box = svg.getBoundingClientRect();
		const y = e.clientY - box.top;
		const x = ( e.clientX - box.left ) / box.width;
		if ( last !== null ) {
			const gap = height / ( lines.length + 1 );
			const speed =
				Math.abs( y - last ) / Math.max( 1, e.timeStamp - lastTime );
			for ( const s of lines ) {
				if ( ( last < s.y && y >= s.y ) || ( last > s.y && y <= s.y ) ) {
					const by =
						Math.sign( y - last ) *
						Math.min( gap * 0.4, 1.5 + speed * 6 );
					pluck( s, x, by );
					start();
				}
			}
		}
		last = y;
		lastTime = e.timeStamp;
	} );
	bar.addEventListener( 'pointerleave', () => ( last = null ) );
}

const bar = document.querySelector( '.nav' );
if (
	bar &&
	! window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches
) {
	neck( bar );
}
