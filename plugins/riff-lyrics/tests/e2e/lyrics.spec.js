/**
 * Riff Lyrics, end to end: a file whose tags carry lyrics, played in a post, and its Lyrics tab in
 * Now Playing. Runs in desktop Chromium and at an iPhone's size (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../../../riff/tests/e2e/helpers/own' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures' );
const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	const sung = await made.media( requestUtils, path.join( FIXTURES, 'test', 'lyrics.mp3' ) );
	const plain = await made.media(
		requestUtils,
		path.join( FIXTURES, 'compositions', '02 - Underground [underground].mp3' )
	);
	// The same words with a time on each line, as the LRC format has them.
	const synced = await made.media( requestUtils, path.join( FIXTURES, 'test', 'lyrics-synced.mp3' ) );
	const block = ( m ) =>
		`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	const post = await made.post( requestUtils, {
		title: `Riff Lyrics e2e ${ Date.now() }`,
		status: 'publish',
		content: block( sung ) + block( plain ) + block( synced ),
	} );
	postUrl = post.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test( 'the Lyrics tab shows the words from the file, and says so when a track has none', async ( {
	page,
	isMobile,
} ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
	if ( isMobile ) {
		await page.locator( '.riff-peek' ).click();
	}
	const tab = page.locator( '.riff-tab[data-riff-tab="lyrics"]' );
	// Signed in, the media route is asked as the account, so a private post's track has its lyrics.
	const asked = page.waitForRequest( ( r ) => decodeURIComponent( r.url() ).includes( 'wp/v2/media/' ) );
	await tab.click();
	await expect( tab ).toHaveAttribute( 'aria-selected', 'true' );
	const panel = page.locator( '[data-riff-panel="lyrics"]' );
	await expect( panel.locator( '.riff-lyrics' ) ).toHaveText( /First line\s+Second line/ );
	expect( ( await asked ).headers()[ 'x-wp-nonce' ] ).toBeTruthy();

	// The next track has no lyrics; the open tab follows the track.
	await page.evaluate( () => window.riff.next() );
	await expect( panel.locator( '.riff-lyrics-note' ) ).toHaveText( 'No lyrics for this track.' );
} );

test( 'timed lyrics follow the music, and a tap on a line seeks to it', async ( {
	page,
	isMobile,
} ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 2 ).click();
	await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
	if ( isMobile ) {
		await page.locator( '.riff-peek' ).click();
	}
	await page.locator( '.riff-tab[data-riff-tab="lyrics"]' ).click();
	const panel = page.locator( '[data-riff-panel="lyrics"]' );
	const lines = panel.locator( '.riff-lyrics-synced li' );
	// The lines, without their times, each a button; the blank line is a gap before the third.
	await expect( lines ).toHaveText( [ 'First line', 'Second line', 'Third line' ] );
	await expect( lines.nth( 2 ) ).toHaveClass( /riff-lyrics-gap/ );
	await expect( panel.locator( 'button.riff-lyrics-line' ) ).toHaveCount( 3 );

	// As the track moves, the line being sung is the current one; a seek is followed at once.
	await page.evaluate( () => window.riff.seek( 1.6 ) );
	await expect( lines.nth( 1 ) ).toHaveAttribute( 'aria-current', 'true' );
	await expect( lines.nth( 0 ) ).not.toHaveAttribute( 'aria-current', 'true' );
	await page.evaluate( () => window.riff.seek( 0 ) );
	await expect( lines ).toHaveCount( 3 );
	await expect( panel.locator( '[aria-current]' ) ).toHaveCount( 0 );

	// A tap on a line takes the track there.
	await lines.nth( 2 ).locator( 'button' ).click();
	await expect.poll( () => page.evaluate( () => window.riff.time() ) ).toBeGreaterThanOrEqual( 2.5 );
	await expect( lines.nth( 2 ) ).toHaveAttribute( 'aria-current', 'true' );

	// Lyrics without times are shown as they were.
	await page.evaluate( () => window.riff.play( window.riff.queue(), 0 ) );
	await expect( panel.locator( 'p.riff-lyrics' ) ).toHaveText( /First line\s+Second line/ );
	await expect( panel.locator( '.riff-lyrics-synced' ) ).toHaveCount( 0 );
} );
