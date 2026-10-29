/**
 * The screen as a turntable: on a touch screen wider than it is tall and no taller than a phone,
 * as an unfolded iPhone Duo (890 by 626) and a phone on its side are, Now Playing is the deck
 * itself; folding back to a phone's shape puts the record back in its sleeve. Folded part way,
 * where the browser reports the fold, nothing lands in the crease: a book's two pages, or a tent's
 * two halves. The fold is emulated with Chromium's DevTools protocol, so this runs in desktop
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

async function nowPlaying( page ) {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
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
		// The deck on the left, the controls' strip on the right.
		const record = await page.locator( '.riff-record' ).boundingBox();
		const panel = await page.locator( '.riff-np-panel' ).boundingBox();
		expect( record.x + record.width ).toBeLessThan( panel.x );
		expect( record.height ).toBeGreaterThan( OPEN.height * 0.6 );
		await expect( page.locator( '.riff-np-panel [data-riff-action="toggle"]' ) ).toBeVisible();
		// Up next opens in the strip; the turntable stays as large as it was.
		await page.locator( '.riff-peek' ).click();
		await expect( page.locator( '.riff-queue-list' ) ).toBeVisible();
		expect( ( await page.locator( '.riff-record' ).boundingBox() ).height ).toBeCloseTo( record.height, 0 );
	} );

	test( 'opening brings the record out of its sleeve, and closing puts it back', async ( { page } ) => {
		await page.setViewportSize( FOLDED );
		await nowPlaying( page );
		const root = page.locator( '#riff' );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await page.setViewportSize( OPEN );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
		await page.setViewportSize( FOLDED );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-cover' ) ).toBeVisible();
	} );

	test( 'half open like a book, the deck keeps to the left page and the controls to the right', async ( { page } ) => {
		await nowPlaying( page );
		await fold( page, OPEN, 'vertical' );
		const half = OPEN.width / 2 - 8;
		await expect
			.poll( () => page.locator( '.riff-np-body' ).evaluate( ( el ) => getComputedStyle( el ).gridTemplateColumns ) )
			.toBe( `${ half }px ${ half }px` );
		const arm = await page.locator( '.riff-mount' ).boundingBox();
		const panel = await page.locator( '.riff-np-panel' ).boundingBox();
		expect( arm.x + arm.width ).toBeLessThanOrEqual( half );
		expect( panel.x ).toBeGreaterThanOrEqual( half + 16 );
	} );

	test( 'stood like a tent, the turntable is in the upper half and the controls in the lower', async ( { page } ) => {
		const upright = { width: OPEN.height, height: OPEN.width };
		await page.setViewportSize( upright );
		await nowPlaying( page );
		await fold( page, upright, 'horizontal' );
		const half = upright.height / 2 - 8;
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		const record = await page.locator( '.riff-record' ).boundingBox();
		const play = await page.locator( '.riff-np-panel [data-riff-action="toggle"]' ).boundingBox();
		expect( record.y + record.height ).toBeLessThanOrEqual( half );
		expect( play.y ).toBeGreaterThanOrEqual( half + 16 );
	} );
} );
