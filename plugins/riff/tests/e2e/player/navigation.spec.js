/**
 * Links that keep the music playing, once the site turns it on under Settings › Riff: the next
 * page comes in through the Interactivity API's router and the one `<audio>` never stops. With it,
 * what the router meets on the way: Riff Lyrics on a page reached by a link, Now Playing open as
 * the router navigates, a Query Loop's own pagination inside the template, and the image lightbox.
 * Desktop Chromium; the tests tagged `@smoke` also run in WebKit. Safari on a real phone is
 * docs/iphone-checklist.md's.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES, TEST, FILES, playing } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );

const made = own();
const site = {};

const setting = ( requestUtils, on ) =>
	requestUtils.rest( {
		method: 'POST',
		path: '/wp/v2/settings',
		data: { riff_client_navigation: on },
	} );

const audio = ( m ) =>
	`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
const paragraph = ( html ) => `<!-- wp:paragraph --><p>${ html }</p><!-- /wp:paragraph -->`;

test.beforeAll( async ( { requestUtils } ) => {
	const stamp = Date.now();
	const tracks = [];
	for ( const file of FILES.slice( 0, 2 ) ) {
		tracks.push( await made.media( requestUtils, path.join( FIXTURES, file ) ) );
	}
	const synced = await made.media( requestUtils, path.join( TEST, 'lyrics-synced.mp3' ) );
	const cover = await made.media( requestUtils, path.join( FIXTURES, 'cover.png' ) );

	const sung = await made.post( requestUtils, {
		title: `Riff navigation sung ${ stamp }`,
		status: 'publish',
		content: audio( synced ),
	} );
	const pictured = await made.post( requestUtils, {
		title: `Riff navigation pictured ${ stamp }`,
		status: 'publish',
		content: `<!-- wp:image {"id":${ cover.id },"lightbox":{"enabled":true}} --><figure class="wp-block-image"><img src="${ cover.source_url }" alt="The cover" class="wp-image-${ cover.id }"/></figure><!-- /wp:image -->`,
	} );
	// Three posts a Query Loop pages through, one at a time, by a word only they have.
	const word = `riffpaged${ stamp }`;
	for ( const n of [ 1, 2, 3 ] ) {
		await made.post( requestUtils, {
			title: `${ word } ${ n }`,
			status: 'publish',
			content: paragraph( 'Paged.' ),
			date: new Date( stamp - n * 60000 ).toISOString(),
		} );
	}
	const paged = await made.page( requestUtils, {
		title: `Riff navigation paged ${ stamp }`,
		status: 'publish',
		content:
			audio( tracks[ 1 ] ) +
			`<!-- wp:query {"queryId":7,"query":{"perPage":1,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","search":"${ word }","inherit":false},"enhancedPagination":true} --><div class="wp-block-query"><!-- wp:post-template --><!-- wp:post-title /--><!-- /wp:post-template --><!-- wp:query-pagination --><!-- wp:query-pagination-next /--><!-- /wp:query-pagination --></div><!-- /wp:query -->`,
	} );
	const start = await made.post( requestUtils, {
		title: `Riff navigation start ${ stamp }`,
		status: 'publish',
		content:
			audio( tracks[ 0 ] ) +
			paragraph( `<a href="${ sung.link }">To the words</a>` ) +
			paragraph( `<a href="${ pictured.link }">To the picture</a>` ) +
			paragraph( `<a href="${ paged.link }">To the pages</a>` ),
	} );
	// A Listen page, for the album's page in About to be in.
	await made.page( requestUtils, {
		title: `Riff navigation listen ${ stamp }`,
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	Object.assign( site, { sungId: sung.id, start: start.link, sung: sung.link, pictured: pictured.link, paged: paged.link, word } );
	await setting( requestUtils, true );
} );

test.afterAll( async ( { requestUtils } ) => {
	await setting( requestUtils, false );
	await made.cleanUp( requestUtils );
} );

/**
 * Plays the start page's track and marks the document, so a test can tell the page never loaded
 * again, and counts every time the `<audio>` stops or starts over.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function playOnStart( page ) {
	await page.goto( site.start );
	await expect( page.locator( '.wp-site-blocks' ) ).toHaveAttribute( 'data-wp-router-region', 'riff/page' );
	await page.locator( '.riff-row' ).first().click();
	await expect.poll( async () => ( await playing( page ) ).time ).toBeGreaterThan( 0.3 );
	await page.evaluate( () => {
		window.riffStayed = true;
		window.riffStops = 0;
		const a = document.querySelector( '.riff-audio' );
		for ( const type of [ 'pause', 'emptied', 'abort' ] ) {
			a.addEventListener( type, () => window.riffStops++ );
		}
	} );
}

/**
 * That the page was never loaded again and the music never stopped.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function stillPlaying( page ) {
	expect( await page.evaluate( () => window.riffStayed ) ).toBe( true );
	const before = ( await playing( page ) ).time;
	await expect.poll( async () => ( await playing( page ) ).time ).toBeGreaterThan( before );
	expect( await page.evaluate( () => window.riffStops ) ).toBe( 0 );
	expect( ( await playing( page ) ).paused ).toBe( false );
}

test.describe( 'Links that keep the music playing', () => {
	test( 'a link brings the next page in, and what plays carries on', { tag: '@smoke' }, async ( { page } ) => {
		await playOnStart( page );
		await page.getByRole( 'link', { name: 'To the words' } ).click();
		await expect( page ).toHaveURL( site.sung );
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 1 );
		await stillPlaying( page );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Intensities in Ten Cities' );

		// What lies outside the template follows the page: the body's classes, the canonical link
		// and the admin bar's Edit link, signed in as the suite is.
		await expect( page.locator( 'body' ) ).toHaveClass( new RegExp( `\\bpostid-${ site.sungId }\\b` ) );
		await expect( page.locator( 'link[rel="canonical"]' ) ).toHaveAttribute( 'href', site.sung );
		await expect( page.locator( '#wp-admin-bar-edit > a' ) ).toHaveAttribute( 'href', new RegExp( `post=${ site.sungId }\\b` ) );

		await page.goBack();
		await expect( page ).toHaveURL( site.start );
		await expect( page.getByRole( 'link', { name: 'To the words' } ) ).toBeVisible();
		await stillPlaying( page );
	} );

	test( 'Riff Lyrics on a page reached by a link shows the words and follows the song', async ( { page } ) => {
		await playOnStart( page );
		await page.getByRole( 'link', { name: 'To the words' } ).click();
		await expect( page ).toHaveURL( site.sung );
		await page.locator( '.riff-row' ).first().click();
		const panel = await openView( page, 'lyrics' );
		const lines = panel.locator( '.riff-lyrics-synced li' );
		await expect( lines ).toHaveText( [ 'First line', 'Second line', 'Third line' ] );
		// The line being sung moves on as the song does.
		await page.evaluate( () => window.riff.seek( 1.6 ) );
		await expect( lines.nth( 1 ) ).toHaveAttribute( 'aria-current', 'true' );
		await page.evaluate( () => window.riff.seek( 2.6 ) );
		await expect( lines.nth( 2 ) ).toHaveAttribute( 'aria-current', 'true' );
		expect( await page.evaluate( () => window.riffStayed ) ).toBe( true );
	} );

	test( 'Now Playing open as the router navigates: back closes it, and a link in a view is followed', async ( {
		page,
	} ) => {
		await playOnStart( page );
		await page.getByRole( 'link', { name: 'To the words' } ).click();
		await expect( page ).toHaveURL( site.sung );

		// Back from Now Playing closes it, on the page it was opened over.
		await openView( page, 'album' );
		await page.goBack();
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		await expect( page ).toHaveURL( site.sung );
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 1 );
		await stillPlaying( page );

		// Back again leaves for the page before, as the router brings it in.
		await page.goBack();
		await expect( page ).toHaveURL( site.start );
		await expect( page.getByRole( 'link', { name: 'To the pages' } ) ).toBeVisible();
		await stillPlaying( page );

		// A link in a view's text, the album's in About, with Now Playing open: Now Playing closes
		// and the link is followed. The album's page is the Listen app's, which the router loads
		// outright, so the music picks up there as after any page load.
		await openView( page, 'album' );
		const about = await openView( page, 'about' );
		const album = about.getByRole( 'link', { name: 'Compositions' } );
		await expect( album ).toBeVisible();
		const to = await album.getAttribute( 'href' );
		await album.click();
		await expect( page ).toHaveURL( to );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Intensities in Ten Cities' );
		await expect.poll( async () => ( await playing( page ) ).paused ).toBe( false );
	} );

	test( 'a Query Loop pages through its posts in place, inside the template', async ( { page } ) => {
		await playOnStart( page );
		await page.getByRole( 'link', { name: 'To the pages' } ).click();
		await expect( page ).toHaveURL( site.paged );
		const titles = page.locator( '.wp-block-query .wp-block-post-title' );
		await expect( titles ).toHaveText( [ `${ site.word } 1` ] );
		await page.locator( '.wp-block-query-pagination-next' ).click();
		await expect( titles ).toHaveText( [ `${ site.word } 2` ] );
		await expect( page ).toHaveURL( /query-7-page=2/ );
		await stillPlaying( page );
		await page.locator( '.wp-block-query-pagination-next' ).click();
		await expect( titles ).toHaveText( [ `${ site.word } 3` ] );
		await stillPlaying( page );
	} );

	test( 'the image lightbox opens on a page reached by a link', async ( { page } ) => {
		await playOnStart( page );
		await page.getByRole( 'link', { name: 'To the picture' } ).click();
		await expect( page ).toHaveURL( site.pictured );
		await page.locator( '.wp-block-image' ).hover();
		await page.locator( '.wp-block-image .lightbox-trigger' ).click();
		const overlay = page.locator( '.wp-lightbox-overlay' );
		await expect( overlay ).toHaveClass( /active/ );
		await overlay.getByRole( 'button', { name: 'Close' } ).click();
		await expect( overlay ).not.toHaveClass( /active/ );
		await stillPlaying( page );
	} );
} );
