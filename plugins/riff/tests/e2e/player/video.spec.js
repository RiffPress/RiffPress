/**
 * A song with a video version, pressed in a list, plays as the song where it is, in a post and in
 * the Listen app; its video is one press away in Now Playing, for that song only. A video on its
 * own, pressed, opens Now Playing on the picture and plays. The media are a tone and a test pattern
 * made for the suite (packages/fixtures/test).
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js), and the
 * post's case in WebKit.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { audioState } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );

const TEST = path.join( __dirname, '..', '..', '..', '..', '..', 'packages', 'fixtures', 'test' );

const made = own();
let postUrl;
let pageUrl;
// Each project's titles are its own, as the projects share the tests site and its albums.
let withVideo;
let withVideoToo;
let songOnly;
let videoOnly;

test.beforeAll( async ( { requestUtils }, testInfo ) => {
	const stamp = `${ testInfo.project.name } ${ Date.now() }`;
	withVideo = `Tone with a picture ${ stamp }`;
	withVideoToo = `Tone with a picture too ${ stamp }`;
	songOnly = `Tone alone ${ stamp }`;
	videoOnly = `Pattern alone ${ stamp }`;
	const video = await made.media( requestUtils, path.join( TEST, 'pattern.webm' ) );
	const alone = await made.media( requestUtils, path.join( TEST, 'pattern.webm' ) );
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ alone.id }`,
		data: { title: videoOnly },
	} );
	const songs = [];
	for ( const title of [ withVideo, withVideoToo, songOnly ] ) {
		const song = await made.media( requestUtils, path.join( TEST, 'tone.mp3' ) );
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ song.id }`,
			data: { title },
		} );
		songs.push( song );
	}
	// The Media Library's Video version field, as Riff keeps it.
	for ( const song of songs.slice( 0, 2 ) ) {
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ song.id }`,
			data: { meta: { _riff_video: video.id } },
		} );
	}
	const post = await made.post( requestUtils, {
		title: `Riff e2e video ${ stamp }`,
		status: 'publish',
		content: songs
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ) +
			`<!-- wp:video {"id":${ alone.id }} --><figure class="wp-block-video"><video controls src="${ alone.source_url }"></video></figure><!-- /wp:video -->`,
	} );
	postUrl = post.link;
	const listen = await made.page( requestUtils, {
		title: 'Listen e2e video',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	pageUrl = listen.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

/**
 * Whether the picture is showing in Now Playing and playing.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function seesTheVideo( page ) {
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-mode', 'video' );
	await expect( page.locator( '.riff-video' ) ).toBeVisible();
	await expect.poll( async () => ( await audioState( page ) ).videoTime ).toBeGreaterThan( 1 );
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
	test( 'pressed in a post, plays as the song with the list where it was @smoke', async ( { page } ) => {
		await page.goto( postUrl );
		await page.locator( '.riff-row', { hasText: withVideo } ).click();
		await hearsTheSong( page );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
	} );

	test( 'pressed in the Listen app\'s album, plays as the song', async ( { page } ) => {
		await page.goto( pageUrl );
		await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
		await page
			.locator( '.riff-card[data-riff-album]', { hasText: 'Test Pattern' } )
			.first()
			.locator( '.riff-card-link' )
			.click();
		await expect( page ).toHaveURL( /riff_album=\d+/ );
		await page.locator( '.riff-album-tracks .riff-row', { hasText: withVideo } ).click();
		await hearsTheSong( page );
	} );

	test( 'switched to its video, the next song starts as the song', async ( { page } ) => {
		await page.goto( postUrl );
		await page.locator( '.riff-row', { hasText: withVideo } ).click();
		await hearsTheSong( page );
		await openView( page, 'album' );
		await page.locator( '[data-riff-mode="video"]' ).click();
		await seesTheVideo( page );
		await page.locator( '[data-riff-action="next"]:visible' ).first().click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( withVideoToo );
		await expect( page.locator( '.riff-modes' ) ).toBeVisible();
		await hearsTheSong( page );
	} );
} );

test.describe( 'A video on its own', () => {
	test( 'pressed in a post, opens Now Playing on the picture and plays it', async ( { page } ) => {
		await page.goto( postUrl );
		await page.locator( '.riff-row', { hasText: videoOnly } ).click();
		await seesTheVideo( page );
		await expect( page.locator( '.riff-modes' ) ).toBeHidden();
	} );
} );
