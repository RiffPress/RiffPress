/**
 * The turntable's order of things, checked frame by frame: what has to happen, in what order, for
 * the deck to be a deck (realityHolds()), and the stop and the start it is first checked through.
 * The deck is drawn in WebGL (deck-gl.js) and the page's deck is its control layer, which keeps
 * every part of the turntable's state with or without a graphics card: controlLayer() runs the
 * control layer alone, as the drawn deck lays it with no card to draw on, so the order of things
 * is checked in every browser, CI's too.
 */
const { expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { audioState } = require( './site' );

/**
 * Runs the turntable's control layer without a graphics card: deck-gl.js is swapped for a module
 * that says it has drawn and lays nothing, so the page's deck is where it is laid out, flat, and
 * Now Playing is the turntable rather than the cover alone it is where nothing can draw it. Call
 * before the page loads.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function controlLayer( page ) {
	await page.route( /\/assets\/player\/deck-gl\.js(\?|$)/, ( route ) =>
		route.fulfill( {
			contentType: 'text/javascript',
			body: 'export default function ( P ) { P.root.dataset.riffGl = ""; return { wake() {} }; }',
		} )
	);
}

/**
 * Runs the drawn deck (deck-gl.js) as if a graphics card drew it, drawing nothing: its card's name
 * kept to itself, and every draw call a no-op. On a test machine the card is software, which Riff
 * refuses because every frame would cost the page's own thread; this way the deck goes through
 * every step but the drawing itself (its eye, the control layer laid where it draws, the keys'
 * reach), which is what is measured, not the pixels. Call before the page loads.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function drawnWithoutPixels( page ) {
	await page.addInitScript( () => {
		const proto = window.WebGL2RenderingContext?.prototype;
		if ( ! proto ) {
			return;
		}
		const extension = proto.getExtension;
		proto.getExtension = function( name ) {
			return name === 'WEBGL_debug_renderer_info' ? null : extension.call( this, name );
		};
		for ( const draw of [ 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements' ] ) {
			proto[ draw ] = () => {};
		}
	} );
}

// How far the stylus is from the record's centre, as a share of its radius: the end of the arm's
// tube, at the stylus, as drawn on the screen, against the record's own box (its grooves turn
// inside it), on the page's flat deck.
const stylus = ( page ) =>
	flat( page, () => {
		const record = document.querySelector( '.riff-record' ).getBoundingClientRect();
		const grip = document.querySelector( '.riff-arm-grip' );
		const p = grip.getPointAtLength( grip.getTotalLength() );
		const at = new DOMPoint( p.x, p.y ).matrixTransform( grip.getScreenCTM() );
		const r = record.width / 2;
		return Math.hypot( at.x - record.left - r, at.y - record.top - r ) / r;
	} );
// The platter's turn, in degrees a second, from the record's own animation.
const turning = ( page ) =>
	page.locator( '.riff-wax' ).evaluate( ( el ) => {
		const turn = el.getAnimations()[ 0 ];
		return turn ? ( 360000 / turn.effect.getTiming().duration ) * turn.playbackRate : 0;
	} );
// A 12-inch side's grooves run from 97% of the radius at the lead-in to 40% at the lead-out, its
// playing time evenly across them.
const groove = ( played ) => 0.97 - ( 0.97 - 0.4 ) * played;

// The music stopped and the arm still, so a hand can find it where it is drawn.
async function still( page ) {
	await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
	await page.locator( ':is(.riff-bar:not([inert]), .riff-keys) [data-riff-action="toggle"]:visible' ).click();
	await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( true );
	await page.evaluate( () =>
		Promise.all( document.querySelector( '.riff-arm-tube' ).getAnimations().map( ( a ) => a.finished ) )
	);
}

// A point on the arm's tube, near its headshell, on the screen, where it is drawn.
const onArm = async ( page ) => {
	const at = await flat( page, () => {
		const path = document.querySelector( '.riff-arm-grip' );
		const p = path.getPointAtLength( path.getTotalLength() * 0.85 );
		const q = new DOMPoint( p.x, p.y ).matrixTransform( path.getScreenCTM() );
		return [ q.x, q.y ];
	} );
	const [ [ x, y ] ] = await onScreen( page, [ at ] );
	return { x, y };
};
// A point of the record, as a share of its box across and down, on the screen, where it is drawn.
const onRecord = async ( page, across, down ) => {
	const record = await page.locator( '.riff-record' ).boundingBox();
	const [ [ x, y ] ] = await onScreen( page, [ [ record.x + record.width * across, record.y + record.height * down ] ] );
	return [ x, y ];
};

/**
 * Records every frame from now on: the cue lever (`up`: null down, "" up, "lowering"), whether the
 * stylus is down and whether the arm is in the hand, the arm's turn as shown and how far its stylus
 * is from the spindle (a share of the record's radius, on the page's flat deck) against where the
 * grooves end, whether the music is heard, its track and time, its rate and the platter's, the rate
 * (playing, and the music moved on since the frame before), the rate
 * of everything that turns with the platter (its grooves, its label, the strobe), whether the record
 * is out and whether a record is changing, which way the drawn deck's eye looks, and when the frame
 * was.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @return {Promise<Function>} Takes the frames recorded since it was last called.
 */
async function sampled( page ) {
	await page.evaluate( () => {
		const audio = document.querySelector( '.riff-audio' );
		const arm = document.querySelector( '.riff-arm' );
		const root = document.querySelector( '#riff' );
		const wax = document.querySelector( '.riff-wax' );
		const tube = document.querySelector( '.riff-arm-tube' );
		const grip = document.querySelector( '.riff-arm-grip' );
		const record = document.querySelector( '.riff-stage > .riff-record' );
		const laidParts = [ ...document.querySelectorAll( '.riff-mount, .riff-cue, .riff-keys' ) ];
		const rotation = ( el ) => parseFloat( getComputedStyle( el ).rotate ) || 0;
		window.riffFrames = [];
		let last = audio.currentTime;
		const sample = () => {
			const turn = wax.getAnimations()[ 0 ];
			// Heard: playing, and the music moved on since the last frame; asked to play and not yet
			// sounding is not heard.
			const heard = ! audio.paused && audio.currentTime !== last;
			last = audio.currentTime;
			// The stylus, on the page's flat deck: the transforms that lay the arm where it is drawn
			// lifted for the moment.
			const laid = laidParts.map( ( part ) => part.style.transform );
			laidParts.forEach( ( part ) => ( part.style.transform = 'none' ) );
			const box = record.getBoundingClientRect();
			const end = grip.getPointAtLength( grip.getTotalLength() );
			const tip = new DOMPoint( end.x, end.y ).matrixTransform( grip.getScreenCTM() );
			laidParts.forEach( ( part, i ) => ( part.style.transform = laid[ i ] ) );
			window.riffFrames.push( {
				up: arm.dataset.riffUp ?? null,
				down: 'riffDown' in arm.dataset,
				held: 'riffHeld' in arm.dataset,
				arm: rotation( arm ) + rotation( tube ),
				r: Math.hypot( tip.x - box.left - box.width / 2, tip.y - box.top - box.height / 2 ) / ( box.width / 2 ),
				leadOut: parseFloat( getComputedStyle( root ).getPropertyValue( '--riff-lead-out' ) ) / 100 || 0.4,
				turns: [ ...document.querySelectorAll( '.riff-stage > .riff-record .riff-turns, .riff-strobe-room .riff-turns' ) ].map( ( el ) => {
					const a = el.getAnimations()[ 0 ];
					return a && ! a.pending ? a.playbackRate : null;
				} ),
				out: root.dataset.riffDeck === 'out',
				changing: 'riffArriving' in root.dataset || !! document.querySelector( '.riff-leaving' ),
				camera: document.querySelector( '.riff-deck-gl' )?.dataset.riffCamera ?? null,
				paused: audio.paused,
				heard,
				time: audio.currentTime,
				src: audio.currentSrc,
				at: performance.now(),
				rate: audio.playbackRate,
				platter: turn && ! turn.pending ? turn.playbackRate : null,
				coasting: 'riffCoasting' in root.dataset,
			} );
			requestAnimationFrame( sample );
		};
		sample();
	} );
	return () => page.evaluate( () => window.riffFrames.splice( 0 ) );
}

/**
 * Checks, in every frame sampled() took, what a turntable can't help but do, so the immersion
 * holds:
 *
 * - the music is heard only with the stylus down in a groove and the platter turning, its pitch
 *   (the music's rate) the platter's own while the motor has it;
 * - the platter's speed never jumps, and its grooves, its label and the strobe turn with it;
 * - the arm never leaps: it is moved across the record only lifted by the cue lever or in the
 *   hand, and set down only in a groove (or off the record, on its rest); the lever is up before
 *   it is carried and down before anything is heard;
 * - a record or side changes in silence: stopped and lifted first, set down and played after, and
 *   the drawn deck's eye stays in its chair throughout.
 *
 * Less motion asked for has the cover rather than the deck (now-playing.js), so there is nothing to
 * shorten here; the order is the same at any duration, and these checks don't time anything.
 *
 * @param {Object[]} frames What sampled() took.
 */
function realityHolds( frames ) {
	expect( frames.length, 'frames sampled' ).toBeGreaterThan( 1 );
	const said = ( what, f, i ) => `${ what }, at frame ${ i } of ${ frames.length }: ${ JSON.stringify( f ) }`;
	// From the lead-in to the lead-out, with a little either way for the stylus's own width.
	const grooved = ( f ) => f.r >= f.leadOut - 0.03 && f.r <= 0.97 + 0.03;
	frames.forEach( ( f, i ) => {
		if ( f.heard ) {
			expect( f.down && f.up === null && ! f.held, said( 'heard only with the stylus down', f, i ) ).toBe( true );
			expect( grooved( f ), said( 'heard only with the stylus in a groove', f, i ) ).toBe( true );
			expect( f.platter ?? 0, said( 'heard only on a turning platter', f, i ) ).toBeGreaterThan( 0 );
			if ( ! f.coasting && f.platter !== null ) {
				expect( Math.abs( f.platter - f.rate ), said( 'the pitch the platter\'s speed', f, i ) ).toBeLessThan( 1e-3 );
			}
			expect( f.changing, said( 'nothing heard while a record changes', f, i ) ).toBe( false );
		}
		const known = f.turns.filter( ( t ) => t !== null );
		expect( known.every( ( t ) => Math.abs( t - known[ 0 ] ) < 1e-3 ), said( 'the grooves, the label and the strobe turn as one', f, i ) ).toBe( true );
		if ( f.camera !== null ) {
			expect( f.camera, said( 'the eye in its chair', f, i ) ).toBe( 'across' );
		}
		const p = frames[ i - 1 ];
		if ( ! p ) {
			return;
		}
		const dt = Math.max( ( f.at - p.at ) / 1000, 1 / 120 );
		if ( f.platter !== null && p.platter !== null ) {
			expect( Math.abs( f.platter - p.platter ), said( 'the platter\'s speed never jumps', f, i ) ).toBeLessThanOrEqual( 0.1 + 4 * dt );
		}
		const moved = Math.abs( f.arm - p.arm );
		const inHand = f.held || p.held;
		if ( ! inHand ) {
			expect( moved, said( 'the arm never leaps', f, i ) ).toBeLessThanOrEqual( 1 + 60 * dt );
		}
		if ( f.out && p.out && ! inHand && moved > 0.2 + 2 * dt ) {
			expect( f.up === '' || p.up === '' || ! f.down || ! p.down, said( 'the arm carried only lifted', f, i ) ).toBe( true );
		}
		const touchdown = f.down && f.up === null && ! f.held && ( p.up !== null || p.held || ! p.down );
		if ( touchdown ) {
			expect( grooved( f ), said( 'set down only in a groove', f, i ) ).toBe( true );
		}
	} );
}

/**
 * Stops the music and starts it again, from the deck's own key (the deck on its own has no bar),
 * with the turntable out and the music playing.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function stopsAndStarts( page ) {
	await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
	const frames = await sampled( page );
	const toggle = page.locator( ':is(.riff-bar:not([inert]), .riff-keys) [data-riff-action="toggle"]:visible' ).first();
	const tracked = ( all ) =>
		all.filter( ( f ) => ! f.paused && ! f.coasting && f.platter !== null ).every( ( f ) => Math.abs( f.platter - f.rate ) < 1e-3 );

	// Stopped: the pitch falls while the stylus stays in the groove, and the arm is raised only
	// once the music is silent and the platter at rest.
	await toggle.click();
	await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-up', '' );
	const stop = await frames();
	expect( stop.filter( ( f ) => ! f.paused ).some( ( f ) => f.rate < 0.5 ), 'heard slowing' ).toBe( true );
	expect( stop.filter( ( f ) => f.up !== null ).every( ( f ) => f.paused ), 'lifted only once silent' ).toBe( true );
	const silent = stop.findIndex( ( f ) => f.paused );
	expect( stop.slice( silent ).some( ( f ) => f.coasting && f.up === null ), 'still down as the platter comes to rest' ).toBe( true );
	expect( tracked( stop ), 'the platter at the music\'s rate' ).toBe( true );

	// Started: the arm is lowered, and nothing is heard until the stylus is in the groove;
	// then the pitch rises from there with the platter.
	await toggle.click();
	await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
	await expect.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).playbackRate ) ).toBe( 1 );
	const start = await frames();
	const at = start[ 0 ].time;
	expect( start.some( ( f ) => f.up === 'lowering' ), 'lowered' ).toBe( true );
	expect( start.filter( ( f ) => f.up !== null ).every( ( f ) => f.paused && f.time === at ), 'silent until down' ).toBe( true );
	const heard = start.filter( ( f ) => ! f.paused );
	expect( heard.every( ( f ) => f.up === null && f.down ) ).toBe( true );
	expect( heard[ 0 ].rate ).toBeLessThan( 0.5 );
	expect( tracked( start ), 'the platter at the music\'s rate' ).toBe( true );
}

/**
 * Measures the page's deck as it is laid out flat: the transforms deck-gl.js lays its arm, cue and
 * keys with, where the deck is drawn from a chair, lifted for the moment of the measurement. Where
 * nothing is laid (no WebGL), the deck as it is.
 *
 * @param {import('@playwright/test').Page} page    Page.
 * @param {Function}                        measure Run in the page, with arg; returns what it measured.
 * @param {*}                               [arg]   Passed to measure.
 * @return {Promise<*>} What measure returned.
 */
function flat( page, measure, arg ) {
	return page.evaluate(
		( [ source, given ] ) => {
			const parts = [ ...document.querySelectorAll( '.riff-mount, .riff-cue, .riff-keys' ) ];
			const laid = parts.map( ( part ) => part.style.transform );
			parts.forEach( ( part ) => ( part.style.transform = 'none' ) );
			try {
				// eslint-disable-next-line no-new-func
				return new Function( 'arg', `return ( ${ source } )( arg );` )( given );
			} finally {
				parts.forEach( ( part, i ) => ( part.style.transform = laid[ i ] ) );
			}
		},
		[ measure.toString(), arg ]
	);
}

/**
 * Points of the page's flat deck on the screen: carried through the transform deck-gl.js laid the
 * arm's mount with ('arm'), or the cue in the record's own plane ('record'). Where nothing is laid,
 * the same points.
 *
 * @param {import('@playwright/test').Page} page   Page.
 * @param {number[][]}                      points [x, y] each, on the flat deck.
 * @param {string}                          plane  'arm' or 'record'.
 * @return {Promise<number[][]>} [x, y] each, on the screen, once the eye is at rest.
 */
async function onScreen( page, points, plane = 'arm' ) {
	// Where the deck is drawn, once it has been laid where the eye sees it.
	await page.waitForFunction( () => {
		const canvas = document.querySelector( '.riff-deck-gl' );
		return ! canvas || canvas.dataset.riffCamera === 'across';
	} );
	return page.evaluate(
		( [ list, which ] ) => {
			const mount = document.querySelector( '.riff-mount' );
			const cue = document.querySelector( '.riff-cue' );
			const laid = [ mount.style.transform, cue.style.transform ];
			mount.style.transform = cue.style.transform = 'none';
			const box = mount.getBoundingClientRect();
			[ mount.style.transform, cue.style.transform ] = laid;
			let m = new DOMMatrix( laid[ 0 ] || 'none' );
			if ( which === 'record' ) {
				m = m.multiply( new DOMMatrix( laid[ 1 ] || 'none' ) );
			}
			return list.map( ( [ x, y ] ) => {
				const q = m.transformPoint( new DOMPoint( x - box.left, y - box.top, 0, 1 ) );
				return [ box.left + q.x / q.w, box.top + q.y / q.w ];
			} );
		},
		[ points, plane ]
	);
}

module.exports = { controlLayer, drawnWithoutPixels, stopsAndStarts, sampled, realityHolds, flat, onScreen, stylus, turning, groove, still, onArm, onRecord };
