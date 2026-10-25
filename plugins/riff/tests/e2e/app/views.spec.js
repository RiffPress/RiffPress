/**
 * The Listen app's page: a card plays from its cover, a post opens without leaving, the music carries on through Back and Forward, Home remembers what was played, and Play and Shuffle start a post.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, playing, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let postId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'App', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( pageUrl );
	} );

	test( 'a server-rendered card plays from its cover, with the button beside the link', async ( {
		page,
	} ) => {
		const card = page.locator( `.riff-card[data-riff-post="${ postId }"]` );
		await expect( card.locator( '.riff-card-play' ) ).toBeAttached();
		await expect( page.locator( 'a .riff-card-play' ) ).toHaveCount( 0 );
		await card.locator( '.riff-card-play' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		await expect( page ).toHaveURL( pageUrl );
	} );

	test( 'a cover pressed before the app has loaded still plays once it has', async ( {
		page,
	} ) => {
		// The app's script held back, as a slow site serves it.
		let release;
		const held = new Promise( ( resolve ) => ( release = resolve ) );
		await page.route( /features\/listen\/app\.js/, async ( route ) => {
			await held;
			await route.continue();
		} );
		await page.goto( pageUrl );
		await page
			.locator( `.riff-card[data-riff-post="${ postId }"] .riff-card-play` )
			.click();
		expect( ( await playing( page ) ).paused, 'nothing yet' ).toBe( true );
		release();
		await expect
			.poll( async () => ( await playing( page ) ).paused, { timeout: 15000 } )
			.toBe( false );
		await expect( page ).toHaveURL( pageUrl );
	} );

	test( 'the page lists the library and opens a post without leaving', async ( {
		page,
	} ) => {
		const card = page.locator( `.riff-card[data-riff-post="${ postId }"]` );
		await expect( card ).toContainText( '2 tracks' );
		await card.click();
		await expect( page ).toHaveURL( new RegExp( `riff=${ postId }$` ) );
		await expect( page.locator( '.riff-album-title' ) ).toContainText(
			'Riff app e2e'
		);
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
		await expect(
			page.locator( '.riff-app' ),
			'the app swapped the view in rather than loading a page'
		).toHaveJSProperty( 'isConnected', true );
	} );

	test( 'the music carries on from the post to the library, Back and Forward', async ( {
		page,
	} ) => {
		await page.locator( `.riff-card[data-riff-post="${ postId }"]` ).click();
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).time )
			.toBeGreaterThan( 1 );
		const audio = await page.evaluateHandle( () =>
			document.querySelector( '.riff-audio' )
		);

		await page.locator( '.riff-app-home' ).click();
		await expect( page ).toHaveURL( pageUrl );
		await expect( page.locator( '[data-riff-shelf="added"]' ) ).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );
		expect(
			await page.evaluate(
				( el ) => el === document.querySelector( '.riff-audio' ),
				audio
			),
			'the same audio element is still playing'
		).toBe( true );

		await page.goBack();
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'data-playing',
			'true'
		);
		expect( ( await playing( page ) ).paused ).toBe( false );

		await page.goForward();
		await expect( page ).toHaveURL( pageUrl );
		await expect( page.locator( '[data-riff-shelf="added"]' ) ).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );

	test( 'closing Now Playing on the app page keeps the view and returns focus', async ( {
		page,
	} ) => {
		// Now Playing closes through history.back(); the app must not read that as a view change.
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		const album = await page.evaluateHandle( () =>
			document.querySelector( '.riff-album' )
		);
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		// Focus returns once the close has settled; the view is checked after that.
		await expect( page.locator( '.riff-bar-info' ) ).toBeFocused();
		expect(
			await page.evaluate(
				( el ) => el === document.querySelector( '.riff-album' ),
				album
			),
			'the post view was not swapped for a fresh copy'
		).toBe( true );
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );

	test( 'Home jumps back into what was playing, and remembers what was played after a reload', async ( {
		page,
	} ) => {
		await page.evaluate( () => localStorage.removeItem( 'riff-history' ) );
		await page.locator( `.riff-card[data-riff-post="${ postId }"] .riff-card-link` ).click();
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( '.riff-app-home' ).click();

		const jump = page.locator( '[data-riff-shelf="jump"]' );
		await expect( jump ).toBeVisible();
		await expect( jump.locator( '.riff-card-link' ).first() ).toHaveAttribute(
			'href',
			new RegExp( `[?&]riff=${ postId }$` )
		);
		const recent = page.locator( '[data-riff-shelf="recent"]' );
		await expect( recent.locator( '.riff-card-title' ).first() ).toHaveText( 'Trombone Detritus' );

		await page.reload();
		await expect( recent.locator( '.riff-card-title' ).first() ).toHaveText( 'Trombone Detritus' );
		await jump.locator( '.riff-card-link' ).first().click();
		await expect( page ).toHaveURL( new RegExp( `riff=${ postId }$` ) );
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
	} );

	test( 'a visitor’s Home leaves out what the site no longer has, rather than a dead card', async ( {
		browser,
	} ) => {
		const context = await browser.newContext( { storageState: { cookies: [], origins: [] } } );
		const page = await context.newPage();
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect.poll( async () => ( await playing( page ) ).time ).toBeGreaterThan( 0.5 );
		// As if a post and its file had been played here, then deleted from the site.
		await page.evaluate( () => {
			const list = JSON.parse( localStorage.getItem( 'riff-history' ) || '[]' );
			list.unshift( {
				id: '999999',
				title: 'Gone track',
				artist: 'Nobody',
				art: [ { src: '/wp-content/uploads/gone.png' } ],
				post: { id: 999998, title: 'Gone post', url: '/gone/' },
				played: Date.now(),
			} );
			localStorage.setItem( 'riff-history', JSON.stringify( list ) );
		} );
		await page.goto( pageUrl );
		const jump = page.locator( '[data-riff-shelf="jump"]' );
		await expect( jump.locator( '.riff-card-title' ).first() ).toBeVisible();
		await expect( jump.locator( '.riff-card-title', { hasText: 'Gone post' } ) ).toHaveCount( 0 );
		await expect( page.locator( '[data-riff-shelf="recent"] .riff-card-title', { hasText: 'Gone track' } ) ).toHaveCount( 0 );
		await expect( jump.locator( '.riff-card-link' ).first() ).toHaveAttribute( 'href', new RegExp( `[?&]riff=${ postId }$` ) );
		// No card on the page shows a broken cover.
		expect(
			await page.evaluate( () => [ ...document.querySelectorAll( '.riff-card-art img' ) ].filter( ( img ) => img.complete && img.naturalWidth === 0 ).length )
		).toBe( 0 );
		await context.close();
	} );

	test( 'Home is rows that scroll sideways, each with Show all, and passes an accessibility check', async ( {
		page,
	} ) => {
		const added = page.locator( '[data-riff-shelf="added"]' );
		await expect( added.locator( '.riff-shelf-all' ) ).toHaveAttribute( 'href', /riff_view=albums/ );
		const row = added.locator( '.riff-shelf-row' );
		await expect( row ).toHaveCSS( 'overflow-x', 'auto' );
		await expect( row ).toHaveAttribute( 'tabindex', '0' );
		await page.locator( '[data-riff-shelf="posts"] .riff-shelf-all' ).click();
		await expect( page ).toHaveURL( /riff_view=posts/ );
		await expect( page.locator( '.riff-grid .riff-card' ).first() ).toBeVisible();
		await page.locator( '.riff-app-home' ).click();
		await expect( page.locator( '[data-riff-shelf="added"]' ) ).toBeVisible();
		const results = await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app' ).analyze();
		expect( results.violations ).toEqual( [] );
	} );

	test( 'Play and Shuffle start the post from its header', async ( {
		page,
	} ) => {
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await page.locator( '[data-riff-app-action="shuffle"]' ).click();
		await expect(
			page.locator( '.riff-bar [data-riff-action="shuffle"]' )
		).toHaveAttribute( 'aria-pressed', 'true' );
	} );
} );
