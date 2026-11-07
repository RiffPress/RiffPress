/**
 * The frame, standalone mode where the window has room for the sidebar: the window does not stretch past its ends, and Now Playing is the art alone with Up next a panel beside it.
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
	test( 'in the frame the window does not stretch past its ends, and the view keeps its round corners', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The frame is for a wide window.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		// A trackpad's stretch past the top would slide the view in its frame and show a square edge.
		await expect( page.locator( 'html' ) ).toHaveCSS( 'overscroll-behavior-y', 'none' );
		await expect( page.locator( '.riff-app-view' ) ).toHaveCSS( 'border-top-left-radius', '8px' );
	} );

	test( 'a window with a mouse but no room for the sidebar, as a car\'s screen is, keeps the touch layout without the frame, and gains the frame once it widens', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'A mouse is a computer\'s.' );
		await page.setViewportSize( { width: 860, height: 500 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		const html = page.locator( 'html' );
		await expect( html ).not.toHaveAttribute( 'data-riff-frame', 'sidebar' );
		await expect( html ).not.toHaveClass( /\briff-frame\b/ );
		await expect( page.locator( '.riff-app-titlebar' ) ).toBeHidden();
		await page.setViewportSize( { width: 1180, height: 680 } );
		await expect( html ).toHaveAttribute( 'data-riff-frame', 'sidebar' );
		await expect( page.locator( '.riff-app-titlebar [data-riff-app-action="back"]' ) ).toBeVisible();
		await page.setViewportSize( { width: 860, height: 500 } );
		await expect( page.locator( '.riff-app-titlebar' ) ).toBeHidden();
	} );

	test( 'on a computer the strip has back and forward at its left end, Home and search in its middle and who is listening at its right, reached in that order', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The strip is a computer\'s.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		// A window with room for the sidebar is in the frame, whatever points at it.
		await expect( page.locator( 'html' ) ).toHaveAttribute( 'data-riff-frame', 'sidebar' );
		await expect( page.locator( 'html' ) ).toHaveClass( /\briff-frame\b/ );
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

	test( 'in the frame, Now Playing is the art alone, and Up next opens beside it', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The frame is for a wide window.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }` );
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await page.locator( '.riff-bar-info' ).click();
		const np = page.locator( '.riff-np' );
		await expect( np ).toBeVisible();

		// The art on its own, square and in the middle, and no panel until one is opened: its own
		// box, before the record moves it aside while the track plays.
		const cover = await page.locator( '.riff-cover' ).evaluate( ( el ) => {
			const at = el.offsetParent.getBoundingClientRect();
			return { x: at.left + el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
		} );
		expect( Math.round( cover.width ) ).toBe( Math.round( cover.height ) );
		expect( Math.abs( cover.x + ( cover.width / 2 ) - 720 ) ).toBeLessThanOrEqual( 2 );
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeHidden();

		// Up next is a panel of its own, from its button in the bar: beside Now Playing, from the top,
		// and the art stays in the middle of what is left.
		const upNext = page.locator( '[data-riff-control="queue"]' );
		await upNext.click();
		await expect( upNext ).toHaveAttribute( 'aria-pressed', 'true' );
		const side = page.locator( '.riff-side' );
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeVisible();
		const panel = await side.boundingBox();
		expect( panel.x + panel.width ).toBeGreaterThan( 1400 );
		const room = await np.boundingBox();
		expect( room.x + room.width ).toBeLessThanOrEqual( panel.x + 1 );
		const middle = await page.locator( '.riff-cover' ).evaluate( ( el ) => {
			const at = el.offsetParent.getBoundingClientRect();
			return at.left + el.offsetLeft + ( el.offsetWidth / 2 );
		} );
		expect( Math.abs( middle - ( room.x + ( room.width / 2 ) ) ) ).toBeLessThanOrEqual( 2 );
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-side' ).analyze() ).violations ).toEqual( [] );
		// The panel stands on Now Playing's wash from the window's top, as Now Playing does, with none
		// of the strip's black above it.
		await expect( side ).toHaveCSS( 'background-image', /gradient/ );
		await expect( side ).toHaveCSS( 'top', '0px' );

		// Pressed again, it closes; Escape still closes Now Playing.
		await upNext.click();
		await expect( side ).toBeHidden();
		await page.keyboard.press( 'Escape' );
		await expect( np ).toBeHidden();

		// Beside the page, with no wash to carry on, the panel is the frame's black.
		await upNext.click();
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeVisible();
		await expect( side ).toHaveCSS( 'background-image', 'none' );
	} );
} );
