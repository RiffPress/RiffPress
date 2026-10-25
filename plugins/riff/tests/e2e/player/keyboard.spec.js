/**
 * The keyboard: Space, K, J, L and the seek line's keys, and the single-key shortcuts turned off by a site (WCAG 2.1.4), on a listener's profile, and absent for a visitor.
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

	test( 'a visitor has no single-key shortcuts, only the Shift ones', async ( { browser } ) => {
		const context = await browser.newContext( { storageState: { cookies: [], origins: [] } } );
		const page = await context.newPage();
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
		const before = ( await audioState( page ) ).time;
		await page.keyboard.press( 'k' );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( before + 0.3 );
		expect( ( await audioState( page ) ).paused ).toBe( false );
		const was = await page.evaluate( () => window.riff.current().id );
		await page.keyboard.press( 'Shift+N' );
		await expect
			.poll( () => page.evaluate( () => window.riff.current().id ) )
			.not.toBe( was );
		// There is no switch in the player to look for.
		await expect( page.locator( '[data-riff-action="shortcuts"]' ) ).toHaveCount( 0 );
		await context.close();
	} );

	test( 'a signed-in listener turns the single-key shortcuts off on their profile', async ( { page } ) => {
		const profile = async ( on ) => {
			await page.goto( '/wp-admin/profile.php' );
			const box = page.getByLabel( /Play and pause with Space or K/ );
			// Under Personal Options, where WordPress keeps a user's other choices about how the site behaves.
			await expect( page.locator( '.riff-shortcuts-wrap th' ) ).toHaveText( 'Keyboard shortcuts in the player' );
			await box.setChecked( on );
			await page.getByRole( 'button', { name: 'Update Profile' } ).click();
			await expect( page.locator( '#message, .notice-success' ).first() ).toBeVisible();
			await expect( box ).toBeChecked( { checked: on } );
		};
		try {
			await profile( false );
			await page.goto( postUrl );
			await page.locator( '.riff-row' ).nth( 1 ).click();
			await expect
				.poll( async () => ( await audioState( page ) ).time )
				.toBeGreaterThan( 0.5 );
			await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
			const before = ( await audioState( page ) ).time;
			await page.keyboard.press( 'k' );
			await expect
				.poll( async () => ( await audioState( page ) ).time )
				.toBeGreaterThan( before + 0.3 );
			expect( ( await audioState( page ) ).paused ).toBe( false );
		} finally {
			await profile( true );
		}
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
		await page.keyboard.press( 'k' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( true );
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
