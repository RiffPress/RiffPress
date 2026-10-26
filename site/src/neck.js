/**
 * The strings, played. site.css and web.css draw them still, which is what a reader without this
 * script, or with reduced motion, sees; this lays live strings in their place and plucks one when the
 * pointer crosses it, with the wave equation in string.js.
 *
 * In the global bar they lie in its open middle, between the wordmark and the menu. On a page that
 * asks for it (body[data-neck="margin"]), on a screen wide enough to have a margin, they run down a
 * guitar's neck in the left margin instead, from under the bar to the bridge, at life size (neck.css
 * and neck.svg draw the neck). Either way they strum once, without sound, as the page opens, so they
 * read as strings and not as rules.
 *
 * A click on the strings asks them to sound. From then on each pluck also rings, as a steel string
 * (steel.js), tuned as the top five strings of a guitar: E, B, G, D, A. Holding a key while strumming
 * frets a chord, as a guitarist would name it: a letter for its major chord, Shift for minor, 7 held
 * for the seventh (chords.js); a string the shape does not play gives a muted thud. The chord's name
 * shows in the bar while it is held. The first click strums all five, and a Mute button appears in
 * the bar then, and only then.
 *
 * On a phone a finger strums across them, or taps one.
 *
 * The strings are decoration: hidden from assistive technology, never focused. The Mute button is a
 * real button, in the tab order once there is sound to mute.
 */
import { POINTS, string, step, pluck } from './string.js';
import { OPEN, frets, notes, chordFor } from './chords.js';
import { render } from './steel.js';

const SVG = 'http://www.w3.org/2000/svg';
const SET = [
	// Stroke width, the fundamental shown (cycles a second), how long it shows ringing (s), wound or plain: treble first.
	{ width: 1, hz: 7.5, ring: 2, wound: false }, // E4
	{ width: 1.25, hz: 6.3, ring: 2.2, wound: false }, // B3
	{ width: 1.7, hz: 5.2, ring: 2.5, wound: true }, // G3
	{ width: 2.2, hz: 4.3, ring: 2.8, wound: true }, // D3
	{ width: 2.8, hz: 3.5, ring: 3.1, wound: true }, // A2
];

// The neck's geometry, as neck.svg draws it and neck-svg.js writes it into neck.css: the nut's depth,
// the 25.5-inch scale, and the drawing's length, which the strings run.
const measure = ( name ) => parseFloat( getComputedStyle( document.body ).getPropertyValue( `--svg-${ name }` ) );
// Where fret n stands, as a share of the strings' length.
const fretAt = ( n ) => ( measure( 'nut' ) + measure( 'scale' ) * ( 1 - 2 ** ( -n / 12 ) ) ) / measure( 'h' );
// Where a finger presses for fret n: just behind the fret, as a guitarist's does.
const fingerAt = ( n ) => fretAt( n ) - 0.3 * ( fretAt( n ) - fretAt( n - 1 ) );

// From this width the page has a margin wide enough for the neck at full size (neck.css).
const WIDE = window.matchMedia( '(min-width: 1400px)' );

