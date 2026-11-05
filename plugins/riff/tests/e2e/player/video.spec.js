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

/**
 * Switches the playing song to its video in Now Playing, as a listener does, and waits for it.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function watchesItsVideo( page ) {
	await openView( page, 'album' );
	await page.locator( '[data-riff-mode="video"]' ).click();
	// The pointer leaves the switch, where it would hold the controls.
	await page.mouse.move( 5, 5 );
	await seesTheVideo( page );
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
		await watchesItsVideo( page );
		// The bar may have faded with the video playing untouched; a move brings it back.
		await page.mouse.move( 5, 5 );
		await page.locator( '[data-riff-action="next"]:visible' ).first().click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( withVideoToo );
		await expect( page.locator( '.riff-modes' ) ).toBeVisible();
		await hearsTheSong( page );
	} );

	test( 'its video leaves the song\'s format and rate out of the badges', async ( { page } ) => {
		const quality = page.locator( '#riff .riff-quality' );
		await page.goto( postUrl );
		await page.locator( '.riff-row', { hasText: withVideo } ).click();
		await hearsTheSong( page );
		await expect( quality.first() ).toBeAttached();
		await watchesItsVideo( page );
		// The song's format and rate describe its file, not the picture.
		await expect( quality ).toHaveCount( 0 );
		await page.mouse.move( 5, 5 );
		await page.locator( '[data-riff-mode="song"]' ).click();
		await hearsTheSong( page );
		await expect( quality.first() ).toBeAttached();
	} );

	test( 'the switch and the bar fade while its video plays untouched, and come back at once', async ( { page } ) => {
		const root = page.locator( '#riff' );
		await page.goto( postUrl );
		await page.locator( '.riff-row', { hasText: withVideo } ).click();
		await watchesItsVideo( page );
		await expect( root ).toHaveAttribute( 'data-riff-idle', '', { timeout: 6000 } );
		await expect
			.poll( () => page.locator( '.riff-modes' ).evaluate( ( el ) => getComputedStyle( el ).opacity ) )
			.toBe( '0' );
		// Any move brings them back, at once.
		await page.mouse.move( 40, 40 );
		await expect( root ).not.toHaveAttribute( 'data-riff-idle', '', { timeout: 100 } );
		await expect( root ).toHaveAttribute( 'data-riff-idle', '', { timeout: 6000 } );
		await page.keyboard.press( 'Shift' );
		await expect( root ).not.toHaveAttribute( 'data-riff-idle', '', { timeout: 100 } );
		// Never while paused.
		await page.evaluate( () => document.querySelector( '.riff-video' ).pause() );
		await page.waitForTimeout( 4000 );
		await expect( root ).not.toHaveAttribute( 'data-riff-idle', '' );
	} );

	test( 'the switch and the bar stay while focus or the pointer is in them', async ( { page }, testInfo ) => {
		// On a phone Now Playing covers the bar, and the switch is the one to keep.
		const kept = testInfo.project.name === 'mobile-chromium' ? '.riff-modes' : '.riff-bar';
		const root = page.locator( '#riff' );
		await page.goto( postUrl );
		await page.locator( '.riff-row', { hasText: withVideo } ).click();
		await watchesItsVideo( page );
		// Keyboard focus holds them; a key first, so the focus is the keyboard's.
		await page.keyboard.press( 'Shift' );
		await page.locator( `${ kept } button:visible` ).first().focus();
		await page.waitForTimeout( 4000 );
		await expect( root ).not.toHaveAttribute( 'data-riff-idle', '' );
		// The test pattern is twelve seconds long: back to its start, so it is still playing.
		const rewind = () => page.evaluate( () => ( document.querySelector( '.riff-video' ).currentTime = 0 ) );
		await rewind();
		await page.evaluate( () => document.activeElement.blur() );
		await expect( root ).toHaveAttribute( 'data-riff-idle', '', { timeout: 6000 } );
		await rewind();
		// The pointer moved onto it: faded, it takes no events, so Playwright's hover() would wait.
		const box = await page.locator( kept ).boundingBox();
		await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 );
		// and moved again once it is back, so the browser sees it over it.
		await page.mouse.move( box.x + box.width / 2 + 2, box.y + box.height / 2, { steps: 3 } );
		await page.waitForTimeout( 4000 );
		await expect( root ).not.toHaveAttribute( 'data-riff-idle', '' );
		expect( ( await audioState( page ) ).videoPaused ).toBe( false );
	} );

	test( 'with less motion asked for, the switch and the bar go without a fade', async ( { page } ) => {
		await page.emulateMedia( { reducedMotion: 'reduce' } );
		await page.goto( postUrl );
		await page.locator( '.riff-row', { hasText: withVideo } ).click();
		await watchesItsVideo( page );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-idle', '', { timeout: 6000 } );
		expect(
			await page.locator( '.riff-modes' ).evaluate( ( el ) => getComputedStyle( el ).opacity )
		).toBe( '0' );
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
