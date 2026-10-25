/**
 * The accessibility tree as the spec (#604): what a screen reader will read of each surface of the
 * player, in each state, written down as an aria snapshot and reviewed as code. A change to a
 * name, a role or a state fails here before it reaches a listener. Each template is matched as a
 * subset, so a surface may grow; what is listed must stay as it is.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'The tree is the spec', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( postUrl );
	} );

	test( 'a post\'s rows, before anything plays', async ( { page } ) => {
		// The row is one button named for the track, its text and the film mark inside it; the
		// heart and the … follow it, each named for the track too.
		await expect( page.locator( '.wp-block-audio' ).first() ).toMatchAriaSnapshot( `
			- figure:
			  - button "Play Intensities in Ten Cities":
			    - text: Intensities in Ten Cities
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
			- button "Pause Underground"
		` );
		if ( isMobile ) {
			await expect( page.locator( '.riff-bar' ) ).toMatchAriaSnapshot( `
				- region "Player":
				  - 'button "Open Now Playing: Underground by Airmen of Note, United States Air Force Band"'
				  - button "Pause"
				  - slider "Seek"
				  - button "Like"
			` );
			return;
		}
		// The two buttons that open Now Playing told apart by name, the transport in order, the
		// seek line a slider named Seek with its times beside it, the quality pill as text.
		await expect( page.locator( '.riff-bar' ) ).toMatchAriaSnapshot( `
			- region "Player":
			  - 'button "Open Now Playing: Underground by Airmen of Note, United States Air Force Band"'
			  - button "Shuffle off"
			  - button "Previous"
			  - button "Pause"
			  - button "Next"
			  - button "Repeat off"
			  - text: /\\d+:\\d\\d/
			  - slider "Seek"
			  - text: /\\d+:\\d\\d/
			  - button "Like"
			  - text: MP3 · 128 kbps
			  - slider "Volume"
			  - button "Open Now Playing"
		` );
	} );

	test( 'Now Playing and Up next', async ( { page, isMobile } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		if ( isMobile ) {
			await page.locator( '.riff-peek' ).click();
		}
		// A dialog named Now Playing; its header holds the shortcuts switch, pressed while they are
		// on; Up next is a region with the tabs and the queue, each row named for what it plays,
		// with the artist, the playing one offering Pause, and the … after each.
		await expect( page.locator( '.riff-np' ) ).toMatchAriaSnapshot( `
			- dialog "Now Playing":
			  - banner:
			    - button "Keyboard shortcuts on" [pressed]
			  - region "Up next":
			    - tablist:
			      - tab "Up next" [selected]
			      - tab "Lyrics"
			    - tabpanel "Up next":
			      - paragraph: Playing from
			      - heading /Riff e2e/ [level=3]
			      - button "Clear the queue"
			      - list:
			        - listitem:
			          - 'button "Play Intensities in Ten Cities by Airmen of Note, United States Air Force Band"'
			          - button "More options for Intensities in Ten Cities"
			        - listitem:
			          - 'button "Pause Underground by Airmen of Note, United States Air Force Band"'
			          - button "More options for Underground"
			        - listitem:
			          - 'button "Play Trombone Detritus by Airmen of Note, United States Air Force Band"'
			          - button "More options for Trombone Detritus"
		` );
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

	test( 'the Lyrics tab', async ( { page, isMobile } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		if ( isMobile ) {
			await page.locator( '.riff-peek' ).click();
		}
		await page.locator( '.riff-tab[data-riff-tab="lyrics"]' ).click();
		await expect( page.locator( '.riff-queue' ) ).toMatchAriaSnapshot( `
			- region "Up next":
			  - tablist:
			    - tab "Up next"
			    - tab "Lyrics" [selected]
			  - tabpanel "Lyrics":
			    - paragraph: No lyrics for this track.
		` );
	} );
} );
