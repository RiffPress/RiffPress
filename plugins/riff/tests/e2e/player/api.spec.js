/**
 * The public surface: window.riff.time() and the riff.time action, and a script listening to the player and reshaping what it plays through wp.hooks and riff:* events.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );

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

	test( 'the player says where the track is, as it plays and after a seek', async ( {
		page,
	} ) => {
		await page.evaluate( () => {
			window.__ticks = [];
			window.wp.hooks.addAction( 'riff.time', 'e2e', ( detail ) =>
				window.__ticks.push( { time: detail.time, duration: detail.duration, title: detail.track.title } )
			);
			document.getElementById( 'riff' ).addEventListener( 'riff:time', () => window.__events++ );
			window.__events = 0;
		} );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		// A few times a second as it plays, each with the track and, once known, its length.
		await expect
			.poll( () => page.evaluate( () => window.__ticks.filter( ( t ) => t.time > 0.5 ).length ) )
			.toBeGreaterThan( 1 );
		const tick = await page.evaluate( () => window.__ticks.at( -1 ) );
		expect( tick.title ).toBe( 'Underground' );
		expect( tick.duration ).toBeGreaterThan( tick.time );
		expect( await page.evaluate( () => window.__events ) ).toBeGreaterThan( 0 );
		// A seek is announced as soon as it lands, not at the next tick, and time() agrees.
		await page.evaluate( () => {
			window.__ticks = [];
			window.riff.seek( 4 );
		} );
		await expect
			.poll( () => page.evaluate( () => window.__ticks[ 0 ]?.time ) )
			.toBeGreaterThanOrEqual( 4 );
		expect( await page.evaluate( () => window.riff.time() ) ).toBeGreaterThanOrEqual( 4 );
		await page.evaluate( () => window.wp.hooks.removeAction( 'riff.time', 'e2e' ) );
	} );

	test( 'a script can listen to the player and reshape what it plays', async ( {
		page,
	} ) => {
		// The extension surface: wp.hooks actions and filters, riff:* events, and window.riff.
		await page.evaluate( () => {
			window.__seen = [];
			window.wp.hooks.addAction( 'riff.track', 'e2e', ( detail ) =>
				window.__seen.push( 'hook:' + detail.track.title )
			);
			document
				.getElementById( 'riff' )
				.addEventListener( 'riff:play', () =>
					window.__seen.push( 'event:play' )
				);
			window.wp.hooks.addFilter( 'riff.track', 'e2e', ( track ) => ( {
				...track,
				title: track.title + ' (remix)',
			} ) );
		} );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground (remix)'
		);
		await expect
			.poll( () => page.evaluate( () => window.__seen ) )
			.toEqual(
				expect.arrayContaining( [
					'hook:Underground (remix)',
					'event:play',
				] )
			);
		const api = await page.evaluate( () => ( {
			version: window.riff.version,
			current: window.riff.current().title,
			queue: window.riff.queue().length,
			playing: window.riff.playing(),
			members: Object.keys( window.riff ).sort(),
		} ) );
		expect( api ).toEqual( {
			version: 1,
			current: 'Underground (remix)',
			queue: 3,
			playing: true,
			// What docs/javascript.md promises, and nothing more: a member is not taken back once added.
			members: [ 'close', 'current', 'next', 'on', 'open', 'play', 'playing', 'prev', 'queue', 'seek', 'tab', 'time', 'toggle', 'version' ],
		} );
		await page.evaluate( () => window.riff.next() );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus (remix)'
		);
	} );
} );
