/**
 * The turntable's order of things, checked frame by frame through a stop and a start: the music is
 * heard only with the stylus down in the groove, the arm is lifted only once the music has stopped
 * and the platter come to rest, the pitch falls and rises through the music's speed, and the
 * platter turns at the music's rate in every frame the music is heard.
 */
const { expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { audioState } = require( './site' );

/**
 * Stops the music and starts it again, from the deck's own key (the deck on its own has no bar),
 * with the turntable out and the music playing.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function stopsAndStarts( page ) {
	await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
	// Each frame: the cue lever, the music, and the platter's rate against the music's.
	await page.evaluate( () => {
		const audio = document.querySelector( '.riff-audio' );
		const arm = document.querySelector( '.riff-arm' );
		const root = document.querySelector( '#riff' );
		const wax = document.querySelector( '.riff-wax' );
		window.riffFrames = [];
		const sample = () => {
			const turn = wax.getAnimations()[ 0 ];
			window.riffFrames.push( {
				up: arm.dataset.riffUp ?? null,
				down: 'riffDown' in arm.dataset,
				paused: audio.paused,
				time: audio.currentTime,
				rate: audio.playbackRate,
				platter: turn && ! turn.pending ? turn.playbackRate : null,
				coasting: 'riffCoasting' in root.dataset,
			} );
			requestAnimationFrame( sample );
		};
		sample();
	} );
	const frames = () => page.evaluate( () => window.riffFrames.splice( 0 ) );
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
	// The eye at rest first: in the chair with the record out, over the deck with it in its sleeve.
	await page.waitForFunction( () => {
		const root = document.querySelector( '#riff' );
		const canvas = document.querySelector( '.riff-deck-gl' );
		const out = root.dataset.riffDeck === 'out' && ! ( 'riffArriving' in root.dataset );
		return ! ( 'riffGl' in root.dataset ) || ! canvas || canvas.dataset.riffCamera === ( out ? 'across' : 'over' );
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

module.exports = { stopsAndStarts, flat, onScreen };
