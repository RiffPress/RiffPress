/**
 * Riff Chords, end to end: a song with a chord chart typed in through the media REST route, played
 * in a post, and its Chords view of Now Playing, opened from its button in the bar on a wide screen
 * and from its chip in Now Playing on a phone. Runs in desktop Chromium and at an iPhone's size (see
 * playwright.config.js). The recording is one of the public-domain fixtures; the chart is
 * placeholder words, not that piece's chords.
 *
 * Riff Chords needs Riff 5.8 (riff_register_view(), window.riff.speed()); a local site runs it on the
 * Riff it has, and anywhere else on an older Riff it stays out of the way and this spec skips.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../../../riff/tests/e2e/helpers/views' );
const { own } = require( '../../../riff/tests/e2e/helpers/own' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures' );
const CHART = [
	'{key: G}',
	'{tempo: 90}',
	'{start_of_verse: Verse}',
	'[00:00.00][G]First line [00:01.00][C]here',
	'[00:02.00][D]Second line',
	'{end_of_verse}',
	'{start_of_chorus}',
	'[00:04.00][Em]Third line [00:05.00][F]here',
	'{end_of_chorus}',
].join( '\n' );
const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	const charted = await made.media(
		requestUtils,
		path.join( FIXTURES, 'compositions', '02 - Underground [underground].mp3' )
	);
	const plain = await made.media(
		requestUtils,
		path.join( FIXTURES, 'compositions', '03 - Trombone Detritus [detritus].mp3' )
	);
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ charted.id }`,
		data: { riff_chords: CHART },
	} );
	const block = ( m ) =>
		`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	const post = await made.post( requestUtils, {
		title: `Riff Chords e2e ${ Date.now() }`,
		status: 'publish',
		content: block( charted ) + block( plain ),
	} );
	postUrl = post.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// Plays the row and opens the Chords view, paused unless asked to keep playing.
async function openChords( page, isMobile, { row = 0, play = false } = {} ) {
	await page.goto( postUrl );
	const button = page.locator( '.riff-bar [data-riff-control="chords"]' );
	test.skip( ( await button.count() ) === 0, 'Riff Chords waits for Riff 5.8' );
	await page.locator( '.riff-row' ).nth( row ).click();
	if ( ! play ) {
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
	}
	const view = await openView( page, 'chords' );
	await expect( button ).toHaveAttribute( 'aria-pressed', 'true' );
	return view;
}

test( 'the chart follows the song: the chord being played, its fingering and the next one', async ( {
	page,
	isMobile,
} ) => {
	const panel = await openChords( page, isMobile );
	const chords = panel.locator( '.riff-chords-chart .riff-chords-chord' );
	await expect( chords ).toHaveText( [ 'G', 'C', 'D', 'Em', 'F' ] );
	await expect( panel.locator( '.riff-chords-heading' ) ).toHaveText( [ /Verse/, /Chorus/ ] );
	await expect( panel.locator( '.riff-chords-key' ) ).toHaveText( 'Key of G' );

	await page.evaluate( () => window.riff.seek( 2.5 ) );
	await expect( chords.nth( 2 ) ).toHaveClass( /is-current/ );
	await expect( panel.locator( '.riff-chords-line[aria-current]' ) ).toContainText( 'Second line' );
	const now = panel.locator( '.riff-chords-now' );
	await expect( now.locator( '.riff-chords-name' ) ).toHaveText( 'D' );
	await expect( now.locator( '.riff-chords-next' ) ).toHaveText( 'Next: Em' );
	await expect( now.getByRole( 'img' ) ).toHaveAttribute( 'aria-label', 'D, from the low string: not played, not played, open, 2, 3, 2' );

	// A tap on a line, or on a part's name, takes the song there.
	await panel.locator( '.riff-chords-seek' ).filter( { hasText: 'Third line' } ).click();
	await expect.poll( () => page.evaluate( () => window.riff.time() ) ).toBeGreaterThanOrEqual( 4 );
	await expect( now.locator( '.riff-chords-name' ) ).toHaveText( 'Em' );
	await panel.getByRole( 'button', { name: 'Verse', exact: true } ).click();
	await expect.poll( () => page.evaluate( () => window.riff.time() ) ).toBeLessThan( 1 );
} );

test( 'transpose and capo change the chords, not the music', async ( { page, isMobile } ) => {
	const panel = await openChords( page, isMobile );
	const chords = panel.locator( '.riff-chords-chart .riff-chords-chord' );
	await panel.getByRole( 'button', { name: 'Up a semitone' } ).click();
	await panel.getByRole( 'button', { name: 'Up a semitone' } ).click();
	await expect( chords ).toHaveText( [ 'A', 'D', 'E', 'F#m', 'G' ] );
	await expect( panel.locator( '.riff-chords-key' ) ).toHaveText( 'Key of A' );
	// A capo on the second fret: G shapes again, sounding in A.
	await panel.getByRole( 'button', { name: 'Capo up a fret' } ).click();
	await panel.getByRole( 'button', { name: 'Capo up a fret' } ).click();
	await expect( chords ).toHaveText( [ 'G', 'C', 'D', 'Em', 'F' ] );
	await expect( panel.locator( '.riff-chords-key' ) ).toHaveText( 'Key of A' );
	expect( await page.evaluate( () => window.riff.speed() ) ).toBe( 1 );
} );

test( 'slower keeps the pitch, and a new song is back at its own speed', async ( { page, isMobile } ) => {
	const panel = await openChords( page, isMobile );
	await panel.getByRole( 'button', { name: 'Slower' } ).click();
	await panel.getByRole( 'button', { name: 'Slower' } ).click();
	await expect( panel.locator( '[data-riff-chords="speed"] output' ) ).toHaveText( '90%' );
	expect( await page.evaluate( () => window.riff.speed() ) ).toBe( 0.9 );
	await page.evaluate( () => window.riff.next() );
	await expect.poll( () => page.evaluate( () => window.riff.speed() ) ).toBe( 1 );
	// The next track has no chart; an admin is shown the way to its field.
	await expect( panel.locator( '.riff-chords-note' ) ).toHaveText( 'No chords for this track.' );
	await expect( panel.getByRole( 'link', { name: 'Add chords' } ) ).toHaveAttribute( 'href', /post\.php\?action=edit&post=\d+/ );
} );

test( 'a part loops: past its end the song goes back to its start', async ( { page, isMobile } ) => {
	const panel = await openChords( page, isMobile, { play: true } );
	await panel.getByRole( 'button', { name: 'Loop Verse' } ).click();
	await expect( panel.locator( '.riff-chords-loop-toggle' ) ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect( panel.locator( '.riff-chords-ab' ) ).toHaveText( [ 'A 0:00', 'B 0:04' ] );
	await page.evaluate( () => window.riff.seek( 3.5 ) );
	// It plays through B at four seconds and comes round again.
	await expect.poll( () => page.evaluate( () => window.riff.time() ), { timeout: 5000 } ).toBeLessThan( 2 );
	// Off, it plays on.
	await panel.locator( '.riff-chords-loop-toggle' ).click();
	await expect( panel.locator( '.riff-chords-loop-toggle' ) ).toHaveAttribute( 'aria-pressed', 'false' );
	await page.evaluate( () => window.riff.seek( 3.5 ) );
	await expect.poll( () => page.evaluate( () => window.riff.time() ), { timeout: 5000 } ).toBeGreaterThan( 4.2 );
} );

test( 'the chords are drawn for a ukulele or a piano, and this browser keeps the choice', async ( {
	page,
	isMobile,
} ) => {
	const panel = await openChords( page, isMobile );
	await page.evaluate( () => window.riff.seek( 2.5 ) );
	const now = panel.locator( '.riff-chords-now' );
	await expect( now.locator( '.riff-chords-name' ) ).toHaveText( 'D' );
	const instrument = panel.getByRole( 'group', { name: 'Instrument' } );
	await expect( instrument.getByRole( 'button', { name: 'Guitar' } ) ).toHaveAttribute( 'aria-pressed', 'true' );

	await instrument.getByRole( 'button', { name: 'Ukulele' } ).click();
	await expect( instrument.getByRole( 'button', { name: 'Ukulele' } ) ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect( now.getByRole( 'img' ) ).toHaveAttribute( 'aria-label', 'D, from the G string: 2, 2, 2, open' );
	await expect( now.locator( '.riff-chords-string' ) ).toHaveCount( 4 );

	// A piano has no capo to set.
	await instrument.getByRole( 'button', { name: 'Piano' } ).click();
	await expect( now.getByRole( 'img' ) ).toHaveAttribute( 'aria-label', 'D, on the keys D, F#, A' );
	await expect( now.locator( '.riff-chords-dot' ) ).toHaveCount( 3 );
	await expect( panel.locator( '[data-riff-chords="capo"]' ) ).toBeHidden();

	// Back on the page later, the piano is still chosen.
	const again = await openChords( page, isMobile );
	await expect( again.getByRole( 'group', { name: 'Instrument' } ).getByRole( 'button', { name: 'Piano' } ) ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect( again.locator( '.riff-chords-piano-key' ).first() ).toBeVisible();
} );

test( 'on a piano, a capo moves nothing: the chords are named as they sound', async ( { page, isMobile } ) => {
	const panel = await openChords( page, isMobile );
	await panel.getByRole( 'button', { name: 'Capo up a fret' } ).click();
	await panel.getByRole( 'button', { name: 'Capo up a fret' } ).click();
	const chords = panel.locator( '.riff-chords-chart .riff-chords-chord' );
	await expect( chords ).toHaveText( [ 'F', 'Bb', 'C', 'Dm', 'Eb' ] );
	await panel.getByRole( 'group', { name: 'Instrument' } ).getByRole( 'button', { name: 'Piano' } ).click();
	await expect( chords ).toHaveText( [ 'G', 'C', 'D', 'Em', 'F' ] );
} );
