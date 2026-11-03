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

	test( 'a plugin\'s key follows Riff\'s: listed on the profile, not while typing, and off where Riff\'s are', async ( {
		page,
		context,
		browser,
		baseURL,
	} ) => {
		const cookie = { name: 'riff_test_shortcut', value: '1', url: baseURL };
		await context.addCookies( [ cookie ] );
		await page.goto( '/wp-admin/profile.php' );
		// Listed with whatever keys the site's other plugins, such as Riff Chords, add.
		await expect( page.locator( '.riff-shortcuts-wrap .riff-shortcuts-more li', { hasText: 'Say hello' } ) ).toHaveText( 'O Say hello' );

		// What a plugin's script does, by the key's id: given the track and the key press.
		const give = async ( p ) => {
			await p.goto( postUrl );
			await p.locator( '.riff-row' ).nth( 1 ).click();
			await expect.poll( async () => ( await audioState( p ) ).time ).toBeGreaterThan( 0.5 );
			await p.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
			await p.evaluate( () => {
				window.riffKeys = [];
				window.riffStopKey = window.riff.shortcut( 'e2e-key', ( track, event ) =>
					window.riffKeys.push( `${ track.title } ${ event.key }` )
				);
			} );
		};
		const pressed = ( p ) => p.evaluate( () => window.riffKeys );
		await give( page );
		await page.keyboard.press( 'o' );
		await expect.poll( () => pressed( page ) ).toEqual( [ 'Underground o' ] );
		// A letter acts without Shift; Riff keeps Shift for its own, and the music plays on.
		await page.keyboard.press( 'Shift+O' );
		await page.keyboard.press( 'Control+o' );
		expect( await pressed( page ) ).toHaveLength( 1 );
		expect( ( await audioState( page ) ).paused ).toBe( false );

		// Not while typing.
		await page.evaluate( () => {
			const field = document.createElement( 'input' );
			field.id = 'riff-e2e-field';
			document.body.append( field );
		} );
		await page.locator( '#riff-e2e-field' ).focus();
		await page.keyboard.press( 'o' );
		await expect( page.locator( '#riff-e2e-field' ) ).toHaveValue( 'o' );
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );

		// Off with Riff's own, through the riff.shortcuts filter.
		await page.evaluate( () =>
			window.wp.hooks.addFilter( 'riff.shortcuts', 'test', () => false )
		);
		await page.keyboard.press( 'o' );
		await page.evaluate( () =>
			window.wp.hooks.removeFilter( 'riff.shortcuts', 'test' )
		);
		expect( await pressed( page ) ).toHaveLength( 1 );

		// Taken away, it does nothing; the key is still the plugin's, so Riff doesn't act on it.
		await page.evaluate( () => window.riffStopKey() );
		await page.keyboard.press( 'o' );
		expect( await pressed( page ) ).toHaveLength( 1 );

		// A visitor has no single-key shortcuts, so none of a plugin's either.
		const visitor = await browser.newContext( { storageState: { cookies: [], origins: [] } } );
		await visitor.addCookies( [ cookie ] );
		const other = await visitor.newPage();
		await give( other );
		await other.keyboard.press( 'o' );
		await other.keyboard.press( 'Shift+N' );
		await expect.poll( () => other.evaluate( () => window.riff.current().title ) ).not.toBe( 'Underground' );
		expect( await pressed( other ) ).toEqual( [] );
		await visitor.close();
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
