/**
 * The turntable in the Listen app is the post's: the same order of things through a stop and a
 * start (helpers/turntable.js), with the listener's choice of the video where a song has one,
 * which is the site's default, left as it is: a song without a video is still the record.
 * Runs in desktop Chromium.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );
const { stopsAndStarts } = require( '../helpers/turntable' );

const made = own();
let pageUrl;
let postId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'App turntable', () => {
	test.use( { viewport: { width: 1440, height: 900 } } );

	test( 'the stylus is down before the music is heard and lifts only once it has stopped, with the video preferred', async ( { page }, info ) => {
		test.skip( info.project.name !== 'chromium', 'The turntable stands on a wide stage.' );
		await page.addInitScript( () => window.localStorage.setItem( 'riff:mode', 'video' ) );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '.riff-row' ).first().click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-mode', 'song' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-down', '' );
		await page.evaluate( () =>
			Promise.all( document.querySelector( '.riff-arm-tube' ).getAnimations().map( ( a ) => a.finished ) )
		);
		await stopsAndStarts( page );
	} );
} );
