/**
 * Timed lyrics in each format players and taggers write, lined up with the music: LRC with an
 * [offset:], Enhanced LRC's word times, WebVTT, and an ID3 SYLT frame read on upload. For each, at a
 * moment just after a line's time that line is the one marked, and just before it the one before.
 * Runs in desktop Chromium and at an iPhone's size (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../../../riff/tests/e2e/helpers/views' );
const { own } = require( '../../../riff/tests/e2e/helpers/own' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures' );
const made = own();
let postUrl;

// Each format, typed into the field (or, for SYLT, in the file's tags), and when its lines start.
const FORMATS = [
	{
		name: 'LRC with an offset',
		// +500 means the file is half a second late, so each line shows half a second sooner.
		lyrics: '[offset:+500]\n[00:01.00]One\n[00:02.00]Two\n[00:03.00]Three',
		times: [ 0.5, 1.5, 2.5 ],
	},
	{
		name: 'Enhanced LRC',
		lyrics: '[00:00.50]<00:00.50>One <00:01.00>more\n[00:01.50]<00:01.50>Two\n[00:02.50]Three',
		times: [ 0.5, 1.5, 2.5 ],
		words: true,
	},
	{
		name: 'WebVTT',
		// The test clip is a few seconds long: a pause of two seconds before the third cue is a gap.
		lyrics: 'WEBVTT\n\n00:00.500 --> 00:00.800\nOne\n\n00:00.900 --> 00:00.900\nTwo\n\n00:02.900 --> 00:03.200\nThree',
		times: [ 0.5, 0.9, 2.9 ],
		gap: 2,
	},
	{
		name: 'an ID3 SYLT frame',
		file: path.join( FIXTURES, 'test', 'lyrics-sylt.mp3' ),
		texts: [ 'First line', 'Second line', 'Third line' ],
		times: [ 0.5, 1.5, 2.5 ],
	},
];

test.beforeAll( async ( { requestUtils } ) => {
	let content = '';
	for ( const format of FORMATS ) {
		const media = await made.media(
			requestUtils,
			format.file || path.join( FIXTURES, 'test', 'lyrics.mp3' )
		);
		if ( format.lyrics ) {
			await requestUtils.rest( {
				path: `/wp/v2/media/${ media.id }`,
				method: 'POST',
				data: { riff_lyrics: format.lyrics },
			} );
		}
		content += `<!-- wp:audio {"id":${ media.id }} --><figure class="wp-block-audio"><audio controls src="${ media.source_url }"></audio></figure><!-- /wp:audio -->`;
	}
	postUrl = ( await made.post( requestUtils, { title: `Riff Lyrics formats e2e ${ Date.now() }`, status: 'publish', content } ) ).link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// Opens a format's track in the Lyrics view, paused, and answers its synced lines.
async function openLines( page, index ) {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( index ).click();
	await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
	// From the bar on a wide screen, from Now Playing on a phone.
	await openView( page, 'lyrics' );
	return page.locator( '.riff-np [data-riff-view="lyrics"] .riff-lyrics-synced li' );
}

const seek = ( page, t ) => page.evaluate( ( to ) => window.riff.seek( to ), t );

// Which line is current: its index, or -1 when none is.
const current = ( lines ) => lines.evaluateAll( ( els ) => els.findIndex( ( el ) => el.hasAttribute( 'aria-current' ) ) );

for ( const [ index, format ] of FORMATS.entries() ) {
	test( `${ format.name } lines up with the music`, async ( { page } ) => {
		const lines = await openLines( page, index );
		await expect( lines ).toHaveText( format.texts || [ format.words ? 'One more' : 'One', 'Two', 'Three' ] );
		for ( const [ i, time ] of format.times.entries() ) {
			await seek( page, time + 0.15 );
			await expect( lines.nth( i ) ).toHaveAttribute( 'aria-current', 'true' );
			await expect( page.locator( '.riff-np [data-riff-view="lyrics"] [aria-current]' ) ).toHaveCount( 1 );
			// A little before the line, the one before it is current, or none is before the first.
			await seek( page, Math.max( 0, time - 0.2 ) );
			await expect.poll( () => current( lines ) ).toBe( i - 1 );
		}
	} );
}

test( 'a pause before a WebVTT cue is marked as a gap', async ( { page } ) => {
	const lines = await openLines( page, FORMATS.findIndex( ( format ) => format.gap ) );
	await expect( lines.nth( FORMATS.find( ( format ) => format.gap ).gap ) ).toHaveClass( /riff-lyrics-gap/ );
} );

test( 'in Enhanced LRC each word lights up at its own time, and the button is named for the whole line', async ( { page } ) => {
	const lines = await openLines( page, FORMATS.findIndex( ( format ) => format.words ) );
	const words = lines.nth( 0 ).locator( '.riff-lyrics-word' );
	await seek( page, 0.7 );
	await expect( words.nth( 0 ) ).toHaveClass( /is-sung/ );
	await expect( words.nth( 1 ) ).not.toHaveClass( /is-sung/ );
	await seek( page, 1.1 );
	await expect( words.nth( 1 ) ).toHaveClass( /is-sung/ );
	await expect( lines.nth( 0 ).locator( 'button' ) ).toHaveAccessibleName( 'One more' );
} );
