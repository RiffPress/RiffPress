/**
 * Every view of the Listen block stays tidy: nothing laid over its neighbour, cards of one size
 * with square covers, nothing wider than the window and no text cut off. Each view is checked at a
 * desktop, a middle and a phone width, signed in and as a visitor, with nothing liked or played and
 * with both. The components page shows every shared piece in every state, and each check is shown
 * to fail on a layout broken on purpose.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( './own' );
const { expectTidy } = require( './tidy' );

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
const WIDTHS = [ 1440, 790, 390 ];
const LONG =
	'Vedi! Le fosche notturne spoglie, from Il Trovatore, Act Two, as arranged for the band';

let listenUrl;
let postId;
let album;
let artist;
let tracks;
let playlistId = 0;
const made = own();

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await made.media(
		requestUtils,
		path.join( FIXTURES, 'cover.png' )
	);
	tracks = [];
	for ( const file of [
		'02 - Underground [underground].mp3',
		'03 - Trombone Detritus [detritus].mp3',
	] ) {
		tracks.push(
			await made.media( requestUtils, path.join( FIXTURES, file ) )
		);
	}
	// One track with a long title and no cover of its own, so its post's drawn cover stands in.
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ tracks[ 0 ].id }`,
		data: { title: LONG },
	} );
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ tracks[ 1 ].id }`,
		data: { featured_media: cover.id },
	} );
	const block = ( m ) =>
		`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	postId = (
		await made.post( requestUtils, {
			title: LONG,
			status: 'publish',
			content: block( tracks[ 0 ] ) + block( tracks[ 1 ] ),
		} )
	).id;
	await made.post( requestUtils, {
		title: 'Short',
		status: 'publish',
		content: block( tracks[ 1 ] ),
		featured_media: cover.id,
	} );
	listenUrl = (
		await made.page( requestUtils, {
			title: 'Tidy e2e',
			status: 'publish',
			content: '<!-- wp:riff/app {"align":"full"} /-->',
		} )
	).link;
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

async function forget( requestUtils ) {
	const { items } = await requestUtils.rest( {
		path: '/riff/v1/users/me/likes',
	} );
	for ( const l of items ) {
		await requestUtils.rest( {
			method: 'DELETE',
			path: `/riff/v1/users/me/likes/${ l.kind }/${ l.id }`,
		} );
	}
	await requestUtils.rest( {
		method: 'DELETE',
		path: '/riff/v1/users/me/history',
	} );
	for ( const p of (
		await requestUtils.rest( { path: '/riff/v1/users/me/playlists' } )
	).items ) {
		await requestUtils.rest( {
			method: 'DELETE',
			path: `/riff/v1/users/me/playlists/${ p.id }`,
		} );
	}
	playlistId = 0;
}

test.afterAll( async ( { requestUtils } ) => {
	await forget( requestUtils );
	await made.cleanUp( requestUtils );
} );

const withArg = ( url, arg ) => url + ( url.includes( '?' ) ? '&' : '?' ) + arg;
const standalone = () => listenUrl.replace( /\/?$/, '/' ) + 'app/';

// Every view, by its address on the Listen page.
const views = () => [
	[ 'Home', '' ],
	[ 'Posts', 'riff_view=posts' ],
	[ 'Albums', 'riff_view=albums' ],
	[ 'Artists', 'riff_view=artists' ],
	[ 'Tracks', 'riff_view=tracks' ],
	[ 'an album', `riff_album=${ album }` ],
	[ 'an artist', `riff_artist=${ artist }` ],
	[ 'a post', `riff=${ postId }` ],
	[ 'search', 'riff_search=Compositions' ],
	[ 'search with no results', 'riff_search=zzzzqqq' ],
	[ 'Your Library', 'riff_view=library' ],
	[ 'Liked songs', 'riff_view=library&riff_filter=songs' ],
	[ 'liked albums', 'riff_view=library&riff_filter=albums' ],
	[ 'liked artists', 'riff_view=library&riff_filter=artists' ],
	[ 'playlists', 'riff_view=library&riff_filter=playlists' ],
	...( playlistId
		? [ [ 'a playlist', `riff_playlist=${ playlistId }` ] ]
		: [] ),
];

// Likes and plays, so the full views have something in every row.
async function fill( page ) {
	await page.goto( withArg( listenUrl, `riff=${ postId }` ) );
	// Until the player starts, window.riff is the #riff element, by its id.
	await page.waitForFunction( () => typeof window.riffInternal?.like === 'function' );
	await page.evaluate(
		( ids ) => {
			window.riffInternal.like( ids.track );
			window.riffInternal.like( ids.album, 'album' );
			window.riffInternal.like( ids.artist, 'artist' );
		},
		{ track: tracks[ 0 ].id, album, artist }
	);
	// Signed in, a playlist too, with a long name; a visitor cannot make one.
	playlistId = await page.evaluate(
		( ids ) =>
			window.riffInternal.playlists && window.riffInternal.createPlaylist
				? window.riffInternal.createPlaylist( ids.name, ids.tracks ).then(
						( p ) => p.id,
						() => 0
					)
				: 0,
		{ name: LONG, tracks: [ tracks[ 0 ].id, tracks[ 1 ].id ] }
	);
	for ( const n of [ 1, 0 ] ) {
		await page.locator( '.riff-row' ).nth( n ).click();
		await expect
			.poll( () => page.evaluate( () => window.riffInternal.history().length ) )
			.toBeGreaterThan( n === 1 ? 0 : 1 );
	}
	// An account's likes are sent as they are made: they are kept once a fresh page has all three.
	await expect
		.poll( async () => {
			await page.reload();
			return page.evaluate( () => window.riffInternal.likes().length );
		} )
		.toBe( 3 );
}

async function sweep( page, who ) {
	for ( const width of WIDTHS ) {
		await page.setViewportSize( { width, height: 900 } );
		for ( const [ name, arg ] of views() ) {
			await page.goto( arg ? withArg( listenUrl, arg ) : listenUrl );
			await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount(
				1
			);
			await expect(
				page.locator( '.riff-app-view h2' ).first()
			).toBeVisible();
			await expectTidy(
				page,
				'.riff-app-view',
				`${ who }, ${ name }, ${ width }px`
			);
		}
		for ( const [ name, arg ] of [
			[ 'Home', '' ],
			[ 'Your Library', 'riff_view=library' ],
		] ) {
			await page.goto(
				arg ? withArg( standalone(), arg ) : standalone()
			);
			await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount(
				1
			);
			await expectTidy(
				page,
				'.riff-app',
				`${ who }, ${ name } standalone, ${ width }px`
			);
		}
	}
}

test.describe( 'Every view is tidy', () => {
	test.describe.configure( { timeout: 600000 } );

	test( 'signed in, with nothing liked or played', async ( {
		page,
		requestUtils,
	} ) => {
		await forget( requestUtils );
		await sweep( page, 'signed in, empty' );
	} );

	test( 'signed in, with likes and plays', async ( {
		page,
		requestUtils,
	} ) => {
		await forget( requestUtils );
		await fill( page );
		await sweep( page, 'signed in, full' );
	} );

	test( 'as a visitor, with nothing liked or played', async ( {
		browser,
		baseURL,
	} ) => {
		const context = await browser.newContext( {
			baseURL,
			storageState: { cookies: [], origins: [] },
		} );
		await sweep( await context.newPage(), 'a visitor, empty' );
		await context.close();
	} );

	test( 'as a visitor, with likes and plays', async ( {
		browser,
		baseURL,
	} ) => {
		const context = await browser.newContext( {
			baseURL,
			storageState: { cookies: [], origins: [] },
		} );
		const page = await context.newPage();
		await fill( page );
		await sweep( page, 'a visitor, full' );
		await context.close();
	} );
} );

test.describe( 'The components page', () => {
	test( 'shows every component, tidy and accessible, at every width', async ( {
		page,
	} ) => {
		for ( const width of WIDTHS ) {
			await page.setViewportSize( { width, height: 900 } );
			await page.goto( '/?riff-components=1' );
			for ( const part of [
				'card',
				'shelf',
				'header',
				'title',
				'artists',
				'actions',
				'heart',
				'chips',
				'empty',
				'rows',
			] ) {
				await expect(
					page.locator( `#component-${ part }` ),
					part
				).toBeVisible();
			}
			await expect(
				page.locator( '#component-rows .riff-row' ).first()
			).toBeVisible();
			await expectTidy(
				page,
				'.riff-app-view',
				`components, ${ width }px`
			);
			expect(
				(
					await new AxeBuilder( { page } )
						.include( '.riff-app' )
						.analyze()
				).violations,
				`${ width }px`
			).toEqual( [] );
		}
		// The menu, opened from a row once one plays: it belongs to the player.
		await page.locator( '#component-rows .riff-row' ).first().click();
		await page
			.locator( '#component-rows .riff-more-button' )
			.first()
			.click();
		await expect( page.locator( '.riff-menu' ) ).toBeVisible();
		expect(
			(
				await new AxeBuilder( { page } )
					.include( '.riff-menu' )
					.analyze()
			).violations,
			'the menu'
		).toEqual( [] );
	} );

	test( 'each check fails on a layout broken on purpose', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( '/?riff-components=1' );
		await expectTidy( page, '.riff-app-view', 'as it is' );
		const broken = [
			[
				'a card wider than the others',
				'#component-shelf .riff-shelf-row > .riff-card:first-child { width: 120px; }',
				/widths/,
			],
			[
				'covers of two heights',
				'#component-card .riff-grid > .riff-card:nth-child(2) .riff-card-art { aspect-ratio: auto; height: 40px; }',
				/cover heights/,
			],
			[
				'covers that are not square',
				'#component-card .riff-card-art { aspect-ratio: 4 / 3; }',
				/square/,
			],
			[
				'a card over its neighbour',
				'#component-shelf .riff-shelf-row > .riff-card:nth-child(2) { margin-left: -120px; }',
				/overlap/,
			],
			[
				'something wider than the window',
				'#component-empty .riff-app-empty { width: 3000px; }',
				/overflow/,
			],
			[
				'a heading cut off at the bottom',
				'#component-title .riff-app-title { height: 6px; overflow: hidden; }',
				/clipped/,
			],
		];
		for ( const [ name, css, check ] of broken ) {
			const style = await page.addStyleTag( { content: css } );
			await expect(
				expectTidy( page, '.riff-app-view', name ),
				name
			).rejects.toThrow( check );
			await style.evaluate( ( el ) => el.remove() );
		}
		// An album whose line says more than its artist, as Compositions' did (#452).
		await page.evaluate( () => {
			document.querySelector(
				'#component-card .riff-card[data-riff-album] .riff-card-sub'
			).textContent = 'The Airmen of Note · 10 tracks';
		} );
		await expect(
			expectTidy( page, '.riff-app-view', 'an album line with a count' ),
			'an album line with a count'
		).rejects.toThrow( /album line/ );
	} );
} );
