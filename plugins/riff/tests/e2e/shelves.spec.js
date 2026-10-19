/**
 * The rows of cards on Home, in Your Library and on an artist's page stay tidy: the same width,
 * square covers of one height, nothing overlapping. A long title and covers of different sizes,
 * the mix a real library has, are what used to break them.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );
const { expectTidyCards } = require( './tidy' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures', 'compositions' );
const WIDTHS = [ 1440, 790, 390 ];
const LONG = 'Vedi! Le fosche notturne spoglie, from Il Trovatore, Act Two, as arranged for the band';

let listenUrl;
let artist;
const made = own();

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await made.media( requestUtils, path.join( FIXTURES, 'cover.png' ) );
	const tracks = [];
	for ( const file of [ '02 - Underground [underground].mp3', '03 - Trombone Detritus [detritus].mp3' ] ) {
		tracks.push( await made.media( requestUtils, path.join( FIXTURES, file ) ) );
	}
	// One track with a long title and no cover of its own, so its post's drawn cover stands in.
	await requestUtils.rest( { method: 'POST', path: `/wp/v2/media/${ tracks[ 0 ].id }`, data: { title: LONG } } );
	await requestUtils.rest( { method: 'POST', path: `/wp/v2/media/${ tracks[ 1 ].id }`, data: { featured_media: cover.id } } );
	const block = ( m ) => `<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	await made.post( requestUtils, { title: LONG, status: 'publish', content: block( tracks[ 0 ] ) } );
	await made.post( requestUtils, { title: 'Short', status: 'publish', content: block( tracks[ 1 ] ), featured_media: cover.id } );
	const page = await made.page( requestUtils, {
		title: 'Shelves e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	listenUrl = page.link;
	artist = ( await requestUtils.rest( { path: '/riff/v1/artists', params: { search: 'Airmen' } } ) ).items[ 0 ].id;
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.rest( { method: 'DELETE', path: '/riff/v1/users/me/history' } ).catch( () => {} );
	await made.cleanUp( requestUtils );
} );

const withArg = ( url, arg ) => url + ( url.includes( '?' ) ? '&' : '?' ) + arg;

// Plays both tracks from the posts, so Jump back in and Recently played each hold two.
async function playBoth( page ) {
	await page.goto( withArg( listenUrl, 'riff_view=posts' ) );
	for ( const title of [ 'Short', LONG ] ) {
		await page.locator( '.riff-card', { hasText: title } ).first().locator( '.riff-card-play' ).click();
		await expect.poll( () => page.evaluate( () => window.riff.current()?.post?.title || '' ) ).toBe( title );
	}
}

async function everyView( page, who ) {
	for ( const width of WIDTHS ) {
		await page.setViewportSize( { width, height: 900 } );
		for ( const [ view, arg ] of [ [ 'Home', '' ], [ 'Your Library', 'riff_view=library' ], [ 'an artist', `riff_artist=${ artist }` ] ] ) {
			for ( const app of [ listenUrl, listenUrl.replace( /\/?$/, '/' ) + 'app/' ] ) {
				await page.goto( arg ? withArg( app, arg ) : app );
				await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
				await expectTidyCards( page, '.riff-app-view', `${ who }, ${ view }${ app.endsWith( '/app/' ) ? ' standalone' : '' }, ${ width }px` );
			}
		}
	}
}

test( 'signed in, every row of cards is tidy at every width', async ( { page } ) => {
	await playBoth( page );
	await everyView( page, 'signed in' );
} );

test( 'as a visitor, every row of cards is tidy at every width', async ( { browser, baseURL } ) => {
	const context = await browser.newContext( { baseURL, storageState: { cookies: [], origins: [] } } );
	const page = await context.newPage();
	await playBoth( page );
	await everyView( page, 'a visitor' );
	await context.close();
} );
