/**
 * The keyboard: Space, K, J, L and the seek line's keys, and the single-key shortcuts turned off by a site (WCAG 2.1.4) and by the listener.
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

	test( 'the single-key shortcuts can be turned off, as WCAG 2.1.4 asks', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
		await page.evaluate( () =>
			window.wp.hooks.addFilter( 'riff.shortcuts', 'test', () => false )
		);
		const before = ( await audioState( page ) ).time;
		await page.keyboard.press( 'k' );
		// Still playing: the time keeps moving past where it was when K was pressed.
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( before + 0.3 );
		expect( ( await audioState( page ) ).paused ).toBe( false );
		await page.evaluate( () =>
			window.wp.hooks.removeFilter( 'riff.shortcuts', 'test' )
		);
		await page.keyboard.press( 'k' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( true );
	} );

	test( 'a listener can turn the single-key shortcuts off, and the choice stays', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		// At the top of Now Playing, on every width.
		await page.locator( '.riff-bar-info' ).click();
		const control = page.locator( '.riff-np-head [data-riff-action="shortcuts"]' );
		await expect( control ).toHaveAttribute( 'aria-pressed', 'true' );
		await control.click();
		await expect( control ).toHaveAttribute( 'aria-pressed', 'false' );
		await expect( control ).toHaveAttribute( 'aria-label', 'Keyboard shortcuts off' );
		// Escape stays on: it closes Now Playing as any dialog's does.
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
		const before = ( await audioState( page ) ).time;
		await page.keyboard.press( 'k' );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( before + 0.3 );
		expect( ( await audioState( page ) ).paused ).toBe( false );
		// The Shift shortcuts stay on too.
		const was = await page.evaluate( () => window.riff.current().id );
		await page.keyboard.press( 'Shift+N' );
		await expect
			.poll( () => page.evaluate( () => window.riff.current().id ) )
			.not.toBe( was );

		// Kept on this device, as the volume is.
		await page.reload();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await page.locator( '.riff-bar-info' ).click();
		await expect( control ).toHaveAttribute( 'aria-pressed', 'false' );
		await control.click();
		await expect( control ).toHaveAttribute( 'aria-pressed', 'true' );
		await page.keyboard.press( 'Escape' );
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
		await page.keyboard.press( 'k' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
	} );

	test( 'the keyboard plays, pauses and seeks', { tag: '@smoke' }, async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
		await page.keyboard.press( 'Space' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( true );
		const paused = ( await audioState( page ) ).time;
		await page.keyboard.press( 'l' );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( paused + 9 );
		await page.keyboard.press( 'j' );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeLessThan( paused + 1 );
		await page.keyboard.press( 'k' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
	} );

	test( 'the seek line moves five seconds a key, and says where it is in words', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		const seek = page.locator( '.riff-bar [data-riff-seek]' );
		await seek.focus();
		const before = ( await audioState( page ) ).time;
		await page.keyboard.press( 'ArrowRight' );
		const after = ( await audioState( page ) ).time;
		expect( after - before ).toBeCloseTo( 5, 1 );
		// Read the moment the key moves it, in the time just reached: not the clock's "0:06 / 7:33".
		await expect( seek ).toHaveAttribute(
			'aria-valuetext',
			`${ Math.floor( after ) } seconds of 7 minutes, 33 seconds`
		);
		await page.keyboard.press( 'ArrowLeft' );
		expect( ( await audioState( page ) ).time ).toBeCloseTo( before, 1 );
	} );
} );
