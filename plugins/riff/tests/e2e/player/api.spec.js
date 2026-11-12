/**
 * The public surface: window.riff.time() and the riff.time action, window.riff.speed(), and a script listening to the player and reshaping what it plays through wp.hooks and riff:* events.
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

	test( 'a script can slow the music down without changing its pitch, for every track after', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		expect( await page.evaluate( () => window.riff.speed() ) ).toBe( 1 );
		const rate = () =>
			page.evaluate( () => {
				const m = [ ...document.querySelectorAll( '#riff audio, #riff video' ) ].find( ( el ) => el.getAttribute( 'src' ) );
				return { rate: m.playbackRate, pitch: m.preservesPitch !== false };
			} );
		expect( await page.evaluate( () => window.riff.speed( 0.75 ) ) ).toBe( 0.75 );
		await expect.poll( rate ).toEqual( { rate: 0.75, pitch: true } );
		// Out of range is held to it; anything that is not a speed is ignored.
		expect( await page.evaluate( () => window.riff.speed( 0.1 ) ) ).toBe( 0.5 );
		expect( await page.evaluate( () => window.riff.speed( 'fast' ) ) ).toBe( 0.5 );
		// The next track plays at the same speed, until it is set back.
		await page.evaluate( () => window.riff.next() );
		await expect( page.locator( '.riff-bar .riff-title' ) ).not.toHaveText( 'Underground' );
		await expect.poll( rate ).toEqual( { rate: 0.5, pitch: true } );
		await page.evaluate( () => window.riff.speed( 1 ) );
		await expect.poll( rate ).toEqual( { rate: 1, pitch: true } );
	} );

	test( 'a script can play another file in place of the track\'s own, and the track\'s own comes back', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect.poll( () => page.evaluate( () => window.riff.time() ) ).toBeGreaterThan( 1 );
		await page.evaluate( () => window.riff.speed( 0.75 ) );
		const now = () =>
			page.evaluate( () => {
				const m = [ ...document.querySelectorAll( '#riff audio, #riff video' ) ].find( ( el ) => el.getAttribute( 'src' ) && ! el.paused );
				return m
					? { src: m.getAttribute( 'src' ), time: m.currentTime, rate: m.playbackRate, pitch: m.preservesPitch !== false }
					: { src: null };
			} );
		const { own: mine, other } = await page.evaluate( () => {
			window.__said = [];
			const root = document.getElementById( 'riff' );
			for ( const name of [ 'track', 'pause' ] ) {
				root.addEventListener( `riff:${ name }`, () => window.__said.push( name ) );
			}
			return { own: window.riff.current().src, other: window.riff.queue()[ 2 ].src };
		} );
		const before = await page.evaluate( () => window.riff.time() );

		// The other file, from the same second, at the same speed, still playing, and still the track.
		expect( await page.evaluate( ( src ) => window.riff.source( src ), other ) ).toBe( true );
		await expect.poll( async () => ( await now() ).src ).toBe( other );
		const swapped = await now();
		expect( swapped.time ).toBeGreaterThanOrEqual( before - 0.25 );
		expect( swapped.time ).toBeLessThan( before + 3 );
		expect( swapped ).toMatchObject( { rate: 0.75, pitch: true } );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Underground' );
		await expect.poll( () => page.evaluate( () => window.riff.time() ) ).toBeGreaterThan( swapped.time + 0.3 );
		expect( await page.evaluate( () => window.__said ) ).toEqual( [] );

		// Null puts the track's own back, from where the other had got to.
		const back = await page.evaluate( () => window.riff.time() );
		expect( await page.evaluate( () => window.riff.source( null ) ) ).toBe( true );
		await expect.poll( async () => ( await now() ).src ).toBe( mine );
		expect( ( await now() ).time ).toBeGreaterThanOrEqual( back - 0.25 );

		// A file that can't be played gives way to the track's own; the track hasn't failed.
		await page.evaluate( () => window.riff.source( '/wp-content/riff-e2e-missing.mp3' ) );
		await expect.poll( async () => ( await now() ).src, { timeout: 10000 } ).toBe( mine );
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute( 'data-error' );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Underground' );

		// Paused, it stays paused.
		await page.evaluate( () => window.riff.toggle() );
		await expect.poll( () => page.evaluate( () => window.riff.playing() ) ).toBe( false );
		await page.evaluate( ( src ) => window.riff.source( src ), other );
		await expect
			.poll( () => page.evaluate( () => document.querySelector( '#riff audio' ).getAttribute( 'src' ) ) )
			.toBe( other );
		expect( await page.evaluate( () => document.querySelector( '#riff audio' ).paused ) ).toBe( true );

		// The next track plays from its own file.
		await page.evaluate( () => window.riff.next() );
		await expect( page.locator( '.riff-bar .riff-title' ) ).not.toHaveText( 'Underground' );
		await expect.poll( async () => ( await now() ).src ).toBe( await page.evaluate( () => window.riff.current().src ) );
		await page.evaluate( () => window.riff.speed( 1 ) );
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
			// What docs/javascript.md promises, and nothing more: tab() went with the tabs, before Riff is on WordPress.org.
			members: [ 'along', 'analyser', 'close', 'closeView', 'control', 'current', 'next', 'on', 'open', 'openView', 'play', 'playing', 'prev', 'queue', 'seek', 'shortcut', 'source', 'speed', 'time', 'toggle', 'version', 'view' ],
		} );
		await page.evaluate( () => window.riff.next() );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus (remix)'
		);
	} );
} );
