/**
 * The desktop app's layout, marked on the document with ?riff_desktop=1: the window does not stretch past its ends, and Now Playing is Tidal's with Up next beside the art.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let postId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Standalone', () => {
	test( 'in the desktop app the window does not stretch past its ends, and the view keeps its round corners', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The desktop app\'s layout is for a wide window.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		// What the app's preload marks the document with.
		await page.evaluate( () => document.documentElement.classList.add( 'riff-desktop' ) );
		// A trackpad's stretch past the top would slide the view in its frame and show a square edge.
		await expect( page.locator( 'html' ) ).toHaveCSS( 'overscroll-behavior-y', 'none' );
		await expect( page.locator( '.riff-app-view' ) ).toHaveCSS( 'border-top-left-radius', '8px' );
	} );

	test( 'in the desktop app, Now Playing is Tidal\'s: the art alone, and Up next opens beside it', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The desktop app\'s layout is for a wide window.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }` );
		// What the app's preload marks the document with.
		await page.evaluate( () => document.documentElement.classList.add( 'riff-desktop', 'riff-desktop-inset' ) );
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await page.locator( '.riff-bar .riff-chevron' ).click();
		const np = page.locator( '.riff-np' );
		await expect( np ).toBeVisible();

		// The art on its own, square and in the middle, and no panel until a tab is pressed.
		const cover = await page.locator( '.riff-cover' ).boundingBox();
		expect( Math.round( cover.width ) ).toBe( Math.round( cover.height ) );
		expect( Math.abs( cover.x + ( cover.width / 2 ) - 720 ) ).toBeLessThanOrEqual( 2 );
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeHidden();

		const upNext = page.locator( '.riff-tab[data-riff-tab="queue"]' );
		const tab = await upNext.boundingBox();
		expect( tab.y ).toBeLessThan( 64 );
		await upNext.click();
		await expect( np ).toHaveAttribute( 'data-riff-drawer', 'open' );
		await expect( upNext ).toHaveAttribute( 'aria-expanded', 'true' );
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeVisible();
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-np' ).analyze() ).violations ).toEqual( [] );

		// Pressed again, it closes; Escape still closes Now Playing.
		await upNext.click();
		await expect( np ).not.toHaveAttribute( 'data-riff-drawer', 'open' );
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeHidden();
		await page.keyboard.press( 'Escape' );
		await expect( np ).toBeHidden();
	} );
} );
