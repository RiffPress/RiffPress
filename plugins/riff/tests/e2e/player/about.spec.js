/**
 * The About panel (#715): beside the page on a wide screen and over everything on a phone, as Up
 * next is, it shows the track playing, its cover, title, artist and album, the last two linking to
 * their pages in the Listen app, and the credits its file's tags carry. A plugin's section, added
 * through riff_about_sections, is drawn hidden between Riff's own and filled on riff.view, as
 * Riff fills its own.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, playerSite } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
	// A Listen page, for an album's and an artist's pages to be in.
	await made.page( requestUtils, {
		title: 'About e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'About', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( postUrl );
	} );

	test( 'shows the track, links its artist and album, and lists what its tags say', async ( { page, isMobile } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		const panel = await openView( page, 'about' );
		await expect( page.locator( '.riff-side-title' ) ).toBeFocused();
		// A dialog over everything on a phone; beside the page, a landmark of its own.
		await expect( page.getByRole( isMobile ? 'dialog' : 'complementary', { name: 'About' } ) ).toBeVisible();

		await expect( panel.locator( '.riff-about-cover' ) ).toHaveAttribute( 'alt', '' );
		await expect( panel.getByRole( 'heading', { name: 'Underground', level: 3 } ) ).toBeVisible();
		const artist = panel.getByRole( 'link', { name: 'Airmen of Note, United States Air Force Band' } );
		const album = panel.getByRole( 'link', { name: 'Compositions' } );
		await expect( artist ).toHaveAttribute( 'href', /[?&]riff_artist=\d+/ );
		await expect( album ).toHaveAttribute( 'href', /[?&]riff_album=\d+/ );

		// Only what the file says, under the names the tags give, and nothing it doesn't.
		const credits = panel.locator( '[data-riff-about="credits"]' );
		await expect( credits ).toBeVisible();
		await expect( credits ).toMatchAriaSnapshot( `
			- heading "Credits" [level=3]
			- term: Composer
			- definition: Tyler Kuebler
			- term: Album artist
			- definition:
			  - link "The Airmen of Note"
			- term: Genre
			- definition: Jazz
			- term: Year
			- definition: "2012"
			- term: Track
			- definition: "2"
			- term: Copyright
			- definition: Public domain — U.S. Government work
		` );
		await expect( credits.getByText( 'Lyricist' ) ).toHaveCount( 0 );
		await expect( credits.getByText( 'Label' ) ).toHaveCount( 0 );

		const results = await new AxeBuilder( { page } ).include( '.riff-side' ).withTags( AXE_TAGS ).analyze();
		expect( results.violations ).toEqual( [] );
	} );

	test( 'follows the track as it changes while it is open', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		const panel = await openView( page, 'about' );
		await expect( panel.getByRole( 'heading', { name: 'Underground', level: 3 } ) ).toBeVisible();
		await page.evaluate( () => window.riff.next() );
		await expect( panel.getByRole( 'heading', { name: 'Trombone Detritus', level: 3 } ) ).toBeVisible();
		await expect( panel.getByRole( 'heading', { name: 'Underground', level: 3 } ) ).toHaveCount( 0 );
	} );

	test( 'closes on Escape, giving the focus back to what opened it', async ( { page, isMobile } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await openView( page, 'about' );
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		const opener = isMobile ? page.locator( '.riff-chips [data-riff-chip="about"]' ) : page.locator( '.riff-bar [data-riff-control="about"]' );
		await expect( opener ).toBeFocused();
		await expect( opener ).toHaveAttribute( 'aria-pressed', 'false' );
	} );

	test( 'a plugin\'s section is drawn in its place and filled as Riff fills its own', async ( {
		page,
		context,
		baseURL,
	} ) => {
		// What riff_about_sections does (tests/components).
		await context.addCookies( [ { name: 'riff_test_about_section', value: '1', url: baseURL } ] );
		const html = await ( await page.reload() ).text();
		expect( html ).toContain( '<div class="riff-about-part riff-about-e2e-about" data-riff-about="e2e-about" hidden><h3 class="riff-about-heading">From a plugin</h3><div class="riff-about-body"></div></div>' );
		await page.evaluate( () => {
			window.wp.hooks.addAction( 'riff.view', 'e2e', ( { id, open, view, track } ) => {
				const part = id === 'about' && open && view.querySelector( '[data-riff-about="e2e-about"]' );
				if ( part ) {
					part.querySelector( '.riff-about-body' ).textContent = `Hello, ${ track.title }`;
					part.hidden = false;
				}
			} );
		} );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		const panel = await openView( page, 'about' );
		const part = panel.locator( '[data-riff-about="e2e-about"]' );
		await expect( part ).toHaveText( /From a plugin\s*Hello, Underground/ );
		const order = await panel.locator( '[data-riff-about]' ).evaluateAll( ( els ) => els.map( ( el ) => el.dataset.riffAbout ) );
		expect( order ).toEqual( [ 'track', 'e2e-about', 'credits' ] );
	} );
} );
