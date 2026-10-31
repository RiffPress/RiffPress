/**
 * Pages of the library: Load more adds the next page in place and keeps the music, and without the script it is a link through the next page.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playing, listen, said, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let postId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

const postsUrl = () => {
	const u = new URL( pageUrl );
	u.searchParams.set( 'riff_view', 'posts' );
	return u.toString();
};

test.describe( 'App pages', () => {
	test( 'the first visit offers Load more, which adds the page in place and keeps the music', async ( {
		page,
	} ) => {
		await page.goto( postsUrl() );
		// Each view has its own title, rendered and swapped in alike, which a screen reader says.
		await expect( page ).toHaveTitle( /^Posts – Listen e2e – / );
		const cards = page.locator( '.riff-grid .riff-card' );
		await expect( cards ).toHaveCount( 24 );
		await page
			.locator( `.riff-card[data-riff-post="${ postId }"] .riff-card-play` )
			.click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );

		// The music says what plays, too, in the same region; what matters is that the new page was
		// said, not that it is still there when the test looks.
		await listen( page );
		await page.getByRole( 'link', { name: 'Load more' } ).click();
		await expect( cards ).toHaveCount( 25 );
		await expect( page ).toHaveURL( /[?&]riff_page=2$/ );
		await expect( page.locator( '#riff-page-2 a' ) ).toBeFocused();
		await expect.poll( () => said( page ) ).toContain( '1 more post' );
		expect( ( await playing( page ) ).paused ).toBe( false );

		// Out to a post and back: the address still asks for both pages.
		await page.locator( `.riff-card[data-riff-post="${ postId }"] a` ).click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();
		await expect( page ).toHaveTitle( /^Riff app e2e \d+ – Listen e2e – / );
		await page.goBack();
		await expect( cards ).toHaveCount( 25 );
		await expect( page ).toHaveTitle( /^Posts – Listen e2e – / );
		await expect(
			page.getByRole( 'link', { name: 'Load more' } )
		).toHaveCount( 0 );
		expect( ( await playing( page ) ).paused ).toBe( false );

		await page.reload();
		await expect( cards ).toHaveCount( 25 );
	} );

	test( 'without the script, Load more is a link to everything through the next page', async ( {
		browser,
	} ) => {
		const context = await browser.newContext( { javaScriptEnabled: false } );
		const page = await context.newPage();
		await page.goto( postsUrl() );
		await expect( page.locator( '.riff-grid .riff-card' ) ).toHaveCount( 24 );
		await page.getByRole( 'link', { name: 'Load more' } ).click();
		await expect( page ).toHaveURL( /[?&]riff_page=2#riff-page-2$/ );
		await expect( page.locator( '.riff-grid .riff-card' ) ).toHaveCount( 25 );
		await expect( page.locator( '#riff-page-2' ) ).toBeInViewport();
		await context.close();
	} );
} );
