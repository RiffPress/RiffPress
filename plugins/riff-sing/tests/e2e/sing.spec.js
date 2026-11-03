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
let midiUrl;

// A MIDI file as a score program writes one: a track named Voice, three A4 crotchets at the default
// 120 BPM with a lyric on each, made here byte by byte.
function midiFile() {
	const vlq = ( n ) => ( n > 127 ? [ ( n >> 7 ) | 0x80, n & 0x7f ] : [ n ] );
	const text = ( type, at, s ) => [ ...vlq( at ), 0xff, type, s.length, ...Buffer.from( s ) ];
	const events = [ ...text( 0x03, 0, 'Voice' ) ];
	[ 'Sing', 'a', 'long' ].forEach( ( word, i ) => {
		events.push( ...text( 0x05, i ? 240 : 0, word ), 0, 0x90, 69, 100, ...vlq( 240 ), 0x80, 69, 64 );
	} );
	events.push( 0, 0xff, 0x2f, 0 );
	const u32 = ( n ) => [ n >>> 24, ( n >> 16 ) & 0xff, ( n >> 8 ) & 0xff, n & 0xff ];
	return Buffer.from( [
		...Buffer.from( 'MThd' ),
		...u32( 6 ),
		0,
		0,
		0,
		1,
		1,
		224,
		...Buffer.from( 'MTrk' ),
		...u32( events.length ),
		...events,
	] );
}
let duetUrl;

// A duet: Ada sings A over the first two seconds while Bo sings E, each a line of two notes.
const DUET = [
	'#TITLE:Duet',
	'#BPM:120',
	'#GAP:0',
	'#P1:Ada',
	'#P2:Bo',
	'P1',
	': 0 8 9 La',
	': 8 8 9  la',
	'P2',
	': 0 8 4 Oh',
	': 8 8 4  oh',
	'E',
].join( '\n' );

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

	// A track whose melody is a MIDI file's voice, in a post of its own.
	const midi = await made.media( requestUtils, { name: 'riff-sing-e2e.mid', mimeType: 'audio/midi', buffer: midiFile() } );
	const scored = await made.media(
		requestUtils,
		path.join( FIXTURES, 'compositions', '04 - It\'s a Brand New Day [new-day].mp3' )
	);
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ scored.id }`,
		data: { riff_sing_midi: midi.id },
	} );
	midiUrl = (
		await made.post( requestUtils, {
			title: `Riff Sing MIDI e2e ${ Date.now() }`,
			status: 'publish',
			content: block( scored ),
		} )
	).link;

	const duet = await made.media(
		requestUtils,
		path.join( FIXTURES, 'compositions', '05 - Stole Back My Soul [stole-back].mp3' )
	);
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ duet.id }`,
		data: { riff_sing_melody: DUET },
	} );
	duetUrl = (
		await made.post( requestUtils, {
			title: `Riff Sing duet e2e ${ Date.now() }`,
			status: 'publish',
			content: block( duet ),
		} )
	).link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// The post's first track loaded and paused, and its Sing view open. Nothing is scored while it is
// paused, so each test starts the song from the top once it is listening, with go().
async function open( page, url = postUrl ) {
	await page.goto( url );
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

test( 'a track whose melody is a MIDI file sings its voice track\'s words', async ( { page } ) => {
	const panel = await open( page, midiUrl );
	await expect( panel.locator( '.riff-sing-words' ) ).toHaveText( 'Sing a long' );
	await expect( panel.getByRole( 'button', { name: 'Sing with the microphone' } ) ).toBeVisible();
} );

test( 'a microphone that isn\'t allowed says how to allow it, and nothing is listening', async ( { page } ) => {
	await page.addInitScript( () => {
		navigator.mediaDevices.getUserMedia = () =>
			Promise.reject( new DOMException( 'Permission denied', 'NotAllowedError' ) );
	} );
	const panel = await open( page );
	await panel.getByRole( 'button', { name: 'Sing with the microphone' } ).click();
	await expect( panel.locator( '.riff-sing-status' ) ).toContainText( "The microphone wasn't allowed" );
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

test( 'a duet has a lane for each singer, each on a MIDI input of their own and scored on their own', async ( { page } ) => {
	await page.addInitScript( () => {
		const one = { name: 'Keys', onmidimessage: null };
		const two = { name: 'Pads', onmidimessage: null };
		window.riffSingTestKey = ( input, data ) =>
			( input === 1 ? one : two ).onmidimessage?.( { data: new Uint8Array( data ) } );
		navigator.requestMIDIAccess = async () => ( {
			inputs: new Map( [
				[ 'one', one ],
				[ 'two', two ],
			] ),
			outputs: new Map(),
			onstatechange: null,
		} );
	} );
	const panel = await open( page, duetUrl );
	const ada = panel.getByRole( 'group', { name: 'Ada' } );
	const bo = panel.getByRole( 'group', { name: 'Bo' } );
	await expect( ada.locator( '.riff-sing-words' ) ).toHaveText( 'La la' );
	await expect( bo.locator( '.riff-sing-words' ) ).toHaveText( 'Oh oh' );

	await ada.getByRole( 'button', { name: 'Use a MIDI instrument' } ).click();
	await bo.getByRole( 'button', { name: 'Use a MIDI instrument' } ).click();
	await expect( ada.locator( '.riff-sing-status' ) ).toHaveText( 'Listening to your MIDI instrument.' );
	await expect( bo.locator( '.riff-sing-status' ) ).toHaveText( 'Listening to your MIDI instrument.' );
	// The first singer on the first input, the second on the second.
	await expect( ada.getByLabel( 'MIDI input' ) ).toHaveValue( 'one' );
	await expect( bo.getByLabel( 'MIDI input' ) ).toHaveValue( 'two' );

	// Ada's A on her keys; nothing from Bo's.
	await page.evaluate( () => window.riffSingTestKey( 1, [ 0x90, 69, 100 ] ) );
	await go( page );
	await expect( ada.locator( '.riff-sing-result' ) ).toContainText( 'That line: Brilliant!', { timeout: 15000 } );
	await expect( bo.locator( '.riff-sing-result' ) ).toContainText( 'That line: Keep going.' );
	// Both lines end at once, and both are said: one announcement, not the second over the first.
	await expect( page.locator( '#a11y-speak-polite' ) ).toContainText( 'Ada: That line' );
	await expect( page.locator( '#a11y-speak-polite' ) ).toContainText( 'Bo: That line' );

	await ada.getByRole( 'button', { name: 'Stop listening' } ).click();
	await expect( ada.getByRole( 'button', { name: 'Use a MIDI instrument' } ) ).toBeVisible();
	await expect( bo.getByRole( 'button', { name: 'Stop listening' } ) ).toBeVisible();
} );
