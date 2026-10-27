/**
 * Now Playing: opened from the bar and closed with Escape, the art square and the bar held to its measurements on a wide screen, the art as wide as a phone allows, the Song and Video switch, a contrast theme, and axe.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, systemColours, audioState, playerSite } = require( '../helpers/site' );

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

	test( 'the bar opens Now Playing, which closes with Escape and returns focus', { tag: '@smoke' }, async ( {
		page,
		isMobile,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		const np = page.locator( '.riff-np' );
		await expect( np ).toBeVisible();
		// Modal on a phone, where it covers the bar; beside the bar on a wide screen, where the bar
		// is still how the music is controlled.
		await expect( np ).toHaveAttribute( 'aria-modal', isMobile ? 'true' : 'false' );
		await expect(
			np.locator( '.riff-np-title, .riff-bar-text .riff-title' ).first()
		).toContainText( 'Intensities in Ten Cities' );
		await expect(
			page.locator( 'body > :not(#riff):not(script)' ).first()
		).toHaveAttribute( 'inert', '' );
		// The page under it stays still: no scrolling behind it, no second scrollbar beside Up next.
		const scrolls = () => page.evaluate( () => getComputedStyle( document.documentElement ).overflowY );
		expect( await scrolls() ).toBe( 'hidden' );
		await page.keyboard.press( 'Escape' );
		await expect( np ).toBeHidden();
		await expect( page.locator( '.riff-bar-info' ) ).toBeFocused();
		expect( await scrolls(), 'and scrolls again once it closes' ).not.toBe( 'hidden' );
	} );

	test( 'on a wide screen the art stays square and the bar keeps its measurements', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the wide layout only' );
		// Tall enough that the stage could hold more than 640px of art. Beside Up next the stage is
		// wider than tall, so the sleeve is sized for the sleeve and the turntable side by side, the
		// record's size, and never past the cap.
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-chevron' ).click();
		// The cover's own box, before the record moves it aside while the track plays.
		const size = ( selector ) =>
			page.locator( selector ).evaluate( ( el ) => ( { width: el.offsetWidth, height: el.offsetHeight } ) );
		const cover = await size( '.riff-cover' );
		expect( cover.width ).toBe( cover.height );
		expect( cover ).toEqual( await size( '.riff-record' ) );
		expect( cover.width ).toBeLessThanOrEqual( 640 );
		// Playing, the record is out of its sleeve, to the cover's right.
		await expect
			.poll( async () => {
				const art = await page.locator( '.riff-cover' ).boundingBox();
				const record = await page.locator( '.riff-record' ).boundingBox();
				return record.x + record.width > art.x + art.width;
			} )
			.toBe( true );
		const tabs = await page.locator( '.riff-tabs' ).boundingBox();
		const tab = await page.locator( '.riff-tab' ).first().boundingBox();
		expect( tab.x ).toBe( tabs.x );
		const colors = await page.evaluate( () => ( {
			repeat: getComputedStyle(
				document.querySelector(
					'.riff-bar [data-riff-action="repeat"]'
				)
			).color,
			chevron: getComputedStyle(
				document.querySelector( '.riff-chevron' )
			).color,
		} ) );
		expect( colors.repeat ).toBe( 'rgb(144, 144, 144)' );
		expect( colors.chevron ).toBe( 'rgb(255, 255, 255)' );
		const seek = await page.locator( '.riff-bar-seek' ).boundingBox();
		await page.mouse.move( seek.x + 300, seek.y + seek.height / 2 );
		// The knob is a rail as wide as the line, slid by transform, with a 14px dot at its end.
		const knob = await page.locator( '.riff-knob' ).boundingBox();
		const dot = await page.locator( '.riff-knob' ).evaluate( ( el ) => {
			const after = getComputedStyle( el, '::after' );
			return { width: after.width, height: after.height };
		} );
		expect( dot ).toEqual( { width: '14px', height: '14px' } );
		await expect( page.locator( '.riff-knob' ) ).toHaveCSS( 'opacity', '1' );
		// The seek line sits under the transport, inside the bar, with a time at each end.
		const bar = await page.locator( '.riff-bar' ).boundingBox();
		const play = await page.locator( '.riff-bar .riff-play' ).boundingBox();
		expect( seek.y ).toBeGreaterThanOrEqual( play.y + play.height );
		expect( knob.y ).toBeGreaterThanOrEqual( bar.y );
		expect( seek.y + seek.height ).toBeLessThanOrEqual( bar.y + bar.height );
		const times = page.locator( '.riff-bar .riff-time' );
		expect( ( await times.nth( 0 ).boundingBox() ).x ).toBeLessThan( seek.x );
		expect( ( await times.nth( 1 ).boundingBox() ).x ).toBeGreaterThan( seek.x + seek.width - 1 );
	} );

	test( 'on a phone the art is as wide as the screen allows, and closed, Up next is only its handle', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( ! isMobile, 'the phone layout only' );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		const cover = page.locator( '.riff-np .riff-cover' );
		await expect( cover ).toBeVisible();
		// The queue's head belongs to the open sheet, not under the closed one's handle.
		await expect( page.locator( '.riff-queue-head' ) ).toBeHidden();
		// A short phone keeps most of its width for the art, and everything still fits on the
		// screen once Now Playing has slid up.
		const short = page.viewportSize();
		expect( await cover.evaluate( ( el ) => el.offsetWidth ) ).toBeGreaterThanOrEqual( short.width * 0.6 );
		await expect
			.poll( async () => {
				const peek = await page.locator( '.riff-peek' ).boundingBox();
				return peek.y + peek.height;
			} )
			.toBeLessThanOrEqual( short.height + 1 );
		// A tall one, as YouTube Music draws it: the art 24px from either edge, the title under its edge.
		await page.setViewportSize( { width: 390, height: 844 } );
		await expect.poll( () => cover.evaluate( ( el ) => el.offsetWidth ) ).toBe( 390 - 48 );
		const art = await cover.boundingBox();
		const title = await page.locator( '.riff-np-title' ).boundingBox();
		expect( Math.abs( title.x - art.x ) ).toBeLessThanOrEqual( 1 );
		await page.locator( '.riff-peek' ).click();
		await expect( page.locator( '.riff-queue-head' ) ).toBeVisible();
	} );

	test( 'a track with a video switches to it without losing its place', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		const modes = page.locator( '.riff-modes' );
		await expect( modes ).toBeVisible();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 1 );
		const before = await audioState( page );
		await page.locator( '[data-riff-mode="video"]' ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute(
			'data-mode',
			'video'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).videoPaused )
			.toBe( false );
		const after = await audioState( page );
		expect( after.paused ).toBe( true );
		expect( after.videoTime ).toBeGreaterThanOrEqual( before.time - 0.5 );
		await page.locator( '[data-riff-mode="song"]' ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		expect( ( await audioState( page ) ).videoPaused ).toBe( true );
	} );

	test( 'a track without a video has no switch', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 2 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-modes' ) ).toBeHidden();
	} );

	test( 'in a contrast theme the seek line, the current track and the open tab still show', async ( { page } ) => {
		await page.emulateMedia( { forcedColors: 'active' } );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute( 'data-current', '' );
		// The line is a background, which a contrast theme would otherwise paint over.
		const line = page.locator( '.riff-bar .riff-line' );
		const player = await systemColours( page.locator( '.riff-bar' ) );
		await expect( line ).toHaveCSS( 'background-color', player.gray );
		await expect( line.locator( '> i:first-child' ) ).toHaveCSS( 'background-color', player.highlight );
		await expect( line.locator( '.riff-hot' ) ).toBeHidden();
		// What plays is marked as the system marks a selection, not by a shade it would drop.
		const row = page.locator( '.riff-row' ).nth( 1 );
		const post = await systemColours( row.locator( '..' ) );
		await expect( row ).toHaveCSS( 'background-color', post.highlight );
		await page.evaluate( () => window.riff.open() );
		// On a phone, the tabs are on the Up next sheet, pulled up from its handle.
		if ( await page.locator( '.riff-peek' ).isVisible() ) {
			await page.locator( '.riff-peek' ).click();
		}
		const tab = page.locator( '#riff .riff-tab[aria-selected="true"]' ).locator( 'visible=true' ).first();
		await expect( tab ).toHaveCSS( 'border-bottom-style', 'solid' );
		await expect( tab ).toHaveCSS( 'border-bottom-width', '2px' );
	} );

	test( 'Now Playing has no accessibility violations', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		const results = await new AxeBuilder( { page } ).withTags( AXE_TAGS )
			.include( '#riff' )
			.analyze();
		expect( results.violations ).toEqual( [] );
	} );
} );
