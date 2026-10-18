/**
 * The app, end to end: a page holding the block, a post opened inside it, the music carrying on
 * while the listener moves between the library and the post.
 *
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );

const FIXTURES = path.join(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'packages',
	'fixtures',
	'compositions'
);
const FILES = [
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];

let pageUrl;
let postId;
let extraId;

const made = own();

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await made.media( requestUtils,
		path.join( FIXTURES, 'cover.png' )
	);
	const audio = [];
	for ( const file of FILES ) {
		const media = await made.media( requestUtils,
			path.join( FIXTURES, file )
		);
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { featured_media: cover.id },
		} );
		audio.push( media );
	}
	// Enough older posts for a second page of the library, made first so the post above is newest.
	const block = `<!-- wp:audio {"id":${ audio[ 0 ].id }} --><figure class="wp-block-audio"><audio controls src="${ audio[ 0 ].source_url }"></audio></figure><!-- /wp:audio -->`;
	for ( let i = 1; i <= 24; i++ ) {
		const extra = await made.post( requestUtils, {
			title: `Riff app extra ${ i }`,
			status: 'publish',
			content: block,
			date: new Date( Date.now() - ( 100 - i ) * 60000 ).toISOString(),
		} );
		extraId = extra.id;
	}
	const post = await made.post( requestUtils, {
		title: `Riff app e2e ${ Date.now() }`,
		status: 'publish',
		content: audio
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ),
		featured_media: cover.id,
	} );
	postId = post.id;
	const page = await made.page( requestUtils, {
		title: 'Listen e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	pageUrl = page.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

const playing = ( page ) =>
	page.evaluate( () => {
		const a = document.querySelector( '.riff-audio' );
		return { paused: a.paused, time: a.currentTime };
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
		await expect( page.locator( '.riff-grid' ) ).toBeVisible();
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
		await expect( page.locator( '.riff-grid' ) ).toBeVisible();
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

	test( 'the library shows what is playing and Open stays in the app', async ( {
		page,
	} ) => {
		await page.locator( `.riff-card[data-riff-post="${ postId }"]` ).click();
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( '.riff-app-home' ).click();
		const now = page.locator( '.riff-now' );
		await expect( now ).toBeVisible();
		await expect( now.locator( '.riff-now-title' ) ).toHaveText(
			'Trombone Detritus'
		);
		await expect( now.locator( 'a.riff-pill' ) ).toHaveAttribute(
			'href',
			new RegExp( `[?&]riff=${ postId }$` )
		);
		await now.locator( 'a.riff-pill' ).click();
		await expect( page ).toHaveURL( new RegExp( `riff=${ postId }$` ) );
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
		expect( ( await playing( page ) ).paused ).toBe( false );
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

test.describe( 'Standalone', () => {
	test( 'on a wide screen the navigation is a sidebar; on a phone it stays tabs', async ( {
		page,
		isMobile,
	} ) => {
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		const nav = await page.locator( '.riff-app-bar' ).boundingBox();
		const view = await page.locator( '.riff-app-view' ).boundingBox();
		const brand = page.locator( '.riff-app-brand' );
		if ( isMobile ) {
			await expect( brand ).toBeHidden();
			expect( nav.y + nav.height ).toBeLessThanOrEqual( view.y + 1 );
		} else {
			await expect( brand ).toBeVisible();
			expect( nav.x + nav.width, 'the column sits left of the view' ).toBeLessThanOrEqual( view.x + 1 );
			await expect( page.locator( '.riff-app-tab svg' ).first() ).toBeVisible();
		}
	} );

	test( 'app/ is the player on its own: no theme, installable, and browsing stays inside it', async ( {
		page,
		request,
	} ) => {
		const app = pageUrl.replace( /\/?$/, '/' ) + 'app/';
		await page.goto( app );
		await expect( page.locator( 'body.riff-standalone .riff-app' ) ).toBeVisible();
		await expect(
			page.locator( 'link[rel="stylesheet"][href*="/themes/"]' ),
			'none of the theme\'s styles'
		).toHaveCount( 0 );
		await expect( page.locator( '#wpadminbar' ) ).toHaveCount( 0 );

		const manifest = await page.locator( 'link[rel="manifest"]' ).getAttribute( 'href' );
		const answer = await request.get( manifest );
		expect( answer.headers()[ 'content-type' ] ).toContain( 'application/manifest+json' );
		const json = await answer.json();
		expect( json.display ).toBe( 'standalone' );
		expect( json.start_url ).toBe( app );

		await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
		await expect( page ).toHaveURL( /\/app\/\?riff_view=albums/ );
		await page
			.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } )
			.first()
			.locator( '.riff-card-link' )
			.click();
		await expect( page ).toHaveURL( /\/app\/\?riff_album=\d+/ );
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
	} );
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
		await page.locator( '.riff-app-home' ).click();
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

test.describe( 'App pages', () => {
	test( 'the first visit offers Load more, which adds the page in place and keeps the music', async ( {
		page,
	} ) => {
		await page.goto( pageUrl );
		const cards = page.locator( '.riff-grid .riff-card' );
		await expect( cards ).toHaveCount( 24 );
		await page
			.locator( `.riff-card[data-riff-post="${ postId }"] .riff-card-play` )
			.click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );

		await page.getByRole( 'link', { name: 'Load more' } ).click();
		await expect( cards ).toHaveCount( 25 );
		await expect( page ).toHaveURL( /[?&]riff_page=2$/ );
		await expect( page.locator( '#riff-page-2 a' ) ).toBeFocused();
		expect( ( await playing( page ) ).paused ).toBe( false );

		// Out to a post and back: the address still asks for both pages.
		await page.locator( `.riff-card[data-riff-post="${ postId }"] a` ).click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();
		await page.goBack();
		await expect( cards ).toHaveCount( 25 );
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
		await page.goto( pageUrl );
		await expect( page.locator( '.riff-grid .riff-card' ) ).toHaveCount( 24 );
		await page.getByRole( 'link', { name: 'Load more' } ).click();
		await expect( page ).toHaveURL( /[?&]riff_page=2#riff-page-2$/ );
		await expect( page.locator( '.riff-grid .riff-card' ) ).toHaveCount( 25 );
		await expect( page.locator( '#riff-page-2' ) ).toBeInViewport();
		await context.close();
	} );
} );
