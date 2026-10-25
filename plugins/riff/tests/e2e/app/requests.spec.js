/**
 * Requests that fail: a cover that cannot load, an answer arriving after the view changed, and Load more failing, each leaving the music and the focus where they were.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playing, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let postId;
let extraId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId, extraId } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'App requests', () => {
	// A post's own route, or the library's second page, whichever permalinks the site uses.
	const postRoute = ( id ) => ( url ) =>
		new RegExp( `riff/v1/library/${ id }(?:$|[?&/])` ).test(
			decodeURIComponent( url.toString() )
		);
	const secondPage = ( url ) => {
		const u = decodeURIComponent( url.toString() );
		return /riff\/v1\/library(?:$|[?&])/.test( u ) && /[?&]page=2/.test( u );
	};

	// Something playing, and the library drawn by the app, with Load more.
	test.beforeEach( async ( { page } ) => {
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		await page.locator( '.riff-app-tab', { hasText: 'Posts' } ).click();
		await expect( page.locator( '.riff-grid' ) ).toBeVisible();
	} );

	test( 'a cover that cannot load says so, keeps the music, and plays on a retry', async ( {
		page,
	} ) => {
		const play = page.locator(
			`.riff-card-play[data-riff-post="${ extraId }"]`
		);
		const title = page.locator( '.riff-bar .riff-title' );
		const extra = postRoute( extraId );
		await expect( title ).toHaveText( 'Trombone Detritus' );

		await page.route( extra, ( route ) => route.abort() );
		await play.click();
		await expect( page.locator( '.riff-app-status' ) ).toHaveText(
			/could not be loaded/
		);
		await expect( page.locator( '.riff-app-status' ) ).toHaveAttribute(
			'role',
			'status'
		);
		await expect( play ).not.toHaveAttribute( 'aria-busy', 'true' );
		await expect( title ).toHaveText( 'Trombone Detritus' );
		expect( ( await playing( page ) ).paused ).toBe( false );

		await page.unroute( extra );
		await play.click();
		await expect( title ).toHaveText( 'Underground' );
		await expect( page.locator( '.riff-app-status' ) ).toBeEmpty();
	} );

	test( 'a cover answered after the view changed does not replace the queue', async ( {
		page,
	} ) => {
		const extra = postRoute( extraId );
		let release;
		const held = new Promise( ( resolve ) => ( release = resolve ) );
		await page.route( extra, async ( route ) => {
			await held;
			await route.continue();
		} );
		await page
			.locator( `.riff-card-play[data-riff-post="${ extraId }"]` )
			.click();
		await page.locator( `.riff-card[data-riff-post="${ postId }"] a` ).click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();

		const answered = page.waitForResponse( ( r ) => extra( r.url() ) );
		release();
		await answered;
		await expect( page.locator( '.riff-album-title' ) ).toContainText(
			'Riff app e2e'
		);
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus'
		);
		await expect( page.locator( '.riff-app-status' ) ).toBeEmpty();
	} );

	test( 'Load more that fails keeps the cards and the focus, and a retry adds the page once', async ( {
		page,
	} ) => {
		const more = page.getByRole( 'link', { name: 'Load more' } );
		const cards = page.locator( '.riff-grid .riff-card' );
		await expect( cards ).toHaveCount( 24 );

		await page.route( secondPage, ( route ) =>
			route.fulfill( { status: 500, body: '{}' } )
		);
		await more.focus();
		await page.keyboard.press( 'Enter' );
		await expect( page.locator( '.riff-app-status' ) ).toHaveText(
			/could not be loaded/
		);
		await expect( cards ).toHaveCount( 24 );
		await expect( more ).toBeFocused();
		await expect( more ).not.toHaveAttribute( 'aria-disabled', 'true' );

		await page.unroute( secondPage );
		await page.keyboard.press( 'Enter' );
		await expect( cards ).toHaveCount( 25 );
		await expect( more ).toHaveCount( 0 );
		await expect( page.locator( '.riff-app-status' ) ).toBeEmpty();
		const ids = await cards.evaluateAll( ( els ) =>
			els.map( ( el ) => el.dataset.riffPost )
		);
		expect( new Set( ids ).size ).toBe( 25 );
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );
} );
