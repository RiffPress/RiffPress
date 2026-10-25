/**
 * The accessibility tree as the spec (#604), for the Listen app: the bar, search, and each view's
 * heading, as a screen reader will read them. Each template is matched as a subset.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let postId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'The tree is the spec', () => {
	test( 'the bar and Home', async ( { page } ) => {
		await page.goto( pageUrl );
		// A navigation named Riff: the views as links, then search, whose field is a searchbox until
		// the script makes it a combobox over the suggestions.
		await expect( page.locator( '.riff-app-bar' ) ).toMatchAriaSnapshot( `
			- navigation "Riff":
			  - link "Home"
			  - link "Albums"
			  - link "Artists"
			  - link "Tracks"
			  - link "Posts"
			  - link "Library"
			  - search
		` );
		// Home: one heading, then each row of what was played and added as a region with its own
		// heading and a Show all link, every card a Play button beside a link.
		await expect( page.locator( '[data-riff-app-view]' ) ).toMatchAriaSnapshot( `
			- heading "Home" [level=2]
			- region "Recently added":
			  - heading "Recently added" [level=3]
			  - link "Show all"
			  - button "Play Compositions"
			  - link "Compositions"
			- region "Artists":
			  - heading "Artists" [level=3]
			  - link "Show all"
			  - list "Artists":
			    - listitem:
			      - link /Airmen of Note/
			- region "New posts":
			  - heading "New posts" [level=3]
			  - link "Show all"
		` );
	} );

	test( 'a post, with its tracks as rows and its Play and Shuffle', async ( { page } ) => {
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		// The post's name as the heading, its line, Play and Shuffle, then its tracks as the rows a
		// post has: each a button named for the track, with its heart and its … after it.
		await expect( page.locator( '[data-riff-app-view]' ) ).toMatchAriaSnapshot( `
			- heading /Riff app e2e/ [level=2]
			- paragraph: /2 tracks/
			- paragraph:
			  - button "Play"
			  - button "Shuffle"
			- figure:
			  - button "Play Underground"
			  - button "Like Underground"
			  - button "More options for Underground"
			- figure:
			  - button "Play Trombone Detritus"
			  - button "Like Trombone Detritus"
			  - button "More options for Trombone Detritus"
		` );
	} );

	test( 'the lists, each under one heading', async ( { page } ) => {
		await page.goto( pageUrl );
		for ( const name of [ 'Albums', 'Artists', 'Tracks' ] ) {
			await page.locator( '.riff-app-tab', { hasText: name } ).click();
			await expect( page.locator( '[data-riff-app-view] h2' ) ).toHaveText( name );
			// A view change moves focus to its heading, which is how it is announced.
			await expect( page.locator( '[data-riff-app-view] h2' ) ).toBeFocused();
		}
		await expect( page.locator( '[data-riff-app-view]' ) ).toMatchAriaSnapshot( `
			- heading "Tracks" [level=2]
			- paragraph: /\\d+ tracks/
			- paragraph:
			  - button "Play"
			  - button "Shuffle"
			- figure:
			  - button /^Play /
			  - button /^Like /
			  - button /^More options for /
		` );
	} );

	test( 'search, as a combobox over a list of suggestions', async ( { page } ) => {
		await page.goto( pageUrl );
		// The field is a combobox once the app's script has wired it.
		await expect( page.locator( '[data-riff-app][data-riff-app-ready]' ) ).toBeAttached();
		const field = page.locator( '.riff-app-search input' );
		await field.click();
		await field.fill( 'Und' );
		await expect( page.locator( '#riff-suggest' ) ).toBeVisible();
		await expect( page.locator( '.riff-app-bar' ) ).toMatchAriaSnapshot( `
			- search:
			  - combobox "Search music" [expanded]
		` );
		await expect( page.locator( '#riff-suggest' ) ).toMatchAriaSnapshot( `
			- listbox "Suggestions":
			  - group "Top result":
			    - option /Underground/
		` );
	} );
} );
