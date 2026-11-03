/**
 * A song with a video version, pressed in a list: where it opens as the video, Now Playing opens on
 * the picture and it plays, in a post and in the Listen app; where it opens as the song, and for a
 * song with no video, the list stays and the music plays, as before. The media are a tone and a
 * test pattern made for the suite (packages/fixtures/test).
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js), and the
 * post's case in WebKit.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { audioState } = require( '../helpers/site' );

const TEST = path.join( __dirname, '..', '..', '..', '..', '..', 'packages', 'fixtures', 'test' );

const made = own();
let postUrl;
let pageUrl;
let albumUrl;
// Each project's titles are its own, as the projects share the tests site and its albums.
let withVideo;
let songOnly;

test.beforeAll( async ( { requestUtils }, testInfo ) => {
	const stamp = `${ testInfo.project.name } ${ Date.now() }`;
	withVideo = `Tone with a picture ${ stamp }`;
	songOnly = `Tone alone ${ stamp }`;
	const video = await made.media( requestUtils, path.join( TEST, 'pattern.webm' ) );
	const songs = [];
	for ( const title of [ withVideo, songOnly ] ) {
		const song = await made.media( requestUtils, path.join( TEST, 'tone.mp3' ) );
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ song.id }`,
			data: { title },
		} );
		songs.push( song );
	}
	// The Media Library's Video version field, as Riff keeps it.
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ songs[ 0 ].id }`,
		data: { meta: { _riff_video: video.id } },
	} );
	const post = await made.post( requestUtils, {
		title: `Riff e2e video ${ stamp }`,
		status: 'publish',
		content: songs
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ),
	} );
	postUrl = post.link;
	const listen = await made.page( requestUtils, {
		title: 'Listen e2e video',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	pageUrl = listen.link;
	// The album the tone's tags name, opened by its address, wherever it falls in the Albums grid.
	const albums = await requestUtils.rest( {
		path: '/wp/v2/riff_albums',
		params: { search: 'Test Pattern', per_page: 100 },
	} );
	const album = albums.find( ( term ) => term.name === 'Test Pattern' );
	const url = new URL( pageUrl );
	url.searchParams.set( 'riff_album', String( album.id ) );
	albumUrl = url.href;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

/**
 * Whether the picture is showing in Now Playing and playing on from where it was.
 *
 * @param {import('@playwright/test').Page} page   Page.
 * @param {number}                          [from] Where the video was, in seconds.
 */
async function seesTheVideo( page, from = 0 ) {
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-mode', 'video' );
	await expect( page.locator( '.riff-video' ) ).toBeVisible();
	await expect.poll( async () => ( await audioState( page ) ).videoTime ).toBeGreaterThan( from + 1 );
	const now = await audioState( page );
	expect( now.videoPaused ).toBe( false );
	expect( now.paused ).toBe( true );
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-playing', 'true' );
}

/**
 * Whether the song is playing, through the audio element, as the song.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function hearsTheSong( page ) {
	await expect.poll( async () => ( await audioState( page ) ).time ).toBeGreaterThan( 1 );
	const now = await audioState( page );
	expect( now.paused ).toBe( false );
	expect( now.videoPaused ).toBe( true );
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-mode', 'song' );
}

test.describe( 'A song with a video version', () => {
	test.describe( 'opening as the video', () => {
		test.beforeEach( async ( { context, baseURL } ) => {
			// As on any site but the tests site, where the song comes first (tests/components).
			await context.addCookies( [ { name: 'riff_test_video_first', value: '1', url: baseURL } ] );
		} );

		test( 'pressed in a post, opens Now Playing on the video and plays it @smoke', async ( { page } ) => {
			await page.goto( postUrl );
			await page.locator( '.riff-row', { hasText: withVideo } ).click();
			await seesTheVideo( page );
			// Closed and pressed again while paused, it opens again as it plays on.
			await page.keyboard.press( 'Escape' );
			await expect( page.locator( '.riff-np' ) ).toBeHidden();
			await page.locator( '.riff-row', { hasText: withVideo } ).click();
			await expect.poll( async () => ( await audioState( page ) ).videoPaused ).toBe( true );
			await expect( page.locator( '.riff-np' ) ).toBeHidden();
			const paused = ( await audioState( page ) ).videoTime;
			await page.locator( '.riff-row', { hasText: withVideo } ).click();
			await seesTheVideo( page, paused );
		} );

		test( 'pressed in the Listen app\'s album, opens Now Playing on the video and plays it', async ( { page } ) => {
			await page.goto( albumUrl );
			await expect( page.locator( '.riff-album-title' ) ).toHaveText( 'Test Pattern' );
			await page.locator( '.riff-album-tracks .riff-row', { hasText: withVideo } ).click();
			await seesTheVideo( page );
		} );

		test( 'a song with no video plays with the list where it was', async ( { page } ) => {
			await page.goto( postUrl );
			await page.locator( '.riff-row', { hasText: songOnly } ).click();
			await hearsTheSong( page );
			await expect( page.locator( '.riff-np' ) ).toBeHidden();
		} );
	} );

	test( 'opening as the song, as the tests site has it, plays with the list where it was', async ( {
		page,
	} ) => {
		await page.goto( postUrl );
		await page.locator( '.riff-row', { hasText: withVideo } ).click();
		await hearsTheSong( page );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
	} );
} );
