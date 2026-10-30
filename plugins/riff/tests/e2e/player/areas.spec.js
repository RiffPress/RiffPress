/**
 * The player's areas: the quality pill in the bar and Now Playing (small print between the times on a phone), lossless shown as bit depth and rate, and Riff's own features adding badges and controls and hearing the meter.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES, playerSite } = require( '../helpers/site' );

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

	test( 'the playing track shows its format and bit rate in the bar and Now Playing', async ( {
		page,
	} ) => {
		// In the bar and Now Playing only: in a list it is noise.
		const row = page.locator( '.riff-row' ).nth( 1 );
		await expect( row.locator( '.riff-quality' ) ).toHaveCount( 0 );
		await row.click();
		await expect(
			page.locator( '.riff-bar-end .riff-quality' )
		).toHaveText( /^MP3 · \d+ kbps$/ );
		await page.locator( '.riff-bar-info' ).click();
		await expect(
			page.locator( '.riff-np-quality .riff-quality' )
		).toHaveText( /^MP3 · \d+ kbps$/ );
	} );

	test( 'on a phone the quality is small print between the seek line\'s times, not a capsule under the title', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( ! isMobile, 'a wide screen shows the capsule in the bar alone' );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np-tier .riff-quality' ) ).toBeVisible();
		await expect( page.locator( '.riff-np-tier .riff-quality' ) ).toHaveText( /^MP3 · \d+ kbps$/ );
		await expect( page.locator( '.riff-np-quality' ) ).toBeHidden();
	} );

	test( 'Riff\'s own features add badges and controls to the player\'s areas, and hear the meter', async ( {
		page,
	} ) => {
		await page.evaluate( () => {
			window.riffHeard = 0;
			window.riffInternal.listen( 'badges', ( list, t ) => [ ...list, { id: 'e2e', text: t ? 'Live' : '', label: 'Recorded live' } ] );
			window.riffInternal.listen( 'controls', ( list, t ) => t ? [
				...list,
				{
					id: 'e2e',
					label: 'Pin',
					pressed: !! window.riffPinned,
					run: ( track ) => ( window.riffPinned = track.title ),
				},
			] : list );
			window.riffInternal.listen( 'meter', ( { heat } ) => heat > 0 && window.riffHeard++ );
		} );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect.poll( () => page.evaluate( () => window.riffHeard ) ).toBeGreaterThan( 0 );
		// Paused, so the short track can't end and empty the queue under the test.
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		const end = page.locator( '.riff-bar-end' );
		// After Riff's own quality pill, in the order the listeners were added.
		await expect( end.locator( '[data-riff-area="badges"] > *' ) ).toHaveText( [ /^MP3 · /, /^Live/ ] );
		// A badge's label is read in place of its short text, not only shown to a pointer.
		await expect( end.locator( '.riff-badge-e2e [aria-hidden="true"]' ) ).toHaveText( 'Live' );
		await expect( end.locator( '.riff-badge-e2e .riff-app-sr' ) ).toHaveText( 'Recorded live' );
		// The bar's copy is for a wide screen, Now Playing's for a phone, and every copy follows a press.
		const copies = page.locator( '[data-riff-control="e2e"]' );
		await expect( copies ).toHaveCount( 2 );
		await page.locator( '.riff-bar-info' ).click();
		const pin = page.getByRole( 'button', { name: 'Pin' } ).locator( 'visible=true' ).first();
		await expect( pin ).toHaveAttribute( 'aria-pressed', 'false' );
		await pin.click();
		await expect( copies.nth( 0 ) ).toHaveAttribute( 'aria-pressed', 'true' );
		await expect( copies.nth( 1 ) ).toHaveAttribute( 'aria-pressed', 'true' );
		expect( await page.evaluate( () => window.riffPinned === window.riff.current().title ) ).toBe( true );
	} );

	test( 'a lossless track shows its bit depth and sample rate instead of a bit rate', async ( {
		page,
		requestUtils,
	} ) => {
		const flac = await made.media( requestUtils,
			path.join( FIXTURES, '..', 'test', 'tone-24-96.flac' )
		);
		const post = await made.post( requestUtils, {
			title: `Riff e2e lossless ${ Date.now() }`,
			status: 'publish',
			content: `<!-- wp:audio {"id":${ flac.id }} --><figure class="wp-block-audio"><audio controls src="${ flac.source_url }"></audio></figure><!-- /wp:audio -->`,
		} );
		await page.goto( post.link );
		await page.locator( '.riff-row' ).first().click();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect(
			page.locator( '.riff-np-quality .riff-quality' )
		).toHaveText( 'FLAC · 24-bit 96 kHz' );
	} );
} );
