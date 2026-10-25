/**
 * The seek line: it grows from the right in a right-to-left page, shows how far the file has loaded, stays under the pointer while dragged, and glides on the compositor while a track plays.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { audioState, playerSite } = require( '../helpers/site' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Player', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( postUrl );
	} );

	test( 'right to left, the played part grows from the right', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		const origin = await page.evaluate( () => {
			document.documentElement.dir = 'rtl';
			const fill = document.querySelector(
				'.riff-bar-seek .riff-line i'
			);
			const x = parseFloat( getComputedStyle( fill ).transformOrigin );
			// Layout width: the fill is scaled by the played fraction, which is 0 before playback.
			const width = fill.offsetWidth;
			document.documentElement.dir = 'ltr';
			return { x, width };
		} );
		expect( Math.abs( origin.x - origin.width ) ).toBeLessThan( 1 );
	} );

	test( 'the seek bar shows how far the file has loaded', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await expect
			.poll( () =>
				page.evaluate( () =>
					parseFloat(
						getComputedStyle(
							document.querySelector( '.riff-bar-seek' )
						).getPropertyValue( '--riff-buffered' )
					)
				)
			)
			.toBeGreaterThan( 0 );
	} );

	test( 'while the seek line is dragged it stays under the pointer, and lets go where it was left', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the bar\'s line is a readout on a phone; Now Playing has its own' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		const seek = await page.locator( '.riff-bar-seek' ).boundingBox();
		const y = seek.y + seek.height / 2;
		await page.mouse.move( seek.x + seek.width * 0.6, y );
		await page.mouse.down();
		await page.mouse.move( seek.x + seek.width * 0.75, y, { steps: 5 } );
		// Held still while the track plays on: every frame the line must stay where the pointer
		// put it, not swap back to the time playing, which is what shook.
		const held = await page.evaluate(
			() =>
				new Promise( ( done ) => {
					const node = document.querySelector( '.riff-bar-seek' );
					const seen = [];
					const tick = () => {
						seen.push( parseFloat( node.style.getPropertyValue( '--riff-p' ) ) );
						if ( seen.length < 30 ) {
							requestAnimationFrame( tick );
						} else {
							done( seen );
						}
					};
					requestAnimationFrame( tick );
				} )
		);
		expect( Math.min( ...held ) ).toBeGreaterThan( 0.7 );
		expect( Math.max( ...held ) - Math.min( ...held ) ).toBeLessThan( 0.01 );
		await page.mouse.up();
		await expect
			.poll( async () => {
				const { time, duration } = await page.evaluate( () => {
					const m = document.querySelector( '#riff audio' );
					return { time: m.currentTime, duration: m.duration };
				} );
				return time / duration;
			} )
			.toBeGreaterThan( 0.7 );
	} );

	test( 'while a track plays the seek line glides on the compositor, and a press that moves nothing keeps it gliding', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the bar\'s line, on a wide screen' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		// Animations on the line's layers, transforms only, running: the compositor moves them.
		const gliding = () =>
			page.evaluate( () =>
				document
					.getAnimations()
					.filter(
						( a ) =>
							a.playState === 'running' &&
							a.effect?.target?.closest?.( '.riff-bar-seek' )
					)
					.map( ( a ) =>
						Object.keys( a.effect.getKeyframes()[ 0 ] ).filter(
							( k ) => ! [ 'offset', 'easing', 'composite', 'computedOffset' ].includes( k )
						)
					)
			);
		await expect.poll( async () => ( await gliding() ).length ).toBeGreaterThan( 3 );
		expect( new Set( ( await gliding() ).flat() ) ).toEqual( new Set( [ 'transform' ] ) );
		// A press and release where the line already is changes no value, so no seek follows.
		const seek = await page.locator( '.riff-bar-seek' ).boundingBox();
		const at = await page.evaluate( () => {
			const m = document.querySelector( '#riff audio' );
			return m.currentTime / m.duration;
		} );
		await page.mouse.move( seek.x + seek.width * at, seek.y + seek.height / 2 );
		await page.mouse.down();
		await page.mouse.up();
		await expect.poll( async () => ( await gliding() ).length ).toBeGreaterThan( 3 );
	} );
} );
