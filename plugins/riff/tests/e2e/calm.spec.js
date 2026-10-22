/**
 * The Listen app loads calmly: every view draws once in its final layout, and what arrives later
 * (what was played, covers, the font, the sidebar's toggle) fills room that was already there. Each
 * view's layout shift is measured on load in standalone mode, signed in with an account's history,
 * as a visitor with this browser's history, and as a visitor with none, and again on the way
 * between views inside the app.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );
const { watchShifts, layoutShift } = require( './tidy' );

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
// Core Web Vitals calls 0.1 good; the apps this follows sit near nothing.
const CALM = 0.01;

let listenUrl;
let postId;
let album;
let artist;
let tracks;
let played;
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
		const media = await made.media(
			requestUtils,
			path.join( FIXTURES, file )
		);
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { featured_media: cover.id },
		} );
		tracks.push( media );
	}
	const block = ( m ) =>
		`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	postId = (
		await made.post( requestUtils, {
			title: 'Calm e2e',
			status: 'publish',
			content: tracks.map( block ).join( '' ),
			featured_media: cover.id,
		} )
	).id;
	listenUrl = (
		await made.page( requestUtils, {
			title: 'Calm e2e',
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
	// The account's history, played from the post; the same tracks, in the player's own shape, are
	// what a visitor's browser keeps.
	await requestUtils.rest( {
		method: 'DELETE',
		path: '/riff/v1/users/me/history',
	} );
	played = (
		await requestUtils.rest( {
			method: 'POST',
			path: '/riff/v1/users/me/history',
			data: {
				items: tracks.map( ( t, i ) => ( {
					id: t.id,
					played: Date.now() - i * 60000,
					post: postId,
				} ) ),
			},
		} )
	).items;
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.rest( {
		method: 'DELETE',
		path: '/riff/v1/users/me/history',
	} );
	await made.cleanUp( requestUtils );
} );

const standalone = () => listenUrl.replace( /\/?$/, '/' ) + 'app/';
const at = ( arg ) =>
	arg ? `${ standalone() }${ arg.startsWith( '?' ) ? '' : '?' }${ arg }` : standalone();

const views = () => [
	[ 'Home', '' ],
	[ 'Albums', 'riff_view=albums' ],
	[ 'Artists', 'riff_view=artists' ],
	[ 'Tracks', 'riff_view=tracks' ],
	[ 'Posts', 'riff_view=posts' ],
	[ 'Your Library', 'riff_view=library' ],
	[ 'an album', `riff_album=${ album }` ],
	[ 'an artist', `riff_artist=${ artist }` ],
	[ 'a post', `riff=${ postId }` ],
];

// Each view's layout shift on load, listed, then checked together so one run reports them all.
async function sweep( page, who ) {
	await page.setViewportSize( { width: 1440, height: 900 } );
	const found = [];
	for ( const [ name, arg ] of views() ) {
		await page.goto( at( arg ) );
		const { value, shifts } = await layoutShift( page );
		found.push( { name, value, shifts } );
	}
	// eslint-disable-next-line no-console
	console.log(
		`${ who }:\n` +
			found
				.map( ( f ) => `  ${ f.name }: ${ f.value.toFixed( 4 ) }` )
				.join( '\n' )
	);
	for ( const f of found ) {
		expect(
			f.value,
			`${ who }, ${ f.name }: layout shift ${ f.value.toFixed(
				4
			) } (${
				f.shifts
					.map(
						( s ) =>
							`${ s.value.toFixed( 4 ) } at ${
								s.at
							} ms: ${ s.moved.join( ', ' ) }`
					)
					.join( '; ' ) || 'none'
			})`
		).toBeLessThan( CALM );
	}
}

async function visitor( browser, baseURL, history ) {
	const context = await browser.newContext( {
		baseURL,
		storageState: { cookies: [], origins: [] },
	} );
	const page = await context.newPage();
	await watchShifts( page );
	if ( history ) {
		// What the player keeps after playing these, put there before its first page.
		await page.addInitScript( ( list ) => {
			if ( ! localStorage.getItem( 'riff-history' ) ) {
				localStorage.setItem( 'riff-history', JSON.stringify( list ) );
			}
		}, history );
		// The first page tells the server, for every page after it, that there is a history.
		await page.goto( standalone() );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
	}
	return { context, page };
}

test.describe( 'Every view loads without moving', () => {
	// Layout shift entries are Chromium's; playwright.config.js runs this spec there alone.
	test.describe.configure( { timeout: 240000 } );

	test( 'signed in, with an account’s history', async ( { page } ) => {
		await watchShifts( page );
		await sweep( page, 'signed in, with history' );
		// Home drew both rows of what was played on the server, in their final place.
		await page.goto( standalone() );
		const jump = page.locator( '[data-riff-shelf="jump"]' );
		await expect( jump ).toBeVisible();
		await expect(
			jump.locator( '.riff-card-link' ).first()
		).toHaveAttribute( 'href', new RegExp( `[?&]riff=${ postId }$` ) );
		await expect(
			page
				.locator( '[data-riff-shelf="recent"] .riff-card-title' )
				.first()
		).toHaveText( played[ 0 ].title );
	} );

	test( 'as a visitor, with this browser’s history', async ( {
		browser,
		baseURL,
	} ) => {
		const { context, page } = await visitor( browser, baseURL, played );
		await sweep( page, 'a visitor, with history' );
		// The rows the server held room for are filled, in the same place.
		await page.goto( standalone() );
		await expect(
			page
				.locator( '[data-riff-shelf="recent"] .riff-card-title' )
				.first()
		).toHaveText( played[ 0 ].title );
		await expect(
			page.locator( '[data-riff-shelf="jump"] .riff-card-link' ).first()
		).toHaveAttribute( 'href', new RegExp( `[?&]riff=${ postId }$` ) );
		await context.close();
	} );

	test( 'as a visitor, with no history', async ( { browser, baseURL } ) => {
		const { context, page } = await visitor( browser, baseURL, null );
		await sweep( page, 'a visitor, no history' );
		// Nothing held, and nothing shown.
		await page.goto( standalone() );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		await expect(
			page.locator( '[data-riff-shelf="recent"]' )
		).toBeHidden();
		await expect( page.locator( '[data-riff-skeleton]' ) ).toHaveCount( 0 );
		await context.close();
	} );

	test( 'moving between views holds or cross-fades, and never jumps', async ( {
		page,
	} ) => {
		await watchShifts( page );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( standalone() );
		await layoutShift( page );
		for ( const tab of [
			'riff_view=albums',
			'riff_view=artists',
			'riff_view=tracks',
			'riff_view=library',
			'',
		] ) {
			// Your Library is reached from its own heading in the sidebar, where its tab is hidden.
			const link = page.locator(
				{
					'riff_view=library': '.riff-app-library-title',
					'': '.riff-app-bar a.riff-app-home',
				}[ tab ] || `.riff-app-bar a.riff-app-tab[href*="${ tab }"]`
			);
			const from = await page.evaluate( () =>
				Math.round( performance.now() )
			);
			await link.click();
			await expect( page ).toHaveURL( tab ? new RegExp( tab ) : /\/app\/$/ );
			const { value, shifts } = await layoutShift( page, from );
			expect(
				value,
				`to ${ tab || 'Home' }: ${ shifts
					.map(
						( s ) =>
							`${ s.value.toFixed( 4 ) } at ${
								s.at
							} ms: ${ s.moved.join( ', ' ) }`
					)
					.join( '; ' ) }`
			).toBeLessThan( CALM );
		}
	} );
} );
