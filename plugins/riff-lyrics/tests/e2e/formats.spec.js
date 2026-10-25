/**
 * Timed lyrics in each format players and taggers write, lined up with the music: LRC with an
 * [offset:], Enhanced LRC's word times, WebVTT, and an ID3 SYLT frame read on upload. For each, at a
 * moment just after a line's time that line is the one marked, and just before it the one before.
 * Runs in desktop Chromium and at an iPhone's size (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
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

for ( const [ index, format ] of FORMATS.entries() ) {
	test( `${ format.name } lines up with the music`, async ( { page, isMobile } ) => {
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( index ).click();
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		await page.locator( '.riff-bar-info' ).click();
		if ( isMobile ) {
			await page.locator( '.riff-peek' ).click();
		}
		await page.locator( '.riff-tab[data-riff-tab="lyrics"]' ).click();
		const lines = page.locator( '[data-riff-panel="lyrics"] .riff-lyrics-synced li' );
		await expect( lines ).toHaveText( format.texts || [ format.words ? 'One more' : 'One', 'Two', 'Three' ] );
		if ( format.gap ) {
			await expect( lines.nth( format.gap ) ).toHaveClass( /riff-lyrics-gap/ );
		}
		const seek = ( t ) => page.evaluate( ( to ) => window.riff.seek( to ), t );
		for ( const [ i, time ] of format.times.entries() ) {
			await seek( time + 0.15 );
			await expect( lines.nth( i ) ).toHaveAttribute( 'aria-current', 'true' );
			await expect( page.locator( '[data-riff-panel="lyrics"] [aria-current]' ) ).toHaveCount( 1 );
			await seek( Math.max( 0, time - 0.2 ) );
			if ( i === 0 ) {
				await expect( page.locator( '[data-riff-panel="lyrics"] [aria-current]' ) ).toHaveCount( 0 );
			} else {
				await expect( lines.nth( i - 1 ) ).toHaveAttribute( 'aria-current', 'true' );
			}
		}
		if ( format.words ) {
			// Within the line, each word lights up at its own time.
			const words = lines.nth( 0 ).locator( '.riff-lyrics-word' );
			await seek( 0.7 );
			await expect( words.nth( 0 ) ).toHaveClass( /is-sung/ );
			await expect( words.nth( 1 ) ).not.toHaveClass( /is-sung/ );
			await seek( 1.1 );
			await expect( words.nth( 1 ) ).toHaveClass( /is-sung/ );
			// The button is still named for the whole line.
			await expect( lines.nth( 0 ).locator( 'button' ) ).toHaveAccessibleName( 'One more' );
		}
	} );
}
