/**
 * Riff Sing, end to end: a track with a melody in a post, its Sing view of Now Playing, and the
 * singing scored. The microphone is a tone the page makes itself (getUserMedia hands back an
 * oscillator at the melody's note), and the MIDI instrument a stand-in the test presses keys on, so
 * the whole path from the AudioWorklet to the score runs with no device and no permission prompt.
 * Desktop Chromium only (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../../../riff/tests/e2e/helpers/views' );
const { own } = require( '../../../riff/tests/e2e/helpers/own' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures' );
const made = own();
let postUrl;

// A at 440 Hz, sung "la" three times: two notes in the first line, one in the second. At 120 BPM an
// UltraStar beat is an eighth of a second, so the first line runs from 0 to 2 seconds and the second
// from 6 to 7, well after the test has changed key between them. The space before the second "la"
// is UltraStar's: it starts a new word.
const CHART = [ '#TITLE:Test', '#BPM:120', '#GAP:0', ': 0 8 9 La', ': 8 8 9  la', '- 40', ': 48 8 9 la', 'E' ].join( '\n' );

test.beforeAll( async ( { requestUtils } ) => {
	const sung = await made.media(
		requestUtils,
		path.join( FIXTURES, 'compositions', '02 - Underground [underground].mp3' )
	);
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ sung.id }`,
		data: { riff_sing_melody: CHART },
	} );
	const plain = await made.media(
		requestUtils,
		path.join( FIXTURES, 'compositions', '03 - Trombone Detritus [detritus].mp3' )
	);
	const block = ( m ) =>
		`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	const post = await made.post( requestUtils, {
		title: `Riff Sing e2e ${ Date.now() }`,
		status: 'publish',
		content: block( sung ) + block( plain ),
	} );
	postUrl = post.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// The post's first track loaded and paused, and its Sing view open. Nothing is scored while it is
// paused, so each test starts the song from the top once it is listening, with go().
async function open( page ) {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
	return openView( page, 'sing' );
}

const go = ( page ) =>
	page.evaluate( () => {
		window.riff.seek( 0 );
		if ( ! window.riff.playing() ) {
			window.riff.toggle();
		}
	} );

test( 'the Sing view shows the melody\'s words, says the voice stays on the device, and says so when a track has none', async ( {
	page,
} ) => {
	const panel = await open( page );
	await expect( page.locator( '.riff-bar [data-riff-control="sing"]' ) ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect( panel.locator( '.riff-sing-words' ) ).toHaveText( 'La la' );
	await expect( panel ).toContainText( 'nothing is recorded or sent' );
	await expect( panel.getByRole( 'button', { name: 'Sing with the microphone' } ) ).toBeVisible();
	// Drawn for the eye; the words and the scores are the text.
	await expect( panel.locator( 'canvas' ) ).toHaveAttribute( 'aria-hidden', 'true' );

	await page.evaluate( () => window.riff.next() );
	await expect( panel.locator( '.riff-sing-message' ) ).toHaveText( 'No melody for this track yet.' );
	// Signed in as someone who can edit the Media Library: the way to the track's Melody field.
	await expect( panel.getByRole( 'link', { name: 'Add a melody' } ) ).toHaveAttribute( 'href', /post\.php\?action=edit&post=\d+/ );
} );

test( 'a microphone that isn\'t allowed says how to allow it, and nothing is listening', async ( { page } ) => {
	await page.addInitScript( () => {
		navigator.mediaDevices.getUserMedia = () =>
			Promise.reject( new DOMException( 'Permission denied', 'NotAllowedError' ) );
	} );
	const panel = await open( page );
	await panel.getByRole( 'button', { name: 'Sing with the microphone' } ).click();
	await expect( panel.locator( '.riff-sing-status' ) ).toContainText( 'The microphone wasn’t allowed' );
	await expect( panel.getByRole( 'button', { name: 'Sing with the microphone' } ) ).toBeVisible();
	await expect( panel.getByRole( 'button', { name: 'Stop listening' } ) ).toBeHidden();
} );

test( 'singing the note into the microphone scores the line, and Stop closes it', async ( { page } ) => {
	await page.addInitScript( () => {
		// The microphone: a steady A, made by the page, as a stream the way a microphone's is.
		navigator.mediaDevices.getUserMedia = async () => {
			const ctx = new AudioContext();
			const tone = ctx.createOscillator();
			tone.frequency.value = 440;
			const out = ctx.createMediaStreamDestination();
			tone.connect( out );
			tone.start();
			await ctx.resume();
			return out.stream;
		};
	} );
	const panel = await open( page );
	await panel.getByRole( 'button', { name: 'Sing with the microphone' } ).click();
	await expect( panel.locator( '.riff-sing-status' ) ).toHaveText( /^Listening\./ );
	await go( page );
	await expect( panel.locator( '.riff-sing-result' ) ).toContainText( 'That line: Brilliant!', { timeout: 15000 } );
	// Said through WordPress's live region, for someone who can't see the panel.
	await expect( page.locator( '#a11y-speak-polite' ) ).toContainText( 'That line: Brilliant!' );

	await panel.getByRole( 'button', { name: 'Stop listening' } ).click();
	await expect( panel.locator( '.riff-sing-status' ) ).toHaveText( 'Stopped listening.' );
	await expect( panel.getByRole( 'button', { name: 'Sing with the microphone' } ) ).toBeVisible();
} );

test( 'a MIDI key an octave down still matches, and a wrong one doesn\'t', async ( { page } ) => {
	await page.addInitScript( () => {
		const input = { onmidimessage: null };
		window.riffSingTestKey = ( data ) => input.onmidimessage?.( { data: new Uint8Array( data ) } );
		navigator.requestMIDIAccess = async () => ( {
			inputs: new Map( [ [ 'test', input ] ] ),
			outputs: new Map(),
			onstatechange: null,
		} );
	} );
	const panel = await open( page );
	await panel.getByRole( 'button', { name: 'Use a MIDI instrument' } ).click();
	await expect( panel.locator( '.riff-sing-status' ) ).toHaveText( 'Listening to your MIDI instrument.' );
	// A3 held through the first line: an octave below the melody's A4.
	await page.evaluate( () => window.riffSingTestKey( [ 0x90, 57, 100 ] ) );
	await go( page );
	await expect( panel.locator( '.riff-sing-result' ) ).toContainText( 'That line: Brilliant!', { timeout: 15000 } );
	// B3, a whole tone off, through the second line.
	await page.evaluate( () => {
		window.riffSingTestKey( [ 0x80, 57, 0 ] );
		window.riffSingTestKey( [ 0x90, 59, 100 ] );
	} );
	await expect( panel.locator( '.riff-sing-result' ) ).toContainText( 'That line: Keep going.', { timeout: 15000 } );
} );
