/**
 * The accessibility tree as the spec (#604): what a screen reader will read of each surface of the
 * player, in each state, written down as an aria snapshot and reviewed as code. A change to a
 * name, a role or a state fails here before it reaches a listener. Each template is matched as a
 * subset, so a surface may grow; what is listed must stay as it is.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
	// A Listen page, for About's album and artist to link to.
	await made.page( requestUtils, {
		title: 'Aria e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'The tree is the spec', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( postUrl );
	} );

	test( 'a post\'s rows, before anything plays', async ( { page } ) => {
		// The row is one button named by its text after a hidden Play, the film mark inside it; the
		// heart and the … follow it, each named for the track too.
		await expect( page.locator( '.wp-block-audio' ).first() ).toMatchAriaSnapshot( `
			- figure:
			  - button /^Play Intensities in Ten Cities\\b/:
			    - text: /Intensities in Ten Cities/
			    - img "Video"
			    - text: /Airmen of Note/
			  - button "Like Intensities in Ten Cities"
			  - button "More options for Intensities in Ten Cities"
		` );
		await expect( page.locator( '#riff' ) ).toBeHidden();
	} );

	test( 'the bar, with a track playing', async ( { page, isMobile } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect.poll( () => page.evaluate( () => window.riff.playing() ) ).toBe( true );
		await expect( page.locator( '.wp-block-audio' ).nth( 1 ).locator( '.riff-row' ) ).toMatchAriaSnapshot( `
			- button /^Pause Underground\\b/
		` );
		if ( isMobile ) {
			await expect( page.locator( '.riff-bar' ) ).toMatchAriaSnapshot( `
				- region "Player":
				  - text: /Underground/
				  - button "Pause"
				  - slider "Track position"
				  - button "Like Underground"
				  - button "Album"
			` );
			return;
		}
		// What plays, read and not pressed, the transport in order with Shuffle a toggle and Repeat
		// its state after its name, the seek line a slider named Track position with its times
		// beside it, the quality pill as text, the views' buttons in their order, the volume as a
		// percentage.
		await expect( page.locator( '.riff-bar' ) ).toMatchAriaSnapshot( `
			- region "Player":
			  - text: /Underground/
			  - button "Shuffle"
			  - button "Previous"
			  - button "Pause"
			  - button "Next"
			  - button "Repeat, off"
			  - text: /\\d+:\\d\\d/
			  - slider "Track position"
			  - text: /\\d+:\\d\\d/
			  - button "Like Underground"
			  - text: MP3 · 128 kbps
			  - button "Album"
			  - button "Turntable"
			  - button "About"
			  - button "Up next"
			  - slider "Volume"
		` );
	} );

	test( 'Up next, a panel of its own', async ( { page, isMobile } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await openView( page, 'queue' );
		// Named for what it holds: beside the page on a wide screen, a dialog over everything on a
		// phone. Its name is its heading, then Close, then the queue, each row named by
		// what it shows after a hidden Play, the playing one offering Pause, and the … after each.
		await expect( page.locator( '.riff-side' ) ).toMatchAriaSnapshot( `
			- ${ isMobile ? 'dialog' : 'complementary' } "Up next":
			  - heading "Up next" [level=2]
			  - button "Close Up next"
			  - paragraph: Playing from
			  - heading /Riff e2e/ [level=3]
			  - button "Clear the queue"
			  - list:
			    - listitem:
			      - button /^Play Intensities in Ten Cities\\s*,\\s*Airmen of Note, United States Air Force Band/
			      - button "More options for Intensities in Ten Cities"
			    - listitem:
			      - button /^Pause Underground\\s*,\\s*Airmen of Note, United States Air Force Band/
			      - button "More options for Underground"
			    - listitem:
			      - button /^Play Trombone Detritus\\s*,\\s*Airmen of Note, United States Air Force Band/
			      - button "More options for Trombone Detritus"
		` );
	} );

	test( 'About, a panel of its own', async ( { page, isMobile } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await openView( page, 'about' );
		// Named for what it holds, beside the page or over everything as Up next is: its name, Close,
		// then the track, its cover left to the title beside it, the title a heading, the artist and
		// the album links to their pages, and the credits under their own heading, each name beside
		// what they did.
		await expect( page.locator( '.riff-side' ) ).toMatchAriaSnapshot( `
			- ${ isMobile ? 'dialog' : 'complementary' } "About":
			  - heading "About" [level=2]
			  - button "Close About"
			  - heading "Underground" [level=3]
			  - link "Airmen of Note, United States Air Force Band"
			  - link "Compositions"
			  - heading "Credits" [level=3]
			  - term: Composer
			  - definition: Tyler Kuebler
		` );
	} );

	test( 'Now Playing, the track on its own', async ( { page, isMobile } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		await expect( page.locator( '.riff-np' ).getByRole( 'region', { name: 'Up next' } ) ).toHaveCount( 0 );
		await expect( page.locator( '.riff-np' ).getByRole( 'tablist' ) ).toHaveCount( 0 );
		if ( isMobile ) {
			// A phone's views open from their chips, after Share.
			await expect( page.locator( '.riff-np .riff-chips' ) ).toMatchAriaSnapshot( `
				- button "Share"
				- button "Album"
				- button "Turntable"
				- button "About"
				- button "Up next"
			` );
		}
	} );

	test( 'a row\'s menu', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-more-button' ).nth( 1 ).click();
		await expect( page.locator( '.riff-menu' ) ).toMatchAriaSnapshot( `
			- menu:
			  - menuitem "Play next"
			  - menuitem "Add to queue"
			  - menuitem "Add to Liked songs"
			  - menuitem "Add to playlist"
			  - menuitem "Go to post"
		` );
		await expect( page.locator( '.riff-menu [role="menuitem"]' ).first() ).toBeFocused();
	} );

	test( 'a view with nothing for the track has no button', async ( { page } ) => {
		// Riff Lyrics' view, for a track whose file has no words: not in the bar, nor among the chips.
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-bar [data-riff-control="about"]' ) ).toBeAttached();
		await expect( page.getByRole( 'button', { name: 'Lyrics', exact: true } ) ).toHaveCount( 0 );
	} );
} );
