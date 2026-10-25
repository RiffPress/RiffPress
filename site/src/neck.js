/**
 * The neck under the global bar, played. The strings are drawn by site.css and web.css as a
 * background, which is what a reader without this script, or with reduced motion, sees. This lays
 * five live strings over them, in the same places and gauges, and plucks one when a pointer crosses
 * it: the string bends at the point it was touched and rings out, the heavier gauges longer and
 * slower. It is decoration: hidden from assistive technology, and it never takes focus or a click.
 */
import { animate } from 'animejs';

const STRINGS = [
	// y in the 40px band, stroke width, how long it rings (ms): treble at the top.
	{ y: 6, width: 1, ring: 1400 },
	{ y: 13, width: 1.35, ring: 1700 },
	{ y: 20, width: 1.8, ring: 2000 },
	{ y: 27, width: 2.4, ring: 2400 },
	{ y: 34, width: 3, ring: 2800 },
];
const HEIGHT = 40;
const SVG = 'http://www.w3.org/2000/svg';

function neck( bar ) {
	const svg = document.createElementNS( SVG, 'svg' );
	svg.setAttribute( 'class', 'neck-live' );
	svg.setAttribute( 'aria-hidden', 'true' );
	svg.setAttribute( 'focusable', 'false' );
	const lines = STRINGS.map( ( s ) => {
		const path = document.createElementNS( SVG, 'path' );
		path.setAttribute( 'stroke-width', String( s.width ) );
		svg.append( path );
		return { ...s, path, bend: { at: 0, by: 0 }, motion: null };
	} );
	bar.append( svg );
	bar.classList.add( 'has-neck-live' );

	let width = 0;
	const draw = ( line ) => {
		const { y, path, bend } = line;
		path.setAttribute(
			'd',
			bend.by
				? `M0 ${ y } Q ${ bend.at } ${ y + bend.by * 2 } ${ width } ${ y }`
				: `M0 ${ y } H ${ width }`
		);
	};
	const size = () => {
		width = svg.clientWidth;
		svg.setAttribute( 'viewBox', `0 0 ${ width } ${ HEIGHT }` );
		lines.forEach( draw );
	};
	new ResizeObserver( size ).observe( svg );
	size();

	const pluck = ( line, x, direction ) => {
		line.motion?.pause();
		line.bend.at = x;
		line.bend.by = 5 * direction;
		line.motion = animate( line.bend, {
			by: 0,
			duration: line.ring,
			ease: 'outElastic(1, .18)',
			onUpdate: () => draw( line ),
			onComplete: () => draw( line ),
		} );
	};

	// A pointer crossing a string's line between two moves plucks it, in the way it was moving.
	let last = null;
	svg.addEventListener( 'pointermove', ( e ) => {
		const box = svg.getBoundingClientRect();
		const y = e.clientY - box.top;
		const x = e.clientX - box.left;
		if ( last !== null ) {
			for ( const line of lines ) {
				if (
					( last < line.y && y >= line.y ) ||
					( last > line.y && y <= line.y )
				) {
					pluck( line, x, y > last ? 1 : -1 );
				}
			}
		}
		last = y;
	} );
	svg.addEventListener( 'pointerleave', () => ( last = null ) );
}

const bar = document.querySelector( '.nav' );
if (
	bar &&
	! window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches
) {
	neck( bar );
}
