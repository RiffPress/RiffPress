/**
 * The desktop app's layout, marked on the document with ?riff_desktop=1: the window does not stretch past its ends, and Now Playing is the art alone with Up next beside it.
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

	test( 'on a computer the strip has back and forward at its left end, Home and search in its middle and who is listening at its right, reached in that order', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The strip is a computer\'s.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		// A mouse marks the document before the app starts, as standalone.php does.
		await expect( page.locator( 'html' ) ).toHaveClass( /\briff-desktop\b/ );
		const back = page.locator( '.riff-app-titlebar [data-riff-app-action="back"]' );
		const forward = page.locator( '.riff-app-titlebar [data-riff-app-action="forward"]' );
		const home = page.locator( '.riff-app-bar .riff-app-home' );
		const search = page.locator( '.riff-app-bar .riff-app-search input' );
		const who = page.locator( '.riff-app-bar :is(.riff-app-account, .riff-app-signin)' );

		const at = async ( el ) => el.boundingBox();
		const [ b, f, h, s, w ] = await Promise.all( [ back, forward, home, search, who ].map( at ) );
		expect( b.x ).toBeLessThanOrEqual( 24 );
		expect( f.x ).toBeGreaterThan( b.x );
		// Home and the pill, one group in the middle of the window.
		expect( Math.abs( ( ( h.x + s.x + s.width ) / 2 ) - 720 ) ).toBeLessThanOrEqual( 2 );
		expect( h.x ).toBeGreaterThan( f.x + f.width );
		expect( w.x ).toBeGreaterThan( s.x + s.width );
		await expect( search ).toHaveAttribute( 'placeholder', 'Find an album, an artist or a track' );
		// The keyboard reaches them as they are seen: Home, search and who is listening come before
		// the library in the sidebar.
		const order = await page.locator( '.riff-app-bar > *' ).evaluateAll( ( els ) => els.slice( 0, 3 ).map( ( el ) => el.className ) );
		expect( order[ 0 ] ).toContain( 'riff-app-home' );
		expect( order[ 1 ] ).toContain( 'riff-app-search' );
		expect( order[ 2 ] ).toMatch( /riff-app-(account|signin)/ );

		// Nowhere to go yet; a view, then back and forward through the app's own history.
		await expect( back ).toBeDisabled();
		await page.locator( '.riff-app-bar .riff-app-tab', { hasText: 'Albums' } ).click();
		await expect( page ).toHaveURL( /riff_view=albums|\/albums\/?/ );
		await expect( back ).toBeEnabled();
		await back.click();
		await expect( page ).not.toHaveURL( /riff_view=albums|\/albums\/?/ );
		await expect( forward ).toBeEnabled();
		await forward.click();
		await expect( page ).toHaveURL( /riff_view=albums|\/albums\/?/ );
		// The sidebar is drawn again with each view: the strip keeps its order and its question.
		await expect( page.locator( '.riff-app-bar > *' ).first() ).toHaveClass( /riff-app-home/ );
		await expect( search ).toHaveAttribute( 'placeholder', 'Find an album, an artist or a track' );

		// The pill searches.
		await search.fill( 'Underground' );
		await search.press( 'Enter' );
		await expect( page ).toHaveURL( /riff_search=Underground/ );
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app-titlebar' ).include( '.riff-app-bar' ).analyze() ).violations ).toEqual( [] );
	} );

	test( 'in the desktop app, Now Playing is the art alone, and Up next opens beside it', async ( {
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

		// The art on its own, square and in the middle, and no panel until a tab is pressed: its own
		// box, before the record moves it aside while the track plays.
		const cover = await page.locator( '.riff-cover' ).evaluate( ( el ) => {
			const at = el.offsetParent.getBoundingClientRect();
			return { x: at.left + el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
		} );
		expect( Math.round( cover.width ) ).toBe( Math.round( cover.height ) );
		expect( Math.abs( cover.x + ( cover.width / 2 ) - 720 ) ).toBeLessThanOrEqual( 2 );
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeHidden();

		const upNext = page.locator( '.riff-tab[data-riff-tab="queue"]' );
		const tab = await upNext.boundingBox();
		expect( tab.y ).toBeLessThan( 64 );
		// In the head, the tabs stop short of its own buttons, however many show.
		const tabs = await page.locator( '.riff-np .riff-tabs' ).boundingBox();
		for ( const button of await page.locator( '.riff-np-end > .riff-btn:visible' ).all() ) {
			expect( tabs.x + tabs.width ).toBeLessThanOrEqual( ( await button.boundingBox() ).x - 8 );
		}
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
