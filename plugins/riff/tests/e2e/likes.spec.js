/**
 * Likes, end to end: a heart on a row, in the bar and on an album's page, kept in the account for
 * someone signed in and in the browser for a visitor; the visitor's likes joining their account
 * when they sign in; and Your Library in the Listen block.
 *
 * The suite's own pages are signed in as the admin. A visitor is a fresh context with no cookies.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );
const AxeBuilder = require( '@axe-core/playwright' ).default;

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

let postUrl;
let listenUrl;
let audio;
let album;
let artist;

const made = own();

// The admin's likes and plays, emptied, so each test starts from nothing.
async function forgetAll( requestUtils ) {
	const { items } = await requestUtils.rest( { path: '/riff/v1/users/me/likes' } );
	for ( const l of items ) {
		await requestUtils.rest( {
			method: 'DELETE',
			path: `/riff/v1/users/me/likes/${ l.kind }/${ l.id }`,
		} );
	}
	await requestUtils.rest( { method: 'DELETE', path: '/riff/v1/users/me/history' } );
}

const likesOf = async ( requestUtils ) =>
	( await requestUtils.rest( { path: '/riff/v1/users/me/likes' } ) ).items.map(
		( l ) => `${ l.kind }:${ l.id }`
	);

const withArg = ( url, arg ) => url + ( url.includes( '?' ) ? '&' : '?' ) + arg;

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await made.media( requestUtils, path.join( FIXTURES, 'cover.png' ) );
	audio = [];
	for ( const file of FILES ) {
		const media = await made.media( requestUtils, path.join( FIXTURES, file ) );
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { featured_media: cover.id },
		} );
		audio.push( media );
	}
	const post = await made.post( requestUtils, {
		title: `Riff likes e2e ${ Date.now() }`,
		status: 'publish',
		content: audio
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ),
		featured_media: cover.id,
	} );
	postUrl = post.link;
	const page = await made.page( requestUtils, {
		title: 'Likes e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	listenUrl = page.link;
	album = (
		await requestUtils.rest( {
			path: '/riff/v1/albums',
			params: { search: 'Compositions' },
		} )
	).items[ 0 ].id;
	artist = (
		await requestUtils.rest( {
			path: '/riff/v1/artists',
			params: { search: 'Airmen' },
		} )
	).items[ 0 ].id;
} );

test.beforeEach( async ( { requestUtils } ) => {
	await forgetAll( requestUtils );
} );

test.afterAll( async ( { requestUtils } ) => {
	await forgetAll( requestUtils );
	await made.cleanUp( requestUtils );
} );

test( 'signed in, a heart on a row and in the bar saves to the account, and stays after a reload', async ( {
	page,
	requestUtils,
} ) => {
	await page.goto( postUrl );
	const heart = page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-like-button' );
	await expect( heart ).toHaveAttribute( 'aria-label', 'Like Underground' );
	await heart.click();
	await expect( heart ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect.poll( () => likesOf( requestUtils ) ).toEqual( [ `track:${ audio[ 0 ].id }` ] );
	expect(
		await page.evaluate( () => localStorage.getItem( 'riff-likes' ) ),
		'nothing kept in the browser'
	).toBeNull();

	await page.reload();
	await expect(
		page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-like-button' )
	).toHaveAttribute( 'aria-pressed', 'true' );

	await page.evaluate( () => {
		window.riffLikes = [];
		window.riffInternal.listen( 'like', ( d ) => window.riffLikes.push( `${ d.change } ${ d.kind }` ) );
	} );

	// The bar's heart follows the track playing.
	await page.locator( '.riff-row' ).nth( 1 ).click();
	const bar = page.locator( '.riff-bar [data-riff-action="like"]' );
	await expect( bar ).toBeVisible();
	await expect( bar ).toHaveAttribute( 'aria-pressed', 'false' );
	await bar.click();
	await expect( bar ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect(
		page.locator( '.riff-track' ).nth( 1 ).locator( '.riff-like-button' ),
		'the row agrees'
	).toHaveAttribute( 'aria-pressed', 'true' );
	await expect
		.poll( () => likesOf( requestUtils ) )
		.toEqual( [ `track:${ audio[ 1 ].id }`, `track:${ audio[ 0 ].id }` ] );

	// The menu on a row does the same, and says which way it goes.
	await page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-more-button' ).click();
	await page.locator( '.riff-menu' ).getByRole( 'menuitem', { name: 'Remove from Liked songs' } ).click();
	await expect( heart ).toHaveAttribute( 'aria-pressed', 'false' );
	await expect.poll( () => likesOf( requestUtils ) ).toEqual( [ `track:${ audio[ 1 ].id }` ] );
	expect( await page.evaluate( () => window.riffLikes ) ).toEqual( [ 'like track', 'unlike track' ] );
} );

// How many of a heart's two icons can be seen: one, the outline or the filled heart.
const shown = ( heart ) =>
	heart.evaluate( ( b ) =>
		[ ...b.querySelectorAll( 'svg' ) ]
			.filter( ( svg ) => getComputedStyle( svg ).display !== 'none' && svg.getBoundingClientRect().width > 0 )
			.map( ( svg ) => svg.matches( ':last-child' ) )
	);

test( 'every heart shows one icon, the outline or the filled one, liked or not', async ( {
	page,
} ) => {
	const check = async ( heart, where ) => {
		await expect( heart, where ).toBeVisible();
		const before = await heart.getAttribute( 'aria-pressed' );
		expect( await shown( heart ), `${ where }, ${ before }` ).toEqual( [ before === 'true' ] );
		await heart.click();
		await expect( heart ).toHaveAttribute( 'aria-pressed', before === 'true' ? 'false' : 'true' );
		expect( await shown( heart ), `${ where }, after a press` ).toEqual( [ before !== 'true' ] );
	};
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	const row = page.locator( '.riff-track' ).nth( 1 ).locator( '.riff-like-button' );
	await page.locator( '.riff-track' ).nth( 1 ).hover();
	await check( row, 'a row' );
	await check( page.locator( '.riff-bar [data-riff-action="like"]' ), 'the bar' );

	// Now Playing's own heart shows at a phone's width, where the bar is covered.
	await page.setViewportSize( { width: 390, height: 844 } );
	await page.locator( '.riff-bar-info' ).click();
	await check( page.locator( '.riff-np-meta [data-riff-action="like"]' ), 'Now Playing' );
	await page.keyboard.press( 'Escape' );
	await page.setViewportSize( { width: 1280, height: 720 } );

	for ( const app of [ listenUrl, listenUrl.replace( /\/?$/, '/' ) + 'app/' ] ) {
		await page.goto( withArg( app, `riff_album=${ album }` ) );
		await check( page.locator( '.riff-app-like' ), `an album page at ${ app }` );
		await check( page.locator( '.riff-bar [data-riff-action="like"]' ), `the bar at ${ app }` );
	}
} );

test( 'likes made one after another, signed in, are all kept', async ( { page, requestUtils } ) => {
	await page.goto( postUrl );
	await page.waitForFunction( () => typeof window.riffInternal?.like === 'function' );
	await page.evaluate(
		( ids ) => {
			window.riffInternal.like( ids[ 0 ] );
			window.riffInternal.like( ids[ 1 ] );
			window.riffInternal.like( ids[ 2 ], 'album' );
			window.riffInternal.unlike( ids[ 1 ] );
			window.riffInternal.like( ids[ 3 ], 'artist' );
		},
		[ audio[ 0 ].id, audio[ 1 ].id, album, artist ]
	);
	await expect
		.poll( () => likesOf( requestUtils ) )
		.toEqual( [ `artist:${ artist }`, `album:${ album }`, `track:${ audio[ 0 ].id }` ] );
} );

test( 'a like the account refuses goes back, and says so', async ( { page } ) => {
	await page.goto( postUrl );
	await page.route( /riff\/v1\/users\/me\/likes/, ( route ) => route.fulfill( { status: 403, body: '{}' } ) );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	const bar = page.locator( '.riff-bar [data-riff-action="like"]' );
	await bar.click();
	await expect( bar ).toHaveAttribute( 'aria-pressed', 'false' );
	await expect( page.locator( '.riff-toast' ) ).toHaveText( /could not be saved/ );
} );

test( 'a visitor\'s likes are kept in the browser, and Your Library shows them', async ( {
	browser,
	baseURL,
} ) => {
	const context = await browser.newContext( {
		baseURL,
		storageState: { cookies: [], origins: [] },
	} );
	const page = await context.newPage();
	await page.goto( postUrl );
	const heart = page.locator( '.riff-track' ).nth( 1 ).locator( '.riff-like-button' );
	await heart.click();
	await expect( heart ).toHaveAttribute( 'aria-pressed', 'true' );
	const kept = JSON.parse( await page.evaluate( () => localStorage.getItem( 'riff-likes' ) ) );
	expect( kept.map( ( l ) => `${ l.kind }:${ l.id }` ) ).toEqual( [ `track:${ audio[ 1 ].id }` ] );
	expect(
		( await context.request.get( '/?rest_route=/riff/v1/users/me/likes' ) ).status(),
		'the account route is for someone signed in'
	).toBe( 401 );

	await page.reload();
	await expect(
		page.locator( '.riff-track' ).nth( 1 ).locator( '.riff-like-button' )
	).toHaveAttribute( 'aria-pressed', 'true' );

	// Opened by its address, Your Library is drawn again with what this browser kept.
	await page.goto( withArg( listenUrl, 'riff_view=library' ) );
	await expect( page.locator( '[data-riff-library="device"]' ) ).toBeVisible();
	await expect( page.locator( '.riff-card-liked .riff-card-sub' ) ).toHaveText( '1 song' );
	await expect( page.locator( '.riff-library-note' ) ).toContainText( 'kept in this browser' );
	await page.locator( '.riff-chip-link', { hasText: 'Songs' } ).click();
	await expect( page ).toHaveURL( /riff_filter=songs/ );
	await expect( page.locator( '.riff-library .riff-row' ) ).toHaveCount( 1 );
	await expect( page.locator( '.riff-library .riff-row-title' ) ).toHaveText( 'Trombone Detritus' );
	await context.close();
} );

test( 'signing in brings a visitor\'s likes and plays into the account, and the browser forgets them', async ( {
	browser,
	baseURL,
	requestUtils,
} ) => {
	const context = await browser.newContext( {
		baseURL,
		storageState: { cookies: [], origins: [] },
	} );
	const page = await context.newPage();
	await page.goto( postUrl );
	await page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-like-button' ).click();
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await expect.poll( () => page.evaluate( () => window.riffInternal.history().length ) ).toBe( 1 );
	// An album liked from its page.
	await page.goto( withArg( listenUrl, `riff_album=${ album }` ) );
	const save = page.locator( '.riff-app-like' );
	await save.click();
	await expect( save ).toHaveAttribute( 'aria-pressed', 'true' );
	expect( await likesOf( requestUtils ), 'not in the account yet' ).toEqual( [] );

	await page.goto( '/wp-login.php' );
	await page.locator( '#user_login' ).fill( process.env.WP_USERNAME || 'admin' );
	await page.locator( '#user_pass' ).fill( process.env.WP_PASSWORD || 'password' );
	await page.locator( '#wp-submit' ).click();
	await page.waitForURL( /wp-admin/ );

	await page.goto( postUrl );
	await expect(
		page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-like-button' )
	).toHaveAttribute( 'aria-pressed', 'true' );
	await expect
		.poll( () => likesOf( requestUtils ) )
		.toEqual( [ `album:${ album }`, `track:${ audio[ 0 ].id }` ] );
	await expect
		.poll( () => page.evaluate( () => localStorage.getItem( 'riff-likes' ) ) )
		.toBeNull();
	await expect
		.poll( async () =>
			( await requestUtils.rest( { path: '/riff/v1/users/me/history' } ) ).items.map( ( t ) => t.title )
		)
		.toEqual( [ 'Underground' ] );
	await expect
		.poll( () => page.evaluate( () => localStorage.getItem( 'riff-history' ) ) )
		.toBeNull();
	expect( await page.evaluate( () => window.riffInternal.history().map( ( t ) => t.title ) ) ).toEqual( [ 'Underground' ] );
	await context.close();
} );

test( 'Your Library lists what was liked, narrows and sorts, and drops what is unliked', async ( {
	page,
	requestUtils,
} ) => {
	await requestUtils.rest( {
		method: 'POST',
		path: '/riff/v1/users/me/likes',
		data: {
			items: [
				{ kind: 'artist', id: artist, at: 1000 },
				{ kind: 'track', id: audio[ 0 ].id, at: 2000 },
				{ kind: 'track', id: audio[ 1 ].id, at: 3000 },
				{ kind: 'album', id: album, at: 4000 },
			],
		},
	} );
	await page.goto( listenUrl );
	await page.locator( '.riff-app-tab', { hasText: 'Library' } ).click();
	await expect( page ).toHaveURL( /riff_view=library/ );
	await expect( page.locator( '.riff-app-title' ) ).toHaveText( 'Your Library' );
	const grid = page.locator( '.riff-library-grid > .riff-card' );
	await expect( grid ).toHaveCount( 3 );
	await expect( grid.nth( 0 ) ).toContainText( 'Liked songs' );
	await expect( grid.nth( 0 ) ).toContainText( '2 songs' );
	await expect( grid.nth( 1 ) ).toHaveAttribute( 'data-riff-album', String( album ) );
	await expect( grid.nth( 2 ) ).toHaveAttribute( 'data-riff-artist', String( artist ) );
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, 'All' ).toEqual( [] );

	await page.locator( '.riff-library-sort summary' ).click();
	await page.locator( '.riff-sort-link', { hasText: 'Alphabetical' } ).click();
	await expect( page ).toHaveURL( /riff_sort=name/ );
	await expect( page.locator( '.riff-sort-link[aria-current="true"]' ) ).toHaveText( 'Alphabetical' );
	await expect( grid.nth( 1 ) ).toHaveAttribute( 'data-riff-artist', String( artist ) );

	for ( const [ chip, items ] of [ [ 'Albums', '.riff-grid .riff-card' ], [ 'Artists', '.riff-artists li' ] ] ) {
		await page.locator( '.riff-chip-link', { hasText: chip } ).click();
		await expect( page.locator( '.riff-chip-link[aria-current="true"]' ) ).toHaveText( chip );
		await expect( page.locator( `.riff-library ${ items }` ) ).toHaveCount( 1 );
		expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, chip ).toEqual( [] );
	}

	await page.locator( '.riff-library-sort summary' ).click();
	await page.locator( '.riff-sort-link', { hasText: 'Recently added' } ).click();
	await expect( page.locator( '.riff-sort-link[aria-current="true"]' ) ).toHaveText( 'Recently added' );
	await page.locator( '.riff-chip-link', { hasText: 'Songs' } ).click();
	const rows = page.locator( '.riff-library .riff-row' );
	await expect( rows ).toHaveCount( 2 );
	await expect( rows.locator( '.riff-row-title' ) ).toHaveText( [ 'Trombone Detritus', 'Underground' ] );
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, 'Songs' ).toEqual( [] );
	await page.locator( '[data-riff-app-action="play"]' ).click();
	await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Trombone Detritus' );

	// Unliked here, the song leaves the list, and the focus goes to the one after it.
	const first = page.locator( '.riff-library .riff-track' ).nth( 0 ).locator( '.riff-like-button' );
	await first.focus();
	await page.keyboard.press( 'Enter' );
	await expect( rows ).toHaveCount( 1 );
	await expect( page.locator( '.riff-library .riff-row' ).first() ).toBeFocused();
	await expect.poll( () => likesOf( requestUtils ) ).not.toContain( `track:${ audio[ 1 ].id }` );
} );

test( 'Your Library never looks empty: Liked songs, somewhere to start, then what was played', async ( {
	browser,
	baseURL,
} ) => {
	const context = await browser.newContext( {
		baseURL,
		storageState: { cookies: [], origins: [] },
	} );
	const page = await context.newPage();
	const library = withArg( listenUrl, 'riff_view=library' );
	await page.goto( library );
	const liked = page.locator( '.riff-card-liked' );
	await expect( liked ).toContainText( 'Press the heart on a song to keep it here' );
	await expect( liked.locator( '.riff-card-play' ), 'nothing to play yet' ).toHaveCount( 0 );
	const start = page.locator( '[data-riff-shelf="start"]' );
	const recent = page.locator( '.riff-library [data-riff-shelf="recent"]' );
	await expect( start ).toBeVisible();
	await expect( recent ).toBeHidden();
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, 'empty' ).toEqual( [] );

	// The row is Home's: an album plays from its cover.
	await start.locator( `.riff-card-play[data-riff-album="${ album }"]` ).click();
	await expect( page.locator( '.riff-bar .riff-title' ) ).not.toBeEmpty();
	const first = await page.locator( '.riff-bar .riff-title' ).textContent();

	// Played once, the library shows it, and the albums give way.
	await page.goto( library );
	await expect( recent ).toBeVisible();
	await expect( recent.locator( '.riff-card-title' ).first() ).toHaveText( first );
	await expect( start ).toBeHidden();

	// Liked, the songs play from their card.
	await page.locator( '.riff-bar [data-riff-action="like"]' ).click();
	await page.goto( library );
	await expect( liked ).toContainText( '1 song' );
	await page.locator( '.riff-bar [data-riff-action="toggle"]' ).first().click(); // Pause.
	await liked.locator( '[data-riff-app-action="play-liked"]' ).click();
	await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( first );
	await expect.poll( () => page.evaluate( () => ! document.querySelector( '.riff-audio' ).paused ) ).toBe( true );
	await expect( start ).toHaveCount( 0 );
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, 'filled' ).toEqual( [] );
	await context.close();
} );

test( 'an album\'s and an artist\'s heart save them, and say so', async ( { page, requestUtils } ) => {
	await page.goto( withArg( listenUrl, `riff_album=${ album }` ) );
	const save = page.locator( '.riff-app-like' );
	await expect( save ).toHaveAttribute( 'aria-label', 'Like Compositions' );
	await save.click();
	await expect( save ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect( page.locator( '.riff-app-status' ) ).toHaveText( 'Compositions added to your library' );
	await expect.poll( () => likesOf( requestUtils ) ).toEqual( [ `album:${ album }` ] );
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations ).toEqual( [] );

	await page.goto( withArg( listenUrl, `riff_artist=${ artist }` ) );
	await page.locator( '.riff-app-like' ).click();
	await expect.poll( () => likesOf( requestUtils ) ).toEqual( [ `artist:${ artist }`, `album:${ album }` ] );
	await page.locator( '.riff-app-like' ).click();
	await expect( page.locator( '.riff-app-status' ) ).toHaveText( /removed from your library/ );
	await expect.poll( () => likesOf( requestUtils ) ).toEqual( [ `album:${ album }` ] );
} );

test( 'the standalone sidebar lists Your Library with artwork, and its chips narrow it in place', async ( {
	page,
	requestUtils,
	isMobile,
} ) => {
	test.skip( isMobile, 'On a phone the navigation is tabs, with no room for the library.' );
	await requestUtils.rest( {
		method: 'POST',
		path: '/riff/v1/users/me/likes',
		data: {
			items: [
				{ kind: 'artist', id: artist, at: 1000 },
				{ kind: 'track', id: audio[ 0 ].id, at: 2000 },
				{ kind: 'album', id: album, at: 4000 },
			],
		},
	} );
	await page.setViewportSize( { width: 1440, height: 900 } );
	await page.goto( listenUrl.replace( /\/?$/, '/' ) + 'app/' );
	const library = page.locator( '.riff-app-library' );
	await expect( library.locator( '.riff-app-library-title' ) ).toHaveText( 'Your Library' );
	// Liked songs first, then what was liked, newest first, each with what it is.
	const rows = library.locator( 'li:not([hidden])' );
	await expect( rows.locator( '.riff-app-item-title' ) ).toHaveText( [ 'Liked songs', /./, /./ ] );
	await expect( rows.locator( '.riff-app-item-sub' ) ).toHaveText( [ 'Playlist · 1 song', /^Album · /, 'Artist' ] );
	await expect( rows.nth( 2 ).locator( '.riff-app-item-art' ) ).toHaveClass( /riff-app-item-round/ );
	// The tab for the library would say it twice beside its own heading.
	await expect( page.locator( '.riff-app-tab-library' ) ).toBeHidden();

	// A chip narrows the rows where they are; pressed again, everything is back.
	const albums = library.locator( '.riff-app-library-chip', { hasText: 'Albums' } );
	await albums.click();
	await expect( page ).not.toHaveURL( /riff_view=library/ );
	await expect( albums ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect( rows ).toHaveCount( 1 );
	await expect( rows.locator( '.riff-app-item-sub' ) ).toHaveText( /^Album · / );
	// It holds while the sidebar is drawn again for the next view.
	await rows.locator( 'a' ).click();
	await expect( page ).toHaveURL( new RegExp( `riff_album=${ album }` ) );
	await expect( library.locator( '.riff-app-item[aria-current="page"]' ) ).toHaveCount( 1 );
	await expect( rows ).toHaveCount( 1 );
	await library.locator( '.riff-app-library-chip', { hasText: 'Albums' } ).click();
	await expect( rows ).toHaveCount( 3 );
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations ).toEqual( [] );

	// Folded to a rail, the rows are their artwork, and still have their names.
	await page.locator( '.riff-app-collapse' ).click();
	await expect( library.locator( '.riff-app-library-head' ) ).toBeHidden();
	await expect( rows.first().locator( 'a' ) ).toHaveAccessibleName( /Liked songs/ );
	await page.locator( '.riff-app-collapse' ).click();
} );
