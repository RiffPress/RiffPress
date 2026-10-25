/**
 * The neck under the global bar, played. The strings are drawn by site.css and web.css as a
 * background, which is what a reader without this script, or with reduced motion, sees. This lays
 * five live strings over them, in the same places and gauges, and plucks one when a pointer crosses
 * it: the string bends at the point it was touched and rings out, the heavier gauges longer and
 * slower. Over the strings a mouse or a pen holds a pick: its tip leads the way the stroke goes,
 * down or up, it leans with the hand's sideways movement, and it flicks back off each string it
 * catches. It is decoration: hidden from assistive technology, and it never takes focus or a click.
 */
import { animate } from 'animejs';

const STRINGS = [
	// y in the 28px band, stroke width, how long it rings (ms): treble at the top.
	{ y: 4, width: 0.6, ring: 1400 },
	{ y: 9, width: 0.85, ring: 1700 },
	{ y: 14, width: 1.15, ring: 2000 },
	{ y: 19, width: 1.55, ring: 2400 },
	{ y: 24, width: 2.1, ring: 2800 },
];
const HEIGHT = 28;
const SVG = 'http://www.w3.org/2000/svg';

// The pick: a 351 shape in tortoiseshell, its tip at the bottom of a 24 by 28 box.
const PICK = `<svg viewBox="0 0 24 28" width="24" height="28" aria-hidden="true" focusable="false"><defs><radialGradient id="neck-shell" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#e2a24f"/><stop offset=".55" stop-color="#b8651f"/><stop offset="1" stop-color="#6e3412"/></radialGradient></defs><path d="M12 27C6.5 22.5 1 15 1 8.5 1 3.5 5.5 1 12 1s11 2.5 11 7.5C23 15 17.5 22.5 12 27Z" fill="url(#neck-shell)" stroke="#5a2a0e" stroke-width=".6"/><ellipse cx="8.5" cy="7" rx="3.2" ry="1.6" fill="#fff" opacity=".22"/></svg>`;

function pick() {
	const el = document.createElement( 'div' );
	el.className = 'neck-pick';
	el.innerHTML = PICK;
	document.body.append( el );
	const state = { x: 0, y: 0, angle: 0, flick: 0 };
	let turning = null;
	let flicking = null;
	const place = () => {
		el.style.transform = `translate(${ state.x - 12 }px, ${ state.y - 27 }px) rotate(${ state.angle + state.flick }deg)`;
	};
	return {
		show: ( on ) => el.classList.toggle( 'is-on', on ),
		// The tip leads: down a downstroke (0 degrees), up an upstroke (180), leaning with the
		// sideways part of the movement, up to 35 degrees either way.
		move( x, y, dx, dy ) {
			state.x = x;
			state.y = y;
			if ( Math.abs( dy ) > 0.5 || Math.abs( dx ) > 0.5 ) {
				const down = dy >= 0;
				const lean = Math.max( -35, Math.min( 35, dx * 3 ) );
				let to = down ? -lean : 180 + lean;
				// Turn the short way round.
				while ( to - state.angle > 180 ) {
					to -= 360;
				}
				while ( to - state.angle < -180 ) {
					to += 360;
				}
				turning?.pause();
				turning = animate( state, {
					angle: to,
					duration: 220,
					ease: 'outQuad',
					onUpdate: place,
				} );
			}
			place();
		},
		// Caught on a string: bent back against the stroke, then springing through.
		flick( direction ) {
			flicking?.pause();
			state.flick = -14 * direction;
			flicking = animate( state, {
				flick: 0,
				duration: 420,
				ease: 'outElastic(1, .4)',
				onUpdate: place,
			} );
		},
	};
}

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
	let lastX = null;
	const hand = window.matchMedia( '(hover: hover) and (pointer: fine)' )
		.matches
		? pick()
		: null;
	svg.addEventListener(
		'pointerenter',
		( e ) => e.pointerType !== 'touch' && hand?.show( true )
	);
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
					hand?.flick( y > last ? 1 : -1 );
				}
			}
		}
		hand?.move(
			e.clientX,
			e.clientY,
			lastX === null ? 0 : e.clientX - lastX,
			last === null ? 0 : y - last
		);
		last = y;
		lastX = e.clientX;
	} );
	svg.addEventListener( 'pointerleave', () => {
		last = null;
		lastX = null;
		hand?.show( false );
	} );
}

const bar = document.querySelector( '.nav' );
if (
	bar &&
	! window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches
) {
	neck( bar );
}
