/**
 * Riff Chimera, end to end, on the demo's Silent Night, whose melody (Riff Sing's) is a duet: the
 * Chimera view opens with a head for each singer, CHIMERA is fetched only then, the voices start on
 * the listener's press and sing while the song plays, and stop when the listener presses Stop or
 * leaves the view. Whether a voice is sounding is read from its worklet's own measure of its output
 * (the view's data-sounding), not by listening. Desktop Chromium only (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../../../riff/tests/e2e/helpers/views' );

const ALBUM = '/christmas-with-the-chorus/';

async function load( page, title ) {
	await page.goto( ALBUM );
	await page.locator( '.riff-row', { hasText: title } ).first().click();
	await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
}

const play = ( page ) =>
	page.evaluate( () => {
		window.riff.seek( 0 );
		if ( ! window.riff.playing() ) {
			window.riff.toggle();
		}
	} );

test( 'the Chimera button shows only for a track with a melody', async ( { page } ) => {
	await load( page, 'Joy to the World' );
	await expect( page.locator( '.riff-bar [data-riff-control="chimera"]' ) ).toBeHidden();
	await load( page, 'Silent Night' );
	await expect( page.locator( '.riff-bar [data-riff-control="chimera"]' ) ).toBeVisible();
} );

test( 'CHIMERA is fetched when the view opens, sings both parts on a press and stops on Stop and on close', async ( { page } ) => {
	const fetched = [];
	page.on( 'request', ( r ) => {
		if ( r.url().includes( '/riff-chimera/assets/chimera/' ) ) {
			fetched.push( new URL( r.url() ).pathname.split( '/' ).pop() );
		}
	} );
	await load( page, 'Silent Night' );
	expect( fetched, 'nothing of CHIMERA with the page' ).toEqual( [] );

	const panel = await openView( page, 'chimera' );
	const view = panel.locator( '.riff-chimera' );
	await expect( view ).toHaveAttribute( 'data-ready', 'true', { timeout: 20000 } );
	expect( fetched ).toEqual( expect.arrayContaining( [ 'chimera.js', 'chimera.wasm', 'cmudict.txt.gz' ] ) );
	await expect( panel.locator( '.riff-chimera-head canvas' ) ).toHaveCount( 2 );
	await expect( panel.locator( '.riff-chimera-name' ) ).toHaveText( [ 'Soprano', 'Alto' ] );
	await expect( panel.locator( '.riff-chimera-words' ).first() ).toContainText( 'Silent night' );
	await expect( view ).toHaveAttribute( 'data-state', 'idle' );
	await expect( view ).not.toHaveAttribute( 'data-sounding', 'true' );

	await panel.getByRole( 'button', { name: 'Sing along' } ).click();
	await expect( view ).toHaveAttribute( 'data-state', 'waiting', { timeout: 15000 } );
	await play( page );
	await expect( view ).toHaveAttribute( 'data-state', 'singing' );
	await expect( view, 'the worklet hears itself sing' ).toHaveAttribute( 'data-sounding', 'true', { timeout: 15000 } );

	const solo = panel.getByRole( 'button', { name: 'Hear Alto alone' } );
	await solo.click();
	await expect( solo ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect( panel.getByRole( 'button', { name: 'Hear Soprano alone' } ) ).toHaveAttribute( 'aria-pressed', 'false' );

	// Paused, the voices hush; played again, they sing on.
	await page.evaluate( () => window.riff.toggle() );
	await expect( view ).toHaveAttribute( 'data-state', 'waiting' );
	await expect( view ).toHaveAttribute( 'data-sounding', 'false', { timeout: 5000 } );
	await page.evaluate( () => window.riff.toggle() );
	await expect( view ).toHaveAttribute( 'data-sounding', 'true', { timeout: 15000 } );

	await panel.getByRole( 'button', { name: 'Stop' } ).click();
	await expect( view ).toHaveAttribute( 'data-state', 'idle' );
	await expect( view ).toHaveAttribute( 'data-sounding', 'false' );
	await expect( panel.getByRole( 'button', { name: 'Sing along' } ) ).toBeVisible();

	// Singing again, then the view closed: its voices go with it.
	await panel.getByRole( 'button', { name: 'Sing along' } ).click();
	await expect( view ).toHaveAttribute( 'data-sounding', 'true', { timeout: 15000 } );
	await page.locator( '.riff-bar [data-riff-control="chimera"]' ).click();
	await expect( panel ).toBeHidden();
	await expect( view, 'the voices stopped with the view' ).toHaveAttribute( 'data-sounding', 'false' );
} );