function neck( bar ) {
	const wrap = bar.querySelector( '.wrap' );
	// The chord and the Mute button, kept together in the bar: beside the strings when they are in it,
	// before the menu when they are in the margin.
	const group = document.createElement( 'div' );
	group.className = 'neck';
	document.body.classList.add( 'has-neck-live' );
	bar.classList.add( 'has-neck-live' );

	// ---- Forward while played, back once left: under the pointer, with a chord held, or while a
	// string the visitor plucked still moves. Going back waits a moment, so a pointer grazing the
	// neck's edge does not make it flicker.
	let hovering = false;
	let ringing = false;
	let rest = 0;
	const wake = () => {
		const awake = hovering || ringing || !! chord;
		clearTimeout( rest );
		if ( awake ) {
			document.body.classList.add( 'neck-awake' );
		} else {
			rest = setTimeout( () => document.body.classList.remove( 'neck-awake' ), 900 );
		}
	};

	// ---- Sound, once asked for.
	let audio = null;
	let muted = false;
	const mute = document.createElement( 'button' );
	mute.type = 'button';
	mute.className = 'neck-mute';
	mute.innerHTML = '<span aria-hidden="true">♪</span><span class="neck-mute-text">Mute</span>';
	mute.setAttribute( 'aria-label', 'Mute the strings' );
	mute.setAttribute( 'aria-pressed', 'false' );
	mute.hidden = true;
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
		// And the room it is played in: a short, soft reverb under the dry sound, from an impulse
		// response made here, noise dying away over a second and a half.
		const room = ctx.createConvolver();
		const ir = ctx.createBuffer( 2, Math.round( ctx.sampleRate * 1.6 ), ctx.sampleRate );
		for ( let c = 0; c < 2; c++ ) {
			const data = ir.getChannelData( c );
			for ( let n = 0; n < data.length; n++ ) {
				data[ n ] = ( Math.random() * 2 - 1 ) * ( 1 - n / data.length ) ** 3;
			}
		}
		room.buffer = ir;
		const wet = ctx.createGain();
		wet.gain.value = 0.16;
		const last = stages[ stages.length - 1 ];
		last.connect( ctx.destination );
		last.connect( room ).connect( wet ).connect( ctx.destination );
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
		// Spread a little across the stereo field, low A to one side and high E to the other, as a
		// guitar sounds to the person playing it.
		const pan = audio.createStereoPanner();
		pan.pan.value = ( 2 - i ) * 0.08;
		// A string sounds one note at a time: plucked again, the note it was ringing stops.
		hush( s, 0.03 );
		source.connect( gain ).connect( pan ).connect( body );
		source.start();
		s.voice = { source, gain };
		source.onended = () => {
			if ( s.voice?.source === source ) {
				s.voice = null;
			}
		};
	}
	// Stops a string's note over a few milliseconds, as a finger or a fresh pluck damps it.
	function hush( s, over ) {
		if ( ! audio || ! s.voice ) {
			return;
		}
		const { source, gain } = s.voice;
		const now = audio.currentTime;
		gain.gain.cancelScheduledValues( now );
		gain.gain.setValueAtTime( gain.gain.value, now );
		gain.gain.linearRampToValueAtTime( 0, now + over );
		source.stop( now + over + 0.01 );
		s.voice = null;
	}

	// ---- Chords: the keys held while strumming, as a guitarist names them.
	let chord = null;
	const held = new Set();
	const label = document.createElement( 'span' );
	label.className = 'neck-chord';
	label.setAttribute( 'aria-hidden', 'true' );
	// Beside the strings, not in them: they are hidden from assistive technology, and it is not.
	group.append( label, mute );
	const typing = ( e ) => e.target.closest?.( 'input, textarea, select, [contenteditable=""], [contenteditable="true"]' );
	const name = ( e ) => {
		const letters = [ ...held ].filter( ( k ) => /^[a-g]$/.test( k ) );
		const was = chord;
		chord = chordFor( letters[ letters.length - 1 ], e.shiftKey, held.has( '7' ) );
		label.textContent = chord || '';
		if ( chord !== was ) {
			fretting();
			wake();
		}
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
		fretting();
		wake();
	} );

	// ---- A set of five strings in a region: along the bar, or down the margin.
	let sets = [];
	function strings( vertical ) {
		const region = document.createElement( 'div' );
		region.className = 'neck-live';
		region.setAttribute( 'aria-hidden', 'true' );
		const svg = document.createElementNS( SVG, 'svg' );
		svg.setAttribute( 'focusable', 'false' );
		svg.setAttribute( 'fill', 'none' );
		region.append( svg );
		const set = { region, vertical, length: 0, across: 0 };
		// In the margin the strings are life size, a little heavier than in the bar.
		const gauge = vertical ? 1.2 : 1;
		const shadows = document.createElementNS( SVG, 'g' );
		svg.append( shadows );
		set.lines = SET.map( ( spec ) => {
			const width = spec.width * gauge;
			// Its shadow on the board, cast down and to the right, which moves as the string does, and
			// meets the string where a finger presses it to the board.
			const shadow = document.createElementNS( SVG, 'path' );
			// In the margin its shadow falls on the rosewood, which is there only while the neck is
			// played: neck.css shows it with the board.
			shadow.setAttribute( 'stroke', vertical ? 'rgba(0,0,0,.5)' : 'rgba(80,55,32,.2)' );
			shadow.setAttribute( 'stroke-width', String( width * 1.1 ) );
			shadow.setAttribute( 'stroke-linecap', 'round' );
			shadows.append( shadow );
			const path = document.createElementNS( SVG, 'path' );
			// Steel, which in the margin reads both on the paper, at rest, and on the rosewood.
			path.setAttribute( 'stroke', vertical ? '#b5ada0' : '#9c8f7b' );
			path.setAttribute( 'stroke-width', String( width ) );
			path.setAttribute( 'stroke-linecap', 'round' );
			// Light along a round wire: one hairline on its top in the bar, on its left in the margin.
			const shine = document.createElementNS( SVG, 'path' );
			shine.setAttribute( 'stroke', 'rgba(255,255,255,.55)' );
			shine.setAttribute( 'stroke-width', String( Math.max( 0.5, width * 0.3 ) ) );
			shine.setAttribute( 'stroke-linecap', 'round' );
			const by = -width * 0.25;
			shine.setAttribute( 'transform', vertical ? `translate(${ by } 0)` : `translate(0 ${ by })` );
			svg.append( path, shine );
			// fret: where the chord frets it, 0 open, null muted; stop: where its sounding length begins.
			return { ...string( spec ), path, shine, shadow, at: 0, base: spec.hz, fret: 0, stop: 0 };
		} );
		// The fretting hand's fingertips, over the strings.
		set.marks = document.createElementNS( SVG, 'g' );
		svg.append( set.marks );
		set.size = () => {
			const width = region.clientWidth;
			const height = region.clientHeight;
			set.length = vertical ? height : width;
			set.across = vertical ? width : height;
			svg.setAttribute( 'viewBox', `0 0 ${ width } ${ height }` );
			// In the bar, evenly; on the neck, closer to its edges than to each other, as neck.svg has them.
			const edge = vertical ? 0.11 : 1 / ( set.lines.length + 1 );
			set.lines.forEach( ( s, i ) => {
				s.at = set.across * ( edge + ( i * ( 1 - 2 * edge ) ) / ( set.lines.length - 1 ) );
			} );
			fret( set );
		};
		set.observer = new ResizeObserver( set.size );
		set.observer.observe( region );
		listen( set );
		return set;
	}
	// A string drawn from the nut to the saddle: still, or moving along its sounding length, which a
	// finger shortens. Its shadow lies a little off it, and meets it where the finger presses.
	function draw( set, s ) {
		const end = set.length - 2;
		const from = s.stop || 2;
		const points = [ [ 2, 0 ] ];
		if ( s.stop ) {
			points.push( [ s.stop, 0 ] );
		}
		if ( s.moving ) {
			for ( let i = 0; i <= POINTS; i++ ) {
				points.push( [ from + ( i / POINTS ) * ( end - from ), s.now[ i ] ] );
			}
		} else {
			points.push( [ end, 0 ] );
		}
		const point = ( along, off ) => ( set.vertical ? `${ off.toFixed( 2 ) } ${ along.toFixed( 1 ) }` : `${ along.toFixed( 1 ) } ${ off.toFixed( 2 ) }` );
		let d = '';
		let shade = '';
		points.forEach( ( [ along, by ], i ) => {
			const lift = s.stop ? Math.min( 1, Math.abs( along - s.stop ) / ( set.across * 0.6 ) ) : 1;
			d += `${ i ? 'L' : 'M' }${ point( along, s.at + by ) }`;
			shade += `${ i ? 'L' : 'M' }${ point( along + lift, s.at + by + 2.5 * lift ) }`;
		} );
		s.path.setAttribute( 'd', d );
		s.shine.setAttribute( 'd', d );
		s.shadow.setAttribute( 'd', shade );
	}

	// The chord held, on the neck: each string stopped where the shape frets it, so it sounds and moves
	// only from the finger to the saddle, faster for being shorter; a fingertip on each, or the index
	// finger laid across several as a barre; an × at the nut on a string the shape does not play.
	function fret( set ) {
		const shape = chord ? frets( chord ) : null;
		const r = set.across * 0.085;
		set.marks.replaceChildren();
		set.lines.forEach( ( s, i ) => {
			const f = shape ? shape[ i ] : 0;
			// Lifting or moving the finger on a string damps the note it was ringing.
			if ( f !== s.fret ) {
				hush( s, 0.08 );
			}
			s.fret = f;
			s.stop = set.vertical && f > 0 ? fingerAt( f ) * set.length : 0;
			s.hz = s.base * ( f > 0 ? 2 ** ( f / 12 ) : 1 );
			s.now.fill( 0 );
			s.was.fill( 0 );
			s.moving = false;
			draw( set, s );
		} );
		if ( ! set.vertical || ! shape ) {
			return;
		}
		const mark = ( tag, attrs ) => {
			const el = document.createElementNS( SVG, tag );
			for ( const [ k, v ] of Object.entries( attrs ) ) {
				el.setAttribute( k, String( v ) );
			}
			el.classList.add( 'neck-finger' );
			set.marks.append( el );
		};
		const finger = { fill: '#1e1e1e', stroke: '#fbf8f2', 'stroke-width': 2 };
		// A barre: the lowest fret, on two strings or more with none between them open or muted.
		const low = Math.min( ...shape.filter( ( f ) => f > 0 ) );
		const on = shape.map( ( f, i ) => ( f === low ? i : -1 ) ).filter( ( i ) => i >= 0 );
		const first = Math.min( ...on );
		const last = Math.max( ...on );
		const barre = on.length > 1 && shape.slice( first, last + 1 ).every( ( f ) => f !== null && f >= low );
		if ( barre ) {
			const y = fingerAt( low ) * set.length;
			const x = set.lines[ first ].at - r;
			mark( 'rect', { x, y: y - r, width: set.lines[ last ].at + r - x, height: 2 * r, rx: r, ...finger } );
		}
		set.lines.forEach( ( s, i ) => {
			const f = shape[ i ];
			if ( f === null ) {
				const y = 22;
				mark( 'path', { d: `M${ s.at - 5 } ${ y - 5 }l10 10m0 -10l-10 10`, stroke: '#fbf8f2', 'stroke-width': 2, 'stroke-linecap': 'round' } );
			} else if ( f > 0 && ! ( barre && f === low ) ) {
				mark( 'circle', { cx: s.at, cy: s.stop, r, ...finger } );
			}
		} );
	}
	const fretting = () => sets.forEach( fret );

	// ---- Motion: the loop runs only while a string moves.
	let running = false;
	let then = 0;
	const frame = ( time ) => {
		const dt = Math.min( 0.05, ( time - then ) / 1000 );
		then = time;
		let any = false;
		for ( const set of sets ) {
			for ( const s of set.lines ) {
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
				draw( set, s );
				any = any || s.moving;
			}
		}
		running = any;
		if ( running ) {
			requestAnimationFrame( frame );
		} else if ( ringing ) {
			ringing = false;
			wake();
		}
	};
	// A pluck pulls as far as the stroke was fast, and never so far it would touch the next string.
	function strike( set, s, at, direction, force, silent = false ) {
		// A stopped string sounds only below the finger; above it, it is held to the board.
		if ( s.stop ) {
			const along = at * set.length;
			if ( along <= s.stop + 2 ) {
				return;
			}
			at = ( along - s.stop ) / ( set.length - s.stop );
		}
		const f = Math.max( 0.35, Math.min( 1, force ) );
		const i = set.lines.indexOf( s );
		if ( ! silent ) {
			ringing = true;
			wake();
		}
		// Under the fretting hand a string the chord does not play hardly moves.
		const damped = chord && ! notes( chord )[ i ];
		pluck( s, at, direction * ( set.across / ( set.lines.length + 1 ) ) * ( damped ? 0.12 : 0.45 ) * f );
		if ( ! silent ) {
			sound( s, i, at, f );
		}
		if ( ! running ) {
			running = true;
			then = performance.now();
			requestAnimationFrame( frame );
		}
	}
	// All five, one after another, as a strum.
	const strum = ( set, force, silent ) =>
		set.lines.forEach( ( s, i ) => setTimeout( () => strike( set, s, 0.3, 1, force, silent ), i * 60 ) );

	function listen( set ) {
		const { region } = set;
		region.addEventListener( 'click', () => {
			if ( audio ) {
				return;
			}
			audio = new ( window.AudioContext || window.webkitAudioContext )();
			body = bodyOf( audio );
			mute.hidden = false;
			strum( set, 0.9, false );
		} );
		// Where a pointer is, across the strings and along them (0 to 1).
		const where = ( e ) => {
			const box = region.getBoundingClientRect();
			const x = e.clientX - box.left;
			const y = e.clientY - box.top;
			return set.vertical ? { off: x, along: y / box.height } : { off: y, along: x / box.width };
		};
		let last = null;
		let lastTime = 0;
		region.addEventListener( 'pointermove', ( e ) => {
			const { off, along } = where( e );
			if ( last !== null ) {
				const speed = Math.abs( off - last ) / Math.max( 1, e.timeStamp - lastTime );
				for ( const s of set.lines ) {
					if ( ( last < s.at && off >= s.at ) || ( last > s.at && off <= s.at ) ) {
						strike( set, s, along, Math.sign( off - last ), 0.3 + speed * 1.5 );
					}
				}
			}
			last = off;
			lastTime = e.timeStamp;
		} );
		region.addEventListener( 'pointerenter', () => {
			hovering = true;
			wake();
		} );
		region.addEventListener( 'pointerleave', () => {
			last = null;
			hovering = false;
			wake();
		} );
		// A finger can tap a string as well as strum: the one nearest the touch is plucked where it was
		// touched. Inside the strings a drag strums rather than scrolls (touch-action in the stylesheet).
		region.addEventListener( 'pointerdown', ( e ) => {
			if ( e.pointerType === 'mouse' ) {
				return;
			}
			const { off, along } = where( e );
			const nearest = set.lines.reduce( ( a, s ) => ( Math.abs( s.at - off ) < Math.abs( a.at - off ) ? s : a ) );
			strike( set, nearest, along, 1, 0.7 );
			last = off;
			lastTime = e.timeStamp;
		} );
		region.addEventListener( 'pointerup', () => ( last = null ) );
	}

	// In the margin when the page asks for it and there is one; in the bar when not.
	const place = () => {
		for ( const set of sets ) {
			set.observer.disconnect();
			set.region.remove();
		}
		const vertical = !! guitar && WIDE.matches;
		group.classList.toggle( 'is-vertical', vertical );
		const set = strings( vertical );
		wrap.insertBefore( group, wrap.querySelector( ':scope > nav' ) );
		if ( vertical ) {
			guitar.append( set.region );
		} else {
			group.prepend( set.region );
		}
		sets = [ set ];
		set.size();
		// Once, as the page opens, so they read as strings and not as rules.
		setTimeout( () => strum( set, 0.5, true ), 400 );
	};
	WIDE.addEventListener( 'change', place );
	place();
}

// The rail in the margin and the guitar on it, which neck.css shows where there is a margin: built
// whether or not the strings will be live, since the guitar itself never moves but with the page.
function rail() {
	const track = document.createElement( 'div' );
	track.className = 'neck-rail';
	track.setAttribute( 'aria-hidden', 'true' );
	track.innerHTML = '<div class="neck-guitar"><div class="neck-strings"></div></div>';
	document.body.append( track );
	document.body.classList.add( 'has-neck-rail' );
	// The nut just under the bars, however tall they are; the Developers bar holds the neck under it
	// once the global one has scrolled away.
	const nav = document.querySelector( '.nav' );
	const local = document.querySelector( '.local-nav' );
	const fit = () => {
		const style = document.body.style;
		style.setProperty( '--neck-top', `${ ( nav?.offsetHeight || 0 ) + ( local?.offsetHeight || 0 ) }px` );
		style.setProperty( '--stick', `${ local?.offsetHeight || 0 }px` );
	};
	new ResizeObserver( fit ).observe( nav || document.body );
	return track.firstElementChild;
}
const guitar = document.body.dataset.neck === 'margin' ? rail() : null;

const bar = document.querySelector( '.nav' );
if (
	bar &&
	! window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches
) {
	neck( bar );
}
