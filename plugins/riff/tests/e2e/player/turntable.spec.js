/**
 * The turntable's parts: the sleeve puts the record away and plays it again, and the arm is put
 * down on any band of the side, by dragging (turning on its base with the hand), by two clicks, or from the keyboard.
 * The arm is set up by Baerwald's alignment, and the platter turns on below the slowest the music
 * plays at: up to speed before the music is heard, and on down to rest after it stops.
 * Runs in desktop Chromium, where the turntable stands; a phone held upright shows the cover alone.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite, audioState } = require( '../helpers/site' );

const made = own();

// A point on the arm's tube, near its headshell, on the screen.
const onArm = ( page ) =>
	page.locator( '.riff-arm-grip' ).evaluate( ( path ) => {
		const p = path.getPointAtLength( path.getTotalLength() * 0.85 );
		const at = new DOMPoint( p.x, p.y ).matrixTransform( path.getScreenCTM() );
		return { x: at.x, y: at.y };
	} );
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Turntable', () => {
	test.use( { viewport: { width: 1440, height: 900 } } );

	test.beforeEach( async ( { page }, info ) => {
		test.skip( info.project.name !== 'chromium', 'The turntable stands on a wide stage.' );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
	} );

	test( 'the sleeve puts the record away, and plays it again', async ( { page } ) => {
		// With motion, so the record is seen set down.
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		const root = page.locator( '#riff' );
		const sleeve = page.locator( '.riff-sleeve' );
		await expect( sleeve ).toHaveText( 'Put the record away' );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		await page.locator( '.riff-cover' ).click();
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( true );
		await expect( sleeve ).toHaveText( 'Play the record' );
		// The arm goes with the record: nothing to reach while it is away.
		await expect( page.locator( '.riff-mount' ) ).toHaveAttribute( 'inert', '' );
		// Carried to the platter a few millimetres above the mat, it is let fall onto it: kept as it
		// is asked for, since the fall is over in under a second.
		await page.locator( '.riff-record' ).evaluate( ( el ) => {
			const animate = el.animate.bind( el );
			el.animate = ( frames, options ) => {
				if ( Array.isArray( frames ) && frames.some( ( k ) => /^scale/.test( k.transform || '' ) ) ) {
					window.riffLaid = true;
				}
				return animate( frames, options );
			};
		} );
		await sleeve.focus();
		await page.keyboard.press( 'Enter' );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
		await expect.poll( () => page.evaluate( () => !! window.riffLaid ) ).toBe( true );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		await expect( sleeve ).toHaveText( 'Put the record away' );
	} );

	test( 'the arm is put down on another band from the keyboard, and by dragging', async ( { page } ) => {
		const arm = page.locator( '.riff-arm' );
		const title = page.locator( '.riff-bar .riff-title' );
		await expect( arm ).toHaveAttribute( 'aria-valuemax', /^[2-9]/ );
		await expect( arm ).toHaveAttribute( 'aria-valuenow', '1' );
		const first = await title.textContent();
		await arm.focus();
		await page.keyboard.press( 'ArrowRight' );
		await expect( arm ).toHaveAttribute( 'aria-valuenow', '2' );
		await expect( title ).not.toHaveText( first );
		await page.keyboard.press( 'Home' );
		await expect( arm ).toHaveAttribute( 'aria-valuenow', '1' );
		await expect( title ).toHaveText( first );

		// Dragged to the record's lead-in rim, the needle lands at the side's start; to just
		// outside its label, near the side's end.
		const record = await page.locator( '.riff-record' ).boundingBox();
		const grip = await onArm( page );
		const max = await arm.getAttribute( 'aria-valuemax' );
		const turned = () => arm.evaluate( ( el ) => parseFloat( getComputedStyle( el ).rotate ) || 0 );
		await page.mouse.move( grip.x, grip.y );
		await page.mouse.down();
		const before = await turned();
		await page.mouse.move( record.x + record.width * 0.5, record.y + record.height * 0.7, { steps: 8 } );
		await expect( arm ).toHaveAttribute( 'data-riff-held', '' );
		// In the hand it turns with the hand, towards the label, before it is let go.
		await expect.poll( turned ).toBeGreaterThan( before + 5 );
		await page.mouse.up();
		await expect( arm ).not.toHaveAttribute( 'data-riff-held', '' );
		await expect( arm ).toHaveAttribute( 'aria-valuenow', max );
	} );

	test( 'a click picks the arm up and the next puts it down, for a single pointer', async ( { page } ) => {
		const arm = page.locator( '.riff-arm' );
		await expect( arm ).toHaveAttribute( 'aria-valuemax', /^[2-9]/ );
		const record = await page.locator( '.riff-record' ).boundingBox();
		const grip = await onArm( page );
		const max = await arm.getAttribute( 'aria-valuemax' );
		await page.mouse.click( grip.x, grip.y );
		await expect( arm ).toHaveAttribute( 'data-riff-held', '' );
		await page.mouse.click( record.x + record.width * 0.5, record.y + record.height * 0.7 );
		await expect( arm ).not.toHaveAttribute( 'data-riff-held', '' );
		await expect( arm ).toHaveAttribute( 'aria-valuenow', max );
	} );

	test( 'the arm is set up by Baerwald alignment, beside its anti-skate dial and the target light', async ( { page } ) => {
		// Nulls at 66 and 120.9 mm, the base 214.6 mm from the spindle: the headshell turned in by 23.7°.
		await expect( page.locator( '.riff-headshell' ) ).toHaveAttribute( 'transform', /rotate\(23\.70\)$/ );
		await expect( page.locator( '.riff-antiskate' ) ).toBeVisible();
		await expect( page.locator( '.riff-target' ) ).toBeVisible();
	} );

	test( 'the platter turns on its own below a crawl: up to speed before the music is heard, and on to rest after it stops', async ( { page } ) => {
		// With motion: without it the music starts and stops at once.
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		await page.evaluate( () => {
			const root = document.querySelector( '#riff' );
			const audio = document.querySelector( '.riff-audio' );
			window.riffPlatter = [];
			new MutationObserver( () =>
				window.riffPlatter.push( `${ 'riffCoasting' in root.dataset ? 'coasting' : 'driven' }, ${ audio.paused ? 'silent' : 'heard' }` )
			).observe( root, { attributeFilter: [ 'data-riff-coasting' ] } );
		} );
		const platter = () => page.evaluate( () => window.riffPlatter );
		const toggle = page.locator( '.riff-bar [data-riff-action="toggle"]' ).first();
		// Stopped: the music winds down to a crawl and stops, and the platter turns on to rest.
		await toggle.click();
		await expect.poll( platter ).toEqual( [ 'coasting, silent', 'driven, silent' ] );
		// Started: the platter comes up to a crawl, and the music starts there.
		await toggle.click();
		await expect.poll( platter ).toEqual( [ 'coasting, silent', 'driven, silent', 'coasting, silent', 'driven, heard' ] );
		await expect.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).playbackRate ) ).toBe( 1 );
	} );
} );

test.describe( 'Turntable, from what the files say', () => {
	test.use( { viewport: { width: 1440, height: 900 } } );

	test( 'discs from the tags are records of their own, and the grooves are lighter where the music is loud', async ( { page }, info ) => {
		test.skip( info.project.name !== 'chromium', 'The turntable stands on a wide stage.' );
		// The fixtures carry no disc numbers and no measured loudness, so the album's track list
		// says them: the first track on disc 1, the other two on disc 2, the first loud at its end.
		await page.route(
			( url ) => decodeURIComponent( url.href ).includes( 'riff/v1/library/' ),
			async ( route ) => {
				const response = await route.fetch();
				const post = await response.json();
				( post.tracks || [] ).forEach( ( track, k ) => {
					track.disc = k ? 2 : 1;
					track.levels = k ? '' : '0000000099';
				} );
				await route.fulfill( { response, json: post } );
			}
		);
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		// Disc 1 is one track, so the first side of its record holds it alone.
		await expect( page.locator( '.riff-label small' ) ).toHaveText( 'A · 33⅓' );
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'aria-valuemax', '1' );
		await expect
			.poll( () => page.locator( '.riff-record' ).evaluate( ( el ) => el.style.getPropertyValue( '--riff-bands' ) ) )
			.toContain( 'rgb(255 255 255 / 0.060)' );
	} );
} );
