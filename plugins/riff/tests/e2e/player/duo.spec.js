/**
 * The screen as a turntable: on a touch screen wider than it is tall and no taller than a phone,
 * as an unfolded iPhone Duo (890 by 626) and a phone on its side are, Now Playing is the deck
 * itself, with nothing else on the screen; folding back to a phone's shape puts the record back in
 * its sleeve. Folded part way, where the browser reports the fold, nothing lands in the crease: a
 * book's two pages, too narrow for the deck, the cover on the left and the controls on the right,
 * or a tent's two halves, upright, so the cover above. The fold is emulated with Chromium's DevTools protocol, so this runs in desktop
 * Chromium only, as a touch screen.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );

const made = own();
let postUrl;

const OPEN = { width: 890, height: 626 };
const FOLDED = { width: 466, height: 678 };

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// The hinge, as Chromium's DevTools emulate it: a vertical fold makes two pages side by side, a
// horizontal one two halves one above the other. Playwright's own screenshots reset this override,
// so these tests take none.
async function fold( page, size, orientation ) {
	const cdp = await page.context().newCDPSession( page );
	await cdp.send( 'Emulation.setDevicePostureOverride', { posture: { type: 'folded' } } );
	await cdp.send( 'Emulation.setDeviceMetricsOverride', {
		...size,
		deviceScaleFactor: 2,
		mobile: true,
		displayFeature: {
			orientation,
			offset: ( orientation === 'vertical' ? size.width : size.height ) / 2 - 8,
			maskLength: 16,
		},
	} );
}

// Now Playing opened from the bar, as a listener opens it, with motion: the album,
// which is the turntable where Now Playing is wider than tall and the cover where it is upright.
async function nowPlaying( page ) {
	await page.emulateMedia( { reducedMotion: 'no-preference' } );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-showing', 'album' );
}

test.describe( 'iPhone Duo', () => {
	test.use( { viewport: OPEN, isMobile: true, hasTouch: true } );

	test.beforeEach( async ( {}, info ) => {
		test.skip( info.project.name !== 'chromium', 'The fold is emulated through Chromium.' );
	} );

	test( 'unfolded, the whole screen is the turntable, covering the bar', async ( { page } ) => {
		await nowPlaying( page );
		const root = page.locator( '#riff' );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-np' ) ).toHaveAttribute( 'aria-modal', 'true' );
		// The deck on its own, its controls in a panel on its plinth beside the arm: no strip of
		// controls beside it, and no panel.
		await expect( page.locator( '.riff-np-panel' ) ).toBeHidden();
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		const record = await page.locator( '.riff-record' ).boundingBox();
		expect( record.height ).toBeGreaterThan( OPEN.height * 0.6 );
		const start = await page.locator( '.riff-keys .riff-key-start' ).boundingBox();
		expect( start.x ).toBeGreaterThan( record.x + record.width );
		expect( start.x + start.width ).toBeLessThan( OPEN.width );
		// The way out is there as the deck arrives, and gone once the listener is still; a touch
		// brings it back, and it closes Now Playing.
		const out = page.getByRole( 'button', { name: 'Close Now Playing' } );
		await expect( out ).toBeFocused();
		await expect( root ).toHaveAttribute( 'data-riff-idle', '', { timeout: 6000 } );
		await expect( page.locator( '.riff-np-head' ) ).toHaveCSS( 'opacity', '0' );
		await page.touchscreen.tap( 40, OPEN.height / 2 );
		await expect( root ).not.toHaveAttribute( 'data-riff-idle', '' );
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		await out.tap();
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
	} );

	test( 'the deck has its own controls: start and stop, the two speeds, and the pitch', async ( { page } ) => {
		await nowPlaying( page );
		const rate = () => page.evaluate( () => document.querySelector( '.riff-audio' ).playbackRate );
		const board = page.getByRole( 'group', { name: 'Turntable' } );
		await expect( board ).toBeVisible();
		// The strip's own play button gives way to the deck's.
		await expect( page.locator( '.riff-np-panel [data-riff-action="toggle"]' ) ).toBeHidden();
		const lp = board.getByRole( 'radio', { name: '33⅓ revolutions per minute' } );
		const single = board.getByRole( 'radio', { name: '45 revolutions per minute' } );
		await expect( lp ).toHaveAttribute( 'aria-checked', 'true' );
		// An LP at 45 runs fast, as on a deck; the arrows move between the speeds.
		await single.click();
		await expect( single ).toHaveAttribute( 'aria-checked', 'true' );
		await expect.poll( rate ).toBeCloseTo( 45 / ( 100 / 3 ), 2 );
		await page.keyboard.press( 'ArrowLeft' );
		await expect( lp ).toHaveAttribute( 'aria-checked', 'true' );
		await expect.poll( rate ).toBeCloseTo( 1, 2 );
		// The pitch adds its percentage, says it, and clicks into the middle.
		const pitch = board.getByRole( 'slider', { name: 'Pitch' } );
		await pitch.fill( '4' );
		await expect( pitch ).toHaveAttribute( 'aria-valuetext', '+4.0%' );
		await expect.poll( rate ).toBeCloseTo( 1.04, 2 );
		await pitch.fill( '0.2' );
		await expect( pitch ).toHaveAttribute( 'aria-valuetext', '0.0%' );
		await expect.poll( rate ).toBeCloseTo( 1, 2 );
		// Off the deck the music is at its own speed; back on it, the deck's again.
		await pitch.fill( '-6' );
		await expect.poll( rate ).toBeCloseTo( 0.94, 2 );
		await page.setViewportSize( FOLDED );
		await expect.poll( rate ).toBeCloseTo( 1, 2 );
		await page.setViewportSize( OPEN );
		await expect.poll( rate ).toBeCloseTo( 0.94, 2 );
		// Start and stop is the transport's play and pause.
		const start = board.locator( '.riff-key-start' );
		await expect( start ).toHaveAttribute( 'aria-label', 'Pause' );
		await start.click();
		await expect( start ).toHaveAttribute( 'aria-label', 'Play' );
	} );

	test( 'opening brings the record out of its sleeve, and closing puts it back', async ( { page } ) => {
		await page.setViewportSize( FOLDED );
		await nowPlaying( page );
		const root = page.locator( '#riff' );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( root ).toHaveAttribute( 'data-riff-turntable', 'off' );
		// Unfolded, the album is the turntable; folded again, the cover.
		await page.setViewportSize( OPEN );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
		await page.setViewportSize( FOLDED );
		await expect( root ).toHaveAttribute( 'data-riff-showing', 'album' );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( root ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( page.locator( '.riff-cover' ) ).toBeVisible();
	} );

	test( 'half open like a book, the cover keeps to the left page and the controls to the right', async ( { page } ) => {
		await nowPlaying( page );
		await fold( page, OPEN, 'vertical' );
		const half = OPEN.width / 2 - 8;
		await expect
			.poll( () => page.locator( '.riff-np-body' ).evaluate( ( el ) => getComputedStyle( el ).gridTemplateColumns ) )
			.toBe( `${ half }px ${ half }px` );
		// A page is too narrow for the deck with its controls (riff.css), so the album is the cover.
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-turntable', 'off' );
		const cover = await page.locator( '.riff-cover' ).boundingBox();
		expect( cover.x + cover.width ).toBeLessThanOrEqual( half );
		const play = await page.locator( '.riff-np-panel [data-riff-action="toggle"]' ).boundingBox();
		expect( play.x ).toBeGreaterThanOrEqual( half + 16 );
	} );

	test( 'stood like a tent, upright, the cover is in the upper half and the controls in the lower', async ( { page } ) => {
		const upright = { width: OPEN.height, height: OPEN.width };
		await page.setViewportSize( upright );
		await nowPlaying( page );
		await fold( page, upright, 'horizontal' );
		const half = upright.height / 2 - 8;
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect.poll( async () => {
			const cover = await page.locator( '.riff-cover' ).boundingBox();
			return cover.y + cover.height;
		} ).toBeLessThanOrEqual( half );
		const play = await page.locator( '.riff-np-panel [data-riff-action="toggle"]' ).boundingBox();
		expect( play.y ).toBeGreaterThanOrEqual( half + 16 );
	} );
} );
