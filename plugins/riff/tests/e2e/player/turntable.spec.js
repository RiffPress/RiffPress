/**
 * The turntable's parts: the sleeve puts the record away and plays it again, and the arm is put
 * down on any band of the side, by dragging (turning on its base with the hand), by two clicks, or from the keyboard.
 * The arm is set up by Baerwald's alignment, and the platter turns on below the slowest the music
 * plays at: up to speed before the music is heard, and on down to rest after it stops.
 * The needle rides the groove the music is at, and the platter turns at the record's speed times
 * the music's. The album is the turntable where Now Playing is wider than tall and the cover where
 * it is upright, changing as the shape does; with less motion asked for, or on a site that turns
 * the turntable off, it is the cover in every shape. Runs in desktop Chromium.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../helpers/views' );
const { own } = require( '../helpers/own' );
const { playerSite, audioState } = require( '../helpers/site' );
const { stopsAndStarts } = require( '../helpers/turntable' );

const made = own();

// How far the stylus is from the record's centre, as a share of its radius: the end of the arm's
// tube, at the stylus, as drawn on the screen, against the record's own box (its grooves turn
// inside it).
const stylus = ( page ) =>
	page.evaluate( () => {
		const record = document.querySelector( '.riff-record' ).getBoundingClientRect();
		const grip = document.querySelector( '.riff-arm-grip' );
		const p = grip.getPointAtLength( grip.getTotalLength() );
		const at = new DOMPoint( p.x, p.y ).matrixTransform( grip.getScreenCTM() );
		const r = record.width / 2;
		return Math.hypot( at.x - record.left - r, at.y - record.top - r ) / r;
	} );
// The platter's turn, in degrees a second, from the record's own animation.
const turning = ( page ) =>
	page.locator( '.riff-wax' ).evaluate( ( el ) => {
		const turn = el.getAnimations()[ 0 ];
		return turn ? ( 360000 / turn.effect.getTiming().duration ) * turn.playbackRate : 0;
	} );
// A 12-inch side's grooves run from 97% of the radius at the lead-in to 40% at the lead-out, its
// playing time evenly across them.
const groove = ( played ) => 0.97 - ( 0.97 - 0.4 ) * played;

// The music stopped and the arm still, so a hand can find it where it is drawn.
async function still( page ) {
	await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
	await page.locator( ':is(.riff-bar, .riff-keys) [data-riff-action="toggle"]:visible' ).click();
	await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( true );
	await page.evaluate( () =>
		Promise.all( document.querySelector( '.riff-arm-tube' ).getAnimations().map( ( a ) => a.finished ) )
	);
}

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
		// With motion: without it the album is the cover.
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		// The needle down, and the hand that carried the arm and the record there done moving.
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-down', '' );
		await page.evaluate( () =>
			Promise.all(
				[ '.riff-arm-tube', '.riff-record' ].flatMap( ( q ) => document.querySelector( q ).getAnimations().map( ( a ) => a.finished ) )
			)
		);
	} );

	test( 'where a graphics card draws WebGL2 the deck is drawn and the page\'s own stops painting, and elsewhere the page\'s own is the deck', async ( { page } ) => {
		const root = page.locator( '#riff' );
		const painted = () => page.locator( '.riff-stage > .riff-record' ).evaluate( ( el ) => getComputedStyle( el ).backgroundImage !== 'none' );
		// As this browser is: with no card to draw it, as on a test machine, the page's deck paints as it always has.
		const card = await page.evaluate( () => {
			const gl = document.createElement( 'canvas' ).getContext( 'webgl2', { failIfMajorPerformanceCaveat: true } );
			const names = gl?.getExtension( 'WEBGL_debug_renderer_info' );
			return !! gl && ! ( names && /swiftshader|llvmpipe|software|basic render/i.test( gl.getParameter( names.UNMASKED_RENDERER_WEBGL ) ) );
		} );
		await expect.poll( () => root.evaluate( ( el ) => 'riffGl' in el.dataset ) ).toBe( card );
		await expect.poll( painted ).toBe( ! card );
		// As if it had one, its name kept to itself: the deck is drawn, and the page's record is still there to be moved and read, unpainted.
		await page.addInitScript( () => {
			const extension = WebGL2RenderingContext.prototype.getExtension;
			WebGL2RenderingContext.prototype.getExtension = function( name ) {
				return name === 'WEBGL_debug_renderer_info' ? null : extension.call( this, name );
			};
		} );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( root ).toHaveAttribute( 'data-riff-gl', '' );
		await expect( page.locator( '.riff-deck-gl' ) ).toHaveCount( 1 );
		expect( await painted() ).toBe( false );
	} );

	test( 'a mouse over the grooves says the band and the moment under it, and a press puts the needle down in that groove', async ( { page } ) => {
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		const tip = page.locator( '.riff-cue-tip' );
		// Halfway through the side, straight left of the spindle, clear of the arm.
		const out = groove( 0.5 );
		// Where the record is once it has come to rest on the platter, and once the side's tracks
		// are known: the first look may be ahead of either.
		let box, middle, at;
		await expect( async () => {
			box = await page.locator( '.riff-cue' ).boundingBox();
			middle = [ box.x + box.width / 2, box.y + box.height / 2 ];
			at = [ middle[ 0 ] - ( out * box.width ) / 2, middle[ 1 ] ];
			await page.mouse.move( at[ 0 ], at[ 1 ] + 1 );
			await page.mouse.move( ...at );
			await expect( tip ).toBeVisible( { timeout: 500 } );
			expect( await page.locator( '.riff-cue' ).boundingBox() ).toEqual( box );
		} ).toPass();
		await expect( tip ).toHaveText( /^A\d+ .+ · \d+:\d\d$/ );
		// On the label there is no groove to say.
		await page.mouse.move( middle[ 0 ] - box.width * 0.1, middle[ 1 ] );
		await expect( tip ).toBeHidden();
		// Pressed, the stylus comes to rest in the groove pressed.
		await page.mouse.click( ...at );
		await expect.poll( () => stylus( page ) ).toBeCloseTo( out, 1 );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
	} );

	test( 'the record stops where it stops, and stays there while Now Playing closes and opens', async ( { page } ) => {
		const angle = () => page.locator( '.riff-wax' ).evaluate( ( el ) => parseFloat( getComputedStyle( el ).rotate ) || 0 );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		await expect.poll( angle ).toBeGreaterThan( 20 );
		await page.locator( ':is(.riff-bar, .riff-keys) [data-riff-action="toggle"]:visible' ).click();
		await expect.poll( () => turning( page ), { timeout: 5000 } ).toBe( 0 );
		const stopped = await angle();
		expect( stopped ).toBeGreaterThan( 0 );
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		expect( await angle() ).toBeCloseTo( stopped, 1 );
	} );

	test( 'the needle rides the groove the music is at, and the platter turns at 33⅓ times the music\'s speed', async ( { page } ) => {
		const root = page.locator( '#riff' );
		const arm = page.locator( '.riff-arm' );
		await expect( arm ).toHaveAttribute( 'data-riff-down', '' );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		// The album's three tracks are one side of an LP, its label listing them.
		await expect( page.locator( '.riff-label small' ) ).toHaveText( 'A · 33⅓' );
		await expect( root ).toHaveAttribute( 'data-riff-format', '12' );
		const lengths = await page.evaluate( () => window.riff.queue().map( ( t ) => t.duration ) );
		await expect( page.locator( '.riff-label-tracks li' ) ).toHaveCount( lengths.length );
		const side = lengths.reduce( ( a, b ) => a + b, 0 );
		// The label is the record's: the post it is pressed from, its artist, in the cover's colour.
		await expect( page.locator( '.riff-label b' ) ).toHaveText( await page.evaluate( () => window.riff.current().post.title ) );
		await expect( page.locator( '.riff-label i' ) ).toHaveText( await page.evaluate( () => window.riff.current().artist ) );
		expect( await root.evaluate( ( el ) => el.style.getPropertyValue( '--riff-label-paper' ) ) ).toMatch( /^rgb\(/ );

		// At 33⅓, 200° a second, with the music at its own speed, and the strobe's 33⅓ row, its dots
		// a flash apart, standing still.
		await expect.poll( () => turning( page ) ).toBeCloseTo( 200, 0 );
		const strobe = () => page.locator( '.riff-strobe-lamp i' ).first().evaluate( ( el ) => el.getAnimations()[ 0 ]?.playbackRate );
		await expect.poll( strobe ).toBeCloseTo( 0, 3 );
		// The arm crosses the side in the side's time, at the music's speed.
		const sweep = () =>
			arm.evaluate( ( el ) =>
				el.getAnimations().map( ( a ) => ( { length: a.effect.getTiming().duration, rate: a.playbackRate } ) ).find( ( a ) => a.length > 1000 )
			);
		await expect.poll( async () => ( await sweep() )?.length ).toBeCloseTo( side * 1000, -1 );
		// The listener's own speed moves the platter, the strobe and the arm with the music.
		await page.evaluate( () => window.riff.speed( 0.8 ) );
		await expect.poll( () => turning( page ) ).toBeCloseTo( 160, 0 );
		await expect.poll( async () => ( await sweep() )?.rate ).toBeCloseTo( 0.8, 2 );
		await expect.poll( strobe ).not.toBeCloseTo( 0, 3 );
		await page.evaluate( () => window.riff.speed( 1 ) );
		await expect.poll( () => turning( page ) ).toBeCloseTo( 200, 0 );

		// Stopped, the needle stays in its groove; wherever the music is put, it is in the groove that
		// moment is cut at: the lead-in at the side's start, each track's band where the one before
		// it ends, and the lead-out at the side's end, never on the label.
		await page.locator( ':is(.riff-bar, .riff-keys) [data-riff-action="toggle"]:visible' ).click();
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( true );
		const at = async ( track, seconds ) => {
			if ( track !== ( await page.evaluate( () => window.riff.queue().indexOf( window.riff.current() ) ) ) ) {
				await page.evaluate( ( k ) => window.riff.play( window.riff.queue(), k ), track );
				await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
				await expect( arm ).toHaveAttribute( 'data-riff-down', '' );
				await page.locator( ':is(.riff-bar, .riff-keys) [data-riff-action="toggle"]:visible' ).click();
				await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( true );
			}
			await page.evaluate( ( t ) => window.riff.seek( t ), seconds );
			const played = ( lengths.slice( 0, track ).reduce( ( a, b ) => a + b, 0 ) + seconds ) / side;
			await expect.poll( () => stylus( page ), { message: `track ${ track + 1 } at ${ seconds }s` } ).toBeCloseTo( groove( played ), 2 );
		};
		await at( 0, 0 );
		await at( 0, lengths[ 0 ] / 2 );
		await at( 1, 0 );
		await at( 2, lengths[ 2 ] / 3 );
		await at( 2, lengths[ 2 ] - 0.5 );
		const label = await page.evaluate(
			() => document.querySelector( '.riff-label' ).offsetWidth / document.querySelector( '.riff-record' ).offsetWidth
		);
		expect( groove( 1 ) ).toBeGreaterThan( label );
	} );

	test( 'the sleeve puts the record away, and plays it again', async ( { page } ) => {
		// With motion, so the record is seen set down.
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		const root = page.locator( '#riff' );
		const sleeve = page.locator( '.riff-sleeve' );
		await expect( sleeve ).toHaveText( 'Put the record away' );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		// Out, the deck stands alone: the sleeve is away, and its button puts the record back in it.
		await expect( page.locator( '.riff-cover' ) ).toHaveCSS( 'opacity', '0' );
		await sleeve.focus();
		await page.keyboard.press( 'Enter' );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-cover' ) ).toHaveCSS( 'opacity', '1' );
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
		await still( page );
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
		await still( page );
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
		const toggle = page.locator( ':is(.riff-bar, .riff-keys) [data-riff-action="toggle"]:visible' ).first();
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
		await openView( page, 'album' );
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
		const toggle = page.locator( ':is(.riff-bar, .riff-keys) [data-riff-action="toggle"]:visible' ).first();
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

	test( 'the music is heard only with the stylus down, the arm lifts only once it has stopped, and the platter turns at the music\'s rate each frame', async ( { page } ) => {
		await stopsAndStarts( page );
	} );

	test( 'shown while the music plays, the record is already turning with the stylus in its groove', async ( { page } ) => {
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		const lengths = await page.evaluate( () => window.riff.queue().map( ( t ) => t.duration ) );
		const side = lengths.reduce( ( a, b ) => a + b, 0 );
		// Narrowed to upright the album is the cover; widened again mid-song, the turntable.
		await page.setViewportSize( { width: 700, height: 900 } );
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		const rate = () => page.evaluate( () => document.querySelector( '.riff-audio' ).playbackRate );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		// In its first frames: down, where the music is, the platter at speed, the music untouched.
		const first = await page.evaluate( () => {
			const arm = document.querySelector( '.riff-arm' );
			const record = document.querySelector( '.riff-record' ).getBoundingClientRect();
			const grip = document.querySelector( '.riff-arm-grip' );
			const p = grip.getPointAtLength( grip.getTotalLength() );
			const at = new DOMPoint( p.x, p.y ).matrixTransform( grip.getScreenCTM() );
			const r = record.width / 2;
			return {
				down: 'riffDown' in arm.dataset,
				radius: Math.hypot( at.x - record.left - r, at.y - record.top - r ) / r,
				time: document.querySelector( '.riff-audio' ).currentTime,
				running: document.querySelector( '.riff-wax' ).getAnimations()[ 0 ].playbackRate > 0,
			};
		} );
		expect( first.down ).toBe( true );
		expect( first.running ).toBe( true );
		expect( first.radius ).toBeCloseTo( groove( first.time / side ), 2 );
		expect( await rate() ).toBe( 1 );
		expect( ( await audioState( page ) ).paused ).toBe( false );
	} );
} );

test.describe( 'The album, by Now Playing\'s shape', () => {
	test.beforeEach( async ( {}, info ) => {
		test.skip( info.project.name !== 'chromium', 'Resized in desktop Chromium.' );
	} );

	test( 'upright it is the cover, wide it is the turntable with the needle down, and it changes as the shape does', async ( { page } ) => {
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.setViewportSize( { width: 390, height: 844 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await openView( page, 'album' );
		const root = page.locator( '#riff' );
		const arm = page.locator( '.riff-arm' );
		// One button for the album, whatever its shape.
		await expect( page.locator( '[data-riff-control="turntable"], [data-riff-chip="turntable"]' ) ).toHaveCount( 0 );
		await expect( root ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( page.locator( '.riff-cover' ) ).toBeVisible();
		await expect( page.locator( '.riff-record' ) ).toBeHidden();
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		// Wide, as a computer's window: the record out, and the needle in its groove as it plays.
		await page.setViewportSize( { width: 1440, height: 900 } );
		await expect( root ).not.toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( arm ).toHaveAttribute( 'data-riff-down', '' );
		await expect.poll( () => arm.evaluate( ( el ) => parseFloat( getComputedStyle( el ).rotate ) ) ).toBeGreaterThan( 0 );
		await expect( page.locator( '.riff-sleeve' ) ).toBeVisible();
		// Narrowed to upright, the record goes back in its sleeve and the cover stands alone.
		await page.setViewportSize( { width: 700, height: 900 } );
		await expect( root ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-cover' ) ).toBeVisible();
		await expect( page.locator( '.riff-record' ) ).toBeHidden();
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
	} );

	test( 'with less motion asked for it is the cover, wide too, and the turntable once motion is wanted', async ( { page } ) => {
		await page.emulateMedia( { reducedMotion: 'reduce' } );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await openView( page, 'album' );
		const root = page.locator( '#riff' );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		await expect( root ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-cover' ) ).toBeVisible();
		await expect( page.locator( '.riff-mount' ) ).toBeHidden();
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
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
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
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
				// As Library::pressing() has it, from those discs.
				post.pressing = {
					format: '12',
					sides: [
						{ from: 0, to: 1, start: 0, length: post.tracks[ 0 ].duration, record: 0, name: 'A' },
						{ from: 1, to: post.tracks.length, start: post.tracks[ 0 ].duration, length: post.tracks.slice( 1 ).reduce( ( a, t ) => a + t.duration, 0 ), record: 1, name: 'B' },
					],
				};
				await route.fulfill( { response, json: post } );
			}
		);
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		// Disc 1 is one track, so the first side of its record holds it alone.
		await expect( page.locator( '.riff-label small' ) ).toHaveText( 'A · 33⅓' );
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'aria-valuemax', '1' );
		await expect
			.poll( () => page.locator( '.riff-record' ).evaluate( ( el ) => el.style.getPropertyValue( '--riff-bands' ) ) )
			.toContain( 'rgb(255 255 255 / 0.060)' );
	} );

	test( 'a single is a 45: the platter turns 270° a second, and the strobe\'s 45 row stands still', async ( { page }, info ) => {
		test.skip( info.project.name !== 'chromium', 'The turntable stands on a wide stage.' );
		// The album's track list says it is the one track, so it is pressed as a 7-inch single.
		await page.route(
			( url ) => decodeURIComponent( url.href ).includes( 'riff/v1/library/' ),
			async ( route ) => {
				const response = await route.fetch();
				const post = await response.json();
				post.tracks = ( post.tracks || [] ).slice( 0, 1 );
				post.pressing = {
					format: '7',
					sides: [ { from: 0, to: 1, start: 0, length: post.tracks[ 0 ]?.duration || 0, record: 0, name: 'A' } ],
				};
				await route.fulfill( { response, json: post } );
			}
		);
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-format', '7' );
		await expect( page.locator( '.riff-label small' ) ).toHaveText( 'A · 45' );
		await expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
		await expect.poll( () => turning( page ) ).toBeCloseTo( 270, 0 );
		await expect
			.poll( () => page.locator( '.riff-strobe-lamp i' ).nth( 1 ).evaluate( ( el ) => el.getAnimations()[ 0 ]?.playbackRate ) )
			.toBeCloseTo( 0, 3 );
	} );
} );
