/**
 * The turntable's parts: the sleeve puts the record away and plays it again, and the arm is put
 * down on any band of the side, by dragging (turning on its base with the hand), by two clicks, or from the keyboard.
 * The arm is set up by Baerwald's alignment, and the platter turns on below the slowest the music
 * plays at: up to speed before the music is heard, and on down to rest after it stops.
 * Runs in desktop Chromium, where the turntable stands; a phone held upright shows the cover alone.
 * A site that turns the turntable off has the cover alone everywhere.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../helpers/views' );
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
		await openView( page, 'turntable' );
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

	test( 'opened as the music starts, the needle drops onto the record, and the music winds down and comes up to speed under it', async ( { page } ) => {
		// With motion from the start: the record comes out and the needle drops only with it.
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'turntable' );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		const arm = page.locator( '.riff-arm' );
		// Not at its rest, -14°, off the record: down in the groove, turned in over it.
		await expect( arm ).toHaveAttribute( 'data-riff-down', '' );
		await expect.poll( () => arm.evaluate( ( el ) => parseFloat( getComputedStyle( el ).rotate ) ) ).toBeGreaterThan( 0 );
		// The music's speed, each frame from here on.
		await page.evaluate( () => {
			const audio = document.querySelector( '.riff-audio' );
			window.riffRates = [];
			const sample = () => {
				window.riffRates.push( { rate: audio.playbackRate, heard: ! audio.paused } );
				requestAnimationFrame( sample );
			};
			sample();
		} );
		const heard = () => page.evaluate( () => window.riffRates.filter( ( s ) => s.heard ).map( ( s ) => s.rate ) );
		const toggle = page.locator( '.riff-bar [data-riff-action="toggle"]' ).first();
		// Stopped: heard slowing below its own speed before it falls silent.
		await toggle.click();
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( true );
		expect( Math.min( ...( await heard() ) ) ).toBeLessThan( 0.5 );
		// Started: heard from a crawl, rising to its own speed.
		await page.evaluate( () => ( window.riffRates = [] ) );
		await toggle.click();
		await expect.poll( async () => ( await heard() ).includes( 1 ) ).toBe( true );
		const up = await heard();
		expect( up[ 0 ] ).toBeLessThan( 0.5 );
		expect( up.some( ( r ) => r > 0.5 && r < 1 ) ).toBe( true );
		// And the arm is still on the record.
		expect( await arm.evaluate( ( el ) => parseFloat( getComputedStyle( el ).rotate ) ) ).toBeGreaterThan( 0 );
	} );
} );

test.describe( 'Turntable turned off', () => {
	test.use( { viewport: { width: 1440, height: 900 } } );

	test( 'a site that turns it off has no turntable to open, and the cover on its own', async ( {
		page,
		context,
		baseURL,
	}, info ) => {
		test.skip( info.project.name !== 'chromium', 'The turntable stands on a wide stage.' );
		// What Settings › Media's box does, through the riff_turntable filter (tests/components).
		await context.addCookies( [ { name: 'riff_test_no_turntable', value: '1', url: baseURL } ] );
		await page.goto( postUrl );
		const root = page.locator( '#riff' );
		await expect( root ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( page.locator( '[data-riff-control="turntable"]' ) ).toHaveCount( 0 );
		await expect( page.locator( '[data-riff-chip="turntable"]' ) ).toHaveCount( 0 );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '.riff-cover' ) ).toBeVisible();
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		// Playing on a stage with the room for it, and still no record out, no arm and no sleeve.
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-record' ) ).toBeHidden();
		await expect( page.locator( '.riff-mount' ) ).toBeHidden();
		await expect( page.locator( '.riff-sleeve' ) ).toBeHidden();
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
		await openView( page, 'turntable' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		// Disc 1 is one track, so the first side of its record holds it alone.
		await expect( page.locator( '.riff-label small' ) ).toHaveText( 'A · 33⅓' );
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'aria-valuemax', '1' );
		await expect
			.poll( () => page.locator( '.riff-record' ).evaluate( ( el ) => el.style.getPropertyValue( '--riff-bands' ) ) )
			.toContain( 'rgb(255 255 255 / 0.060)' );
	} );
} );
