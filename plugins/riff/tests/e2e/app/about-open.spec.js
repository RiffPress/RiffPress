/**
 * About open by default in the Listen app (Riff\About::opens()): on a wide screen, a listener who
 * has never opened or closed a panel has About beside the page once there is a track, the room for
 * it kept from before the page is painted. A listener's own choice, closed or another panel, holds.
 * Runs in desktop Chromium; a phone's size has the panel over everything, so nothing opens there.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );

const made = own();
let appUrl;

test.beforeAll( async ( { requestUtils } ) => {
	const { pageUrl, postId } = await appSite( made, requestUtils );
	appUrl = pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }`;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

const about = ( page ) => page.locator( '.riff-side [data-riff-panel="about"]' );

// Played from the album, then paused, so a reload resumes it paused.
async function play( page ) {
	await page.goto( appUrl );
	await page.locator( '[data-riff-app-action="play"]' ).click();
	await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
}

// Every shift of the layout from the start of the next page, as CLS counts them.
async function watchShifts( page ) {
	await page.addInitScript( () => {
		window.riffShift = 0;
		new PerformanceObserver( ( list ) => {
			for ( const e of list.getEntries() ) {
				window.riffShift += e.hadRecentInput ? 0 : e.value;
			}
		} ).observe( { type: 'layout-shift', buffered: true } );
	} );
}

test.describe( 'About, open by default', () => {
	test.beforeEach( async ( { page, isMobile } ) => {
		test.skip( isMobile, 'A panel stands beside the page on a wide screen only.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
	} );

	test( 'opens beside the page once there is a track, without the focus, and stays unchosen', async ( { page } ) => {
		await page.goto( appUrl );
		// Nothing playing: nothing to say, so nothing opens.
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect( about( page ) ).toBeVisible();
		await expect( page.locator( '.riff-bar [data-riff-control="about"]' ) ).toHaveAttribute( 'aria-pressed', 'true' );
		expect( await page.evaluate( () => document.querySelector( '.riff-side' ).contains( document.activeElement ) ) ).toBe( false );
		expect( await page.evaluate( () => localStorage.getItem( 'riff:panel' ) ) ).toBeNull();
	} );

	test( 'is there from the first paint for a resumed track, with no shift of the page', async ( { page } ) => {
		await play( page );
		await watchShifts( page );
		await page.reload();
		await expect( about( page ) ).toBeVisible();
		await expect( page.locator( '.riff-about-title' ) ).not.toBeEmpty();
		// What the page is laid out in, from the start: the room beside it.
		const width = await page.evaluate( () => document.querySelector( '.riff-side' ).getBoundingClientRect().width );
		expect( width ).toBeGreaterThan( 300 );
		expect( await page.evaluate( () => window.riffShift ) ).toBe( 0 );
	} );

	test( 'closed, it stays closed on the next visit, and nothing is kept for it', async ( { page } ) => {
		await play( page );
		await expect( about( page ) ).toBeVisible();
		await page.locator( '.riff-side-close' ).click();
		await expect( about( page ) ).toBeHidden();
		await watchShifts( page );
		await page.reload();
		await expect( page.locator( '.riff-bar .riff-title' ) ).not.toBeEmpty();
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		expect( await page.evaluate( () => document.documentElement.classList.contains( 'riff-panel-open' ) ) ).toBe( false );
		expect( await page.evaluate( () => window.riffShift ) ).toBe( 0 );
	} );

	test( 'another panel left open is the one that opens again', async ( { page } ) => {
		await play( page );
		await openView( page, 'queue' );
		await page.reload();
		await expect( page.locator( '.riff-side [data-riff-panel="queue"]' ) ).toBeVisible();
		await expect( about( page ) ).toBeHidden();
	} );

	test( 'never covers the page: the window narrowed puts it away, and widened brings it back', async ( { page } ) => {
		await play( page );
		await expect( about( page ) ).toBeVisible();
		await page.setViewportSize( { width: 800, height: 900 } );
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		await expect( page.locator( '.riff-side' ) ).not.toHaveAttribute( 'aria-modal', 'true' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await expect( about( page ) ).toBeVisible();
		expect( await page.evaluate( () => localStorage.getItem( 'riff:panel' ) ) ).toBeNull();
	} );

	test( 'a narrow window opens nothing, and keeps no room', async ( { page } ) => {
		await page.setViewportSize( { width: 800, height: 900 } );
		await play( page );
		await page.reload();
		await expect( page.locator( '.riff-bar .riff-title' ) ).not.toBeEmpty();
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		expect( await page.evaluate( () => getComputedStyle( document.body ).marginRight ) ).toBe( '0px' );
	} );
} );
