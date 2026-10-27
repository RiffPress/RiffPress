/**
 * Browsing: albums, an album, an artist, search as you type, every view under axe, and every browse view without the script.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, playing, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Browse', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( pageUrl );
	} );

	test( 'albums, an album, search and Back, with the music carrying on throughout', async ( {
		page,
	} ) => {
		await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
		await expect( page ).toHaveURL( /riff_view=albums/ );
		await page
			.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } )
			.first()
			.locator( '.riff-card-link' )
			.click();
		await expect( page ).toHaveURL( /riff_album=\d+/ );
		await expect( page.locator( '.riff-row' ).first() ).toBeVisible();
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );

		const search = page.locator( '.riff-app-search input' );
		await search.fill( 'Trombone' );
		await search.press( 'Enter' );
		await expect( page ).toHaveURL( /riff_search=Trombone/ );
		await expect( page.locator( '.riff-app-title' ) ).toContainText( 'Trombone' );
		await expect(
			page.locator( '.riff-row', { hasText: 'Trombone Detritus' } ).first()
		).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );

		await page.goBack();
		await expect( page ).toHaveURL( /riff_album=\d+/ );
		await expect( page.locator( '.riff-row' ).first() ).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );

	test( 'the tabs are fetched ahead, so choosing one waits on nothing', async ( {
		page,
	} ) => {
		// Search is a tab only on a phone in standalone mode; here its field is in view.
		const tabs = page.locator( '.riff-app-tab[href*="riff_view="]:visible' );
		await expect( tabs ).toHaveCount( 5 );
		// Once the page is idle every tab's view is fetched; this page's own resource timings show
		// when all five have arrived.
		await expect
			.poll( () =>
				page.evaluate(
					() =>
						performance
							.getEntriesByType( 'resource' )
							.filter( ( r ) => r.name.includes( 'riff_view=' ) ).length
				)
			)
			.toBeGreaterThanOrEqual( 5 );
		const asked = [];
		page.on( 'request', ( r ) => {
			if ( r.url().includes( 'riff_view=artists' ) ) {
				asked.push( r.url() );
			}
		} );
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await expect( page.locator( '.riff-app-tab[aria-current="page"]' ) ).toHaveText( 'Artists' );
		await expect( page.locator( '.riff-artist' ).first() ).toBeVisible();
		expect( asked, 'the view was already here' ).toEqual( [] );
	} );

	test( 'an artist page has their picture, their latest tracks and their albums', async ( {
		page,
	} ) => {
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await page.locator( '.riff-artists .riff-artist', { hasText: 'Airmen of Note' } ).first().click();
		await expect( page.locator( '.riff-album-kind' ) ).toHaveText( /Artist/i );
		await expect( page.locator( '.riff-album-round .riff-album-cover img' ) ).toBeVisible();
		await expect( page.locator( '.riff-app-section', { hasText: 'Latest' } ) ).toBeVisible();
		await expect( page.locator( '.riff-app-section', { hasText: 'Albums' } ) ).toBeVisible();
		await expect( page.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } ) ).toBeVisible();
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
	} );

	test( 'search answers as you type, with the keyboard, and remembers what was searched', async ( {
		page,
	} ) => {
		await page.evaluate( () => localStorage.removeItem( 'riff-searches' ) );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		const field = page.locator( '.riff-app-search input' );
		await expect( field ).toHaveAttribute( 'role', 'combobox' );
		await field.click();
		// Signed in, the suggestions are asked for as the account, with its nonce, as the views are.
		const asked = page.waitForRequest( ( r ) => /riff\/v1\/tracks.*search=/.test( decodeURIComponent( r.url() ) ) );
		await field.pressSequentially( 'Compo' );
		const list = page.locator( '.riff-suggest' );
		await expect( list ).toBeVisible();
		expect( ( await asked ).headers()[ 'x-wp-nonce' ] ).toBeTruthy();
		await expect( field ).toHaveAttribute( 'aria-expanded', 'true' );
		await expect( list.locator( '.riff-suggest-top' ) ).toContainText( 'Compositions' );
		await expect( page.locator( '.riff-app-sr' ) ).toHaveText( /\d+ suggestions?/ );
		const results = await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app' ).analyze();
		expect( results.violations ).toEqual( [] );

		await field.press( 'ArrowDown' );
		await expect( field ).toHaveAttribute( 'aria-activedescendant', 'riff-suggest-o0' );
		await field.press( 'Enter' );
		await expect( page ).toHaveURL( /riff_album=\d+/ );
		await expect( page.locator( '.riff-album-title' ) ).toHaveText( 'Compositions' );

		// Escape closes the list; Enter with nothing chosen loads every result, as before.
		await field.fill( 'Under' );
		await expect( list ).toBeVisible();
		await field.press( 'Escape' );
		await expect( list ).toBeHidden();
		await expect( field ).toHaveAttribute( 'aria-expanded', 'false' );
		await field.press( 'Enter' );
		await expect( page ).toHaveURL( /riff_search=Under/ );

		await page.reload();
		await page.locator( '.riff-app-search input' ).fill( '' );
		await page.locator( '.riff-app-search input' ).focus();
		await expect( page.locator( '.riff-suggest-recent' ).first() ).toHaveText( 'Under' );
		await expect( page.locator( '.riff-suggest-recent' ).nth( 1 ) ).toHaveText( 'Compo' );
	} );

	test( 'on a phone the cards stand two to a row, as the apps lay them out', async ( {
		page,
		isMobile,
	} ) => {
		// A wide screen's grid is the desktop specs' to check.
		if ( ! isMobile ) {
			return;
		}
		await page.goto( pageUrl + ( pageUrl.includes( '?' ) ? '&' : '?' ) + 'riff_view=posts' );
		const cards = page.locator( '.riff-grid .riff-card' );
		await expect( cards.nth( 1 ) ).toBeVisible();
		const [ first, second ] = [ await cards.nth( 0 ).boundingBox(), await cards.nth( 1 ).boundingBox() ];
		expect( Math.abs( first.y - second.y ) ).toBeLessThanOrEqual( 1 );
		expect( second.x ).toBeGreaterThan( first.x + first.width );
		expect( second.x + second.width ).toBeLessThanOrEqual( page.viewportSize().width );
	} );

	test( 'every view passes an accessibility check', async ( { page } ) => {
		const views = [ '', 'riff_view=albums', 'riff_view=artists', 'riff_view=tracks', 'riff_view=posts', 'riff_view=library', 'riff_search=Compositions' ];
		for ( const view of views ) {
			await page.goto( pageUrl + ( view ? ( pageUrl.includes( '?' ) ? '&' : '?' ) + view : '' ) );
			await expect( page.locator( '.riff-app-view h2' ).first() ).toBeVisible();
			const results = await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app' ).analyze();
			expect( results.violations, view || 'Home' ).toEqual( [] );
		}
		// One album and one artist, reached the way a listener reaches them.
		await page.goto( pageUrl + ( pageUrl.includes( '?' ) ? '&' : '?' ) + 'riff_view=albums' );
		await page.locator( '.riff-card[data-riff-album] .riff-card-link' ).first().click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app' ).analyze() ).violations, 'an album' ).toEqual( [] );
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await page.locator( '.riff-artist' ).first().click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app' ).analyze() ).violations, 'an artist' ).toEqual( [] );
	} );

	test( 'every browse view reads without the script', async ( { browser } ) => {
		const context = await browser.newContext( { javaScriptEnabled: false } );
		const plain = await context.newPage();
		await plain.goto( pageUrl );
		await plain.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await expect( plain.locator( '.riff-artist' ).first() ).toBeVisible();
		await plain.locator( '.riff-app-search input' ).fill( 'Compositions' );
		await plain.locator( '.riff-app-search input' ).press( 'Enter' );
		await expect( plain.locator( '.riff-app-title' ) ).toContainText( 'Compositions' );
		await expect( plain.locator( 'figure[data-riff-track]' ).first() ).toBeAttached();
		await context.close();
	} );
} );
