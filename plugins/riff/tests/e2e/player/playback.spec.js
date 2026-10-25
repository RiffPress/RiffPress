/**
 * Playback: a tap plays in the bar and the lock screen gets its metadata, a reload picks up paused, a link to another page keeps playing, and what a screen reader hears.
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

	test( 'a tap plays the track in the bar and the lock screen gets its metadata', { tag: '@smoke' }, async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'data-playing',
			'true'
		);
		// Its name says which track Pause is for, among rows that all play something.
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'aria-label',
			'Pause Underground'
		);
		const session = await page.evaluate( () => ( {
			title: navigator.mediaSession?.metadata?.title,
			state: navigator.mediaSession?.playbackState,
			artwork: navigator.mediaSession?.metadata?.artwork?.length,
		} ) );
		expect( session.title ).toBe( 'Underground' );
		expect( session.state ).toBe( 'playing' );
		expect( session.artwork ).toBeGreaterThan( 0 );
	} );

	test( 'a reload picks up paused where it left off', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 2 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 2 );
		await page.reload();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus'
		);
		const state = await audioState( page );
		expect( state.paused ).toBe( true );
		expect( state.time ).toBeGreaterThan( 1.5 );
	} );

	test( 'a link to another page keeps playing', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 2 );
		// Any same-site link will do; the home page has no tracks of its own.
		await page.evaluate( () => {
			const a = document.createElement( 'a' );
			a.href = '/';
			a.id = 'riff-e2e-link';
			a.textContent = 'Home';
			document.body.prepend( a );
		} );
		await page.locator( '#riff-e2e-link' ).click();
		await page.waitForURL( /\/$/ );
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		expect( ( await audioState( page ) ).time ).toBeGreaterThan( 1.5 );
	} );

	test( 'the first track pressed is announced, and the queue names what each row plays', async ( {
		page,
		isMobile,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		// Said where a track starts, so the first press is heard as Next and Previous are.
		await expect( page.locator( '#a11y-speak-polite' ) ).toContainText(
			/^Now playing Underground by Airmen of Note/
		);
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		if ( isMobile ) {
			await page.locator( '.riff-peek' ).click();
		}
		// Each row of Up next is named with its artist, as a post's rows are, rather than its title
		// and artist read run together; the playing one offers Pause.
		const rows = page.locator( '.riff-queue-list li > button:first-child' );
		await expect( rows.nth( 0 ) ).toHaveAttribute( 'aria-label', /^Play Intensities in Ten Cities by Airmen of Note/ );
		await expect( rows.nth( 1 ) ).toHaveAttribute( 'aria-label', /^Pause Underground by Airmen of Note/ );
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		await expect( rows.nth( 1 ) ).toHaveAttribute( 'aria-label', /^Play Underground by/ );
	} );
} );
