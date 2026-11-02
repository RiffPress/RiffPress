/**
 * About on a Listen page (#715): the album and the artist link to their pages in this app, which
 * opens them in place as it opens its own links, with the music carrying on.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playing, appSite } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );

const made = own();
let pageUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test( 'the album in About opens its page in the app, in place, with the music carrying on', async ( {
	page,
} ) => {
	await page.goto( pageUrl );
	await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
	await page
		.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } )
		.first()
		.locator( '.riff-card-link' )
		.click();
	await page.locator( '[data-riff-app-action="play"]' ).click();
	await expect.poll( async () => ( await playing( page ) ).paused ).toBe( false );
	// Away from the album, in the app, so the link has somewhere to take the listener.
	await page.locator( '.riff-app-tab', { hasText: 'Home' } ).click();
	await expect( page ).not.toHaveURL( /riff_album=/ );

	// Marked, so a page loaded afresh would show.
	await page.evaluate( () => ( window.riffStayed = true ) );
	const panel = await openView( page, 'about' );
	const album = panel.getByRole( 'link', { name: 'Compositions' } );
	await expect( album ).toHaveAttribute( 'href', /riff_album=\d+/ );
	await album.click();

	await expect( page ).toHaveURL( /riff_album=\d+/ );
	await expect( page.locator( '.riff-album-title' ) ).toHaveText( 'Compositions' );
	expect( await page.evaluate( () => window.riffStayed ) ).toBe( true );
	expect( ( await playing( page ) ).paused ).toBe( false );
	// Now Playing is out of the way of the page it opened.
	await expect( page.locator( '.riff-np' ) ).toBeHidden();
} );
