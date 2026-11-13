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

	test( 'a view arrives in a transition of the view alone, the rest of the page left live', async ( {
		page,
	} ) => {
		// The suite runs with reduced motion, which has no transition at all.
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		const captured = await page.evaluate( () => {
			if ( ! document.startViewTransition ) {
				return null;
			}
			const start = document.startViewTransition.bind( document );
			const seen = [];
			document.startViewTransition = ( update ) => {
				const name = ( el ) => el && getComputedStyle( el ).viewTransitionName;
				seen.push( {
					page: name( document.documentElement ),
					view: name( document.querySelector( '.riff-app-view' ) ),
				} );
				return start( update );
			};
			window.riffSeen = seen;
			return true;
		} );
		test.skip( ! captured, 'no view transitions in this browser' );
		await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
		await expect( page ).toHaveURL( /riff_view=albums/ );
		const seen = await page.evaluate( () => window.riffSeen );
		expect( seen.length ).toBeGreaterThan( 0 );
		expect( seen[ 0 ] ).toEqual( { page: 'none', view: 'riff-app-view' } );
		// Once it is over, the page is as it was, for a theme's own transitions.
		await expect
			.poll( () => page.evaluate( () => getComputedStyle( document.documentElement ).viewTransitionName ) )
			.toBe( 'root' );
	} );

	test( 'a tab is fetched once it is wanted, never only because the page is idle, and alone', async ( {
		page,
		isMobile,
	} ) => {
		// Search is a tab only on a phone in standalone mode; here its field is in view.
		const tabs = page.locator( '.riff-app-tab[href*="riff_view="]:visible' );
		await expect( tabs ).toHaveCount( 5 );
		const fetched = () =>
			page.evaluate(
				() =>
					performance
						.getEntriesByType( 'resource' )
						.filter( ( r ) => r.name.includes( 'riff_view=' ) ).length
			);
		// Long past the idle moment that used to fetch every tab: each one is a view the server
		// draws, for a listener who may never open it.
		await page.waitForTimeout( 2500 );
		expect( await fetched(), 'no tab fetched while idle' ).toBe( 0 );
		const asked = [];
		page.on( 'request', ( r ) => {
			if ( r.url().includes( 'riff_view=artists' ) ) {
				asked.push( r.url() );
			}
		} );
		const artists = page.locator( '.riff-app-tab', { hasText: 'Artists' } );
		// A pointer resting on the tab, or a finger landing on it, fetches its view; the choice then
		// waits on that one fetch, never a second.
		if ( isMobile ) {
			await artists.tap();
		} else {
			await artists.hover();
			await expect.poll( () => asked.length ).toBe( 1 );
			await artists.click();
		}
		await expect( page.locator( '.riff-app-tab[aria-current="page"]' ) ).toHaveText( 'Artists' );
		await expect( page.locator( '.riff-artist' ).first() ).toBeVisible();
		expect( asked, 'one fetch, for the view alone' ).toHaveLength( 1 );
		expect( new URL( asked[ 0 ] ).searchParams.get( 'riff_part' ) ).toBe( 'view' );
	} );

	test( 'a view is fetched when the pointer rests on its link, not as it passes over', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'a phone has no pointer to rest' );
		await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
		const link = page.locator( '.riff-grid .riff-card-link' ).first();
		await expect( link ).toBeVisible();
		const album = new URL( await link.getAttribute( 'href' ), page.url() ).searchParams.get(
			'riff_album'
		);
		const asked = [];
		page.on( 'request', ( r ) => {
			if ( new URL( r.url() ).searchParams.get( 'riff_album' ) === album ) {
				asked.push( r.url() );
			}
		} );
		// Passing over: on and off again before the pointer rests.
		const box = await link.boundingBox();
		await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 );
		await page.mouse.move( 0, 0 );
		await page.waitForTimeout( 300 );
		expect( asked, 'passing over fetches nothing' ).toEqual( [] );
		// Resting on it.
		await link.hover();
		await expect.poll( () => asked.length ).toBeGreaterThan( 0 );
	} );

	test( 'an artist page has their picture or their initial, their latest tracks and their albums', async ( {
		page,
	} ) => {
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await page.locator( '.riff-artists .riff-artist', { hasText: 'Airmen of Note' } ).first().click();
		await expect( page.locator( '.riff-album-kind' ) ).toHaveText( /Artist/i );
		// No picture of their own: their newest album's cover, or where that is only a cover Riff
		// drew, which a round frame would cut, their initial. Which the fixture's album has depends
		// on whether an earlier spec gave it artwork.
		const round = page.locator( '.riff-album-round' );
		await expect( round.locator( '.riff-album-cover img, .riff-album-mark' ) ).toHaveCount( 1 );
		if ( ( await round.locator( '.riff-album-mark' ).count() ) > 0 ) {
			await expect( round.locator( '.riff-album-mark' ) ).toHaveText( 'A' );
		} else {
			await expect( round.locator( '.riff-album-cover img' ) ).toBeVisible();
		}
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
		const searches = [];
		page.on( 'request', ( r ) => {
			const u = decodeURIComponent( r.url() );
			if ( /riff\/v1\/(tracks|albums|artists).*search=/.test( u ) ) {
				searches.push( u );
			}
		} );
		await field.pressSequentially( 'Compo' );
		const list = page.locator( '.riff-suggest' );
		await expect( list ).toBeVisible();
		expect( ( await asked ).headers()[ 'x-wp-nonce' ] ).toBeTruthy();
		// Typed without a pause, the word is asked for once, and only for as many as are shown.
		expect( searches ).toHaveLength( 3 );
		expect( searches.find( ( u ) => /\/albums/.test( u ) ) ).toMatch( /per_page=3/ );
		await expect( field ).toHaveAttribute( 'aria-expanded', 'true' );
		await expect( list.locator( '.riff-suggest-top' ) ).toContainText( 'Compositions' );
		await expect( page.locator( '.riff-app-sr', { hasText: /suggestion/ } ) ).toHaveText( /\d+ suggestions?/ );
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
