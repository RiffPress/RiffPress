/**
 * Riff Lyrics, end to end: a file whose tags carry lyrics, played in a post, and its Lyrics tab in
 * Now Playing. Runs in desktop Chromium and at an iPhone's size (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../../../riff/tests/e2e/own' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures' );
const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	const sung = await made.media( requestUtils, path.join( FIXTURES, 'test', 'lyrics.mp3' ) );
	const plain = await made.media(
		requestUtils,
		path.join( FIXTURES, 'compositions', '02 - Underground [underground].mp3' )
	);
	const block = ( m ) =>
		`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	const post = await made.post( requestUtils, {
		title: `Riff Lyrics e2e ${ Date.now() }`,
		status: 'publish',
		content: block( sung ) + block( plain ),
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
	await tab.click();
	await expect( tab ).toHaveAttribute( 'aria-selected', 'true' );
	const panel = page.locator( '[data-riff-panel="lyrics"]' );
	await expect( panel.locator( '.riff-lyrics' ) ).toHaveText( /First line\s+Second line/ );

	// The next track has no lyrics; the open tab follows the track.
	await page.evaluate( () => window.riff.next() );
	await expect( panel.locator( '.riff-lyrics-note' ) ).toHaveText( 'No lyrics for this track.' );
} );
