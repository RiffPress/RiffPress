/**
 * The app, end to end: a page holding the block, a post opened inside it, the music carrying on
 * while the listener moves between the library and the post.
 *
 * Runs on desktop and on an iPhone viewport (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

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

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await requestUtils.uploadMedia(
		path.join( FIXTURES, 'cover.png' )
	);
	const audio = [];
	for ( const file of FILES ) {
		const media = await requestUtils.uploadMedia(
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
		const extra = await requestUtils.createPost( {
			title: `Riff app extra ${ i }`,
			status: 'publish',
			content: block,
			date: new Date( Date.now() - ( 100 - i ) * 60000 ).toISOString(),
		} );
		extraId = extra.id;
	}
	const post = await requestUtils.createPost( {
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
	const page = await requestUtils.createPage( {
		title: 'Listen e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	pageUrl = page.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.deleteAllPages();
	await requestUtils.deleteAllPosts();
	await requestUtils.deleteAllMedia();
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

	test( 'the music carries on from the post to the library and back', async ( {
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
		const more = page.getByRole( 'button', { name: 'Load more' } );
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
