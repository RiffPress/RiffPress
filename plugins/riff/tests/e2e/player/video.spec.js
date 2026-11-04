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
			await page.locator( '.riff-row', { hasText: withVideo } ).click();
			await seesTheVideo( page );
		} );

		test( 'pressed in the Listen app\'s album, opens Now Playing on the video and plays it', async ( { page } ) => {
			await page.goto( pageUrl );
			await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
			await page
				.locator( '.riff-card[data-riff-album]', { hasText: 'Test Pattern' } )
				.first()
				.locator( '.riff-card-link' )
				.click();
			await expect( page ).toHaveURL( /riff_album=\d+/ );
			await page.locator( '.riff-album-tracks .riff-row', { hasText: withVideo } ).click();
			await seesTheVideo( page );
		} );

		test( 'the album\'s button follows what Now Playing shows: the video, the song, a song with none', async ( { page }, testInfo ) => {
			const button = page.locator( '.riff-bar [data-riff-control="album"]' );
			const quality = page.locator( '#riff .riff-quality' );
			await page.goto( postUrl );
			await page.locator( '.riff-row', { hasText: withVideo } ).click();
			await seesTheVideo( page );
			await expect( button ).toHaveAccessibleName( 'Video' );
			await expect( button.locator( 'svg path' ) ).toHaveAttribute( 'd', /^M20 4H4/ );
			await expect( button ).toHaveAttribute( 'aria-pressed', 'true' );
			// The song's format and rate describe its file, not the picture.
			await expect( quality ).toHaveCount( 0 );
			// The switch may have faded with the video playing untouched; a move brings it back.
			await page.mouse.move( 5, 5 );
			await page.locator( '[data-riff-mode="song"]' ).click();
			await hearsTheSong( page );
			await expect( button ).toHaveAccessibleName( 'Album' );
			await expect( button.locator( 'svg path' ) ).toHaveAttribute( 'd', /^M19 3H5/ );
			await expect( quality.first() ).toBeAttached();
			await page.locator( '[data-riff-mode="video"]' ).click();
			await expect( button ).toHaveAccessibleName( 'Video' );
			// On to the song with no video: the album again, while the switch is still on Video.
			await page.keyboard.press( 'Shift+N' );
			await expect( page.locator( '#riff [data-riff-text="title"]' ).first() ).toHaveText( songOnly );
			await expect( button ).toHaveAccessibleName( 'Album' );
			await expect( button.locator( 'svg path' ) ).toHaveAttribute( 'd', /^M19 3H5/ );
			await expect( quality.first() ).toBeAttached();
			// Pressed, it still closes Now Playing, where the bar is beside it.
			if ( testInfo.project.name !== 'mobile-chromium' ) {
				await button.click();
				await expect( page.locator( '.riff-np' ) ).toBeHidden();
			}
		} );

		test( 'the switch and the bar fade while the video plays untouched, and come back at once', async ( { page } ) => {
			const root = page.locator( '#riff' );
			await page.goto( postUrl );
			await page.locator( '.riff-row', { hasText: withVideo } ).click();
			await seesTheVideo( page );
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
			await seesTheVideo( page );
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
			// and moved again once it is back, so the browser sees it over the bar.
			await page.mouse.move( box.x + box.width / 2 + 2, box.y + box.height / 2, { steps: 3 } );
			await page.waitForTimeout( 4000 );
			await expect( root ).not.toHaveAttribute( 'data-riff-idle', '' );
			expect( ( await audioState( page ) ).videoPaused ).toBe( false );
		} );

		test( 'with less motion asked for, the switch and the bar go without a fade', async ( { page } ) => {
			await page.emulateMedia( { reducedMotion: 'reduce' } );
			await page.goto( postUrl );
			await page.locator( '.riff-row', { hasText: withVideo } ).click();
			await seesTheVideo( page );
			await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-idle', '', { timeout: 6000 } );
			expect(
				await page.locator( '.riff-modes' ).evaluate( ( el ) => getComputedStyle( el ).opacity )
			).toBe( '0' );
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
