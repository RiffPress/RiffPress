/**
 * The turntable does things in the order a turntable must, or it stops being one: every frame of
 * each way the deck is played goes through realityHolds() (helpers/turntable.js). Started and
 * stopped from its key, carried to the next band and the one before, moved by the hand that takes
 * the arm by its grip, and cued by a press on the grooves. Run on the deck's control layer, which
 * keeps all of the turntable's state with or without a graphics card, so it runs everywhere, CI's
 * browsers too. And where nothing can draw the deck, Now Playing is the cover on its own: the
 * page's own deck is never painted. Runs in desktop Chromium.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../helpers/views' );
const { own } = require( '../helpers/own' );
const { playerSite, audioState } = require( '../helpers/site' );
const { controlLayer, drawnWithoutPixels, sampled, realityHolds, onScreen, groove, still, onArm, onRecord } = require( '../helpers/turntable' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

const playing = async ( page ) => expect.poll( async () => ( await audioState( page ) ).paused ).toBe( false );
const toggle = ( page ) => page.locator( '.riff-keys [data-riff-action="toggle"]' );
// The cue lever's moves, each change of it once, from the frames given.
const lever = ( frames ) => frames.map( ( f ) => f.up ).filter( ( up, i, list ) => i === 0 || up !== list[ i - 1 ] );
// A groove of the record, a share of its radius out, straight left of the spindle, on the screen.
const grooveAt = async ( page, out ) => {
	const box = await page.locator( '.riff-cue' ).boundingBox();
	const [ at ] = await onScreen( page, [ [ box.x + box.width / 2 - ( out * box.width ) / 2, box.y + box.height / 2 ] ], 'record' );
	return at;
};
// Frames until the music is heard again and has played a moment.
const untilHeard = async ( page, take ) => {
	await playing( page );
	await page.evaluate( () => new Promise( ( done ) => setTimeout( done, 200 ) ) );
	return take();
};

test.describe( 'The order of things', () => {
	test.use( { viewport: { width: 1440, height: 900 } } );

	test.beforeEach( async ( { page }, info ) => {
		test.skip( info.project.name !== 'chromium', 'The turntable stands on a wide stage.' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await controlLayer( page );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-down', '' );
		await page.evaluate( () =>
			Promise.all( [ '.riff-arm-tube', '.riff-record' ].flatMap( ( q ) => document.querySelector( q ).getAnimations().map( ( a ) => a.finished.catch( () => {} ) ) ) )
		);
		await playing( page );
		await expect.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).currentTime ) ).toBeGreaterThan( 0.5 );
	} );

	test( 'start: the lever lowers the stylus, the platter comes up, and only then the music, rising with it', async ( { page } ) => {
		await still( page );
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-up', '' );
		const take = await sampled( page );
		await toggle( page ).click();
		await playing( page );
		await expect.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).playbackRate ) ).toBe( 1 );
		const frames = await untilHeard( page, take );
		realityHolds( frames );
		expect( lever( frames ), 'lowered, then down' ).toEqual( [ '', 'lowering', null ] );
		expect( frames.find( ( f ) => f.heard ).rate, 'heard first below speed' ).toBeLessThan( 0.5 );
	} );

	test( 'stop: the music winds down with the stylus in its groove, and the lever lifts it once the platter rests', async ( { page } ) => {
		const take = await sampled( page );
		await toggle( page ).click();
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-up', '' );
		const frames = await take();
		realityHolds( frames );
		expect( lever( frames ), 'lifted once, at the end' ).toEqual( [ null, '' ] );
		expect( frames.some( ( f ) => f.paused && f.coasting && f.up === null ), 'still down as the platter comes to rest' ).toBe( true );
	} );

	for ( const [ key, before ] of [ [ 'next', [] ], [ 'prev', [ 'next' ] ] ] ) {
		test( `${ key === 'next' ? 'next' : 'previous' }: the music stops as the lever lifts, the arm is carried to the band, lowered, and only then heard`, async ( { page } ) => {
			for ( const first of before ) {
				const from = await page.evaluate( () => document.querySelector( '.riff-audio' ).currentSrc );
				await page.locator( `.riff-key-${ first }` ).click();
				await expect.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).currentSrc ) ).not.toBe( from );
				await playing( page );
				await expect( page.locator( '.riff-arm' ) ).not.toHaveAttribute( 'data-riff-up' );
			}
			const from = await page.evaluate( () => document.querySelector( '.riff-audio' ).currentSrc );
			const take = await sampled( page );
			await page.locator( `.riff-key-${ key }` ).click();
			await expect.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).currentSrc ) ).not.toBe( from );
			const frames = await untilHeard( page, take );
			realityHolds( frames );
			expect( lever( frames ), 'lifted once, lowered once' ).toEqual( [ null, '', 'lowering', null ] );
		} );
	}

	test( 'the hand: picked up the music is gone at once, carried it is silent, set down on a groove it plays from there, and set down off the record it stays silent', async ( { page } ) => {
		const take = await sampled( page );
		const grip = await onArm( page );
		await page.mouse.move( grip.x, grip.y );
		await page.mouse.down();
		// Over the spinning record, and down on a groove halfway into the side.
		await page.mouse.move( ...( await onRecord( page, 0.5, 0.2 ) ), { steps: 8 } );
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-held', '' );
		expect( ( await audioState( page ) ).paused, 'silent in the hand' ).toBe( true );
		await page.mouse.move( grip.x - 30, grip.y + 12, { steps: 8 } );
		await page.mouse.up();
		const set = await untilHeard( page, take );
		realityHolds( set );
		const touchdown = set.findIndex( ( f, i ) => i > 0 && set[ i - 1 ].held && ! f.held );
		const heard = set.findIndex( ( f, i ) => i > touchdown && f.heard );
		expect( touchdown, 'set down' ).toBeGreaterThan( 0 );
		expect( set.slice( set.findIndex( ( f ) => f.held ), touchdown ).every( ( f ) => f.paused ), 'silent from the moment it was picked up' ).toBe( true );
		expect( heard, 'heard only after it was set down' ).toBeGreaterThan( touchdown );
		expect( Math.abs( set[ heard ].r - set[ touchdown ].r ), 'heard from the groove it was set down in' ).toBeLessThan( 0.02 );
		expect( set[ touchdown ].r, 'set down mid-side, clear of the run-out' ).toBeGreaterThan( 0.55 );

		// Taken again and let go beyond the record: back on its rest, and nothing heard.
		const again = await onArm( page );
		await page.mouse.move( again.x, again.y );
		await page.mouse.down();
		await page.mouse.move( ...( await onRecord( page, 1.35, 0.55 ) ), { steps: 8 } );
		await page.mouse.up();
		await expect( page.locator( '.riff-arm' ) ).not.toHaveAttribute( 'data-riff-held', '' );
		await page.evaluate( () => new Promise( ( done ) => setTimeout( done, 1200 ) ) );
		const away = await take();
		realityHolds( away );
		expect( away.slice( away.findIndex( ( f ) => f.held ) ).every( ( f ) => ! f.heard ), 'silent from the pick-up on, off the record' ).toBe( true );
		await expect( page.locator( '.riff-arm' ) ).not.toHaveAttribute( 'data-riff-down', '' );

		// Started again from there: lifted, carried back over the groove, lowered, then heard.
		await toggle( page ).click();
		const back = await untilHeard( page, take );
		realityHolds( back );
		expect( lever( back ).filter( ( up ) => up !== null ), 'lifted once, lowered once' ).toEqual( [ '', 'lowering' ] );
	} );

	test( 'the grooves: a press lifts the arm, carries it at a hand\'s pace, lowers it, and the music is heard from there; pressed again on the way, lifted once and lowered once', async ( { page } ) => {
		const tip = page.locator( '.riff-cue-tip' );
		const halfway = await grooveAt( page, groove( 0.5 ) );
		await page.mouse.move( halfway[ 0 ], halfway[ 1 ] + 1 );
		await page.mouse.move( ...halfway );
		await expect( tip ).toBeVisible();
		const take = await sampled( page );
		await page.mouse.click( ...halfway );
		const once = await untilHeard( page, take );
		realityHolds( once );
		expect( lever( once ), 'lifted, lowered, down' ).toEqual( [ null, '', 'lowering', null ] );
		const lifted = once.findIndex( ( f ) => f.up === '' );
		const lowering = once.findIndex( ( f ) => f.up === 'lowering' );
		expect( once[ lowering ].at - once[ lifted ].at, 'carried at a hand\'s pace, not at once' ).toBeGreaterThanOrEqual( 300 );
		expect( once.slice( lifted ).find( ( f ) => f.heard ).r, 'heard from the groove pressed' ).toBeCloseTo( groove( 0.5 ), 1 );

		// Two presses, the second while the arm is on its way to the first.
		const near = await grooveAt( page, groove( 0.15 ) );
		const far = await grooveAt( page, groove( 0.85 ) );
		await page.mouse.move( ...near );
		await take();
		await page.mouse.click( ...near );
		await page.evaluate( () => new Promise( ( done ) => setTimeout( done, 150 ) ) );
		await page.mouse.move( ...far );
		await page.mouse.click( ...far );
		const twice = await untilHeard( page, take );
		realityHolds( twice );
		expect( lever( twice ).filter( ( up, i ) => i > 0 || up !== null ), 'lifted once, lowered once' ).toEqual( [ '', 'lowering', null ] );
		expect( twice.slice( twice.findIndex( ( f ) => f.up === 'lowering' ) ).find( ( f ) => f.heard )?.r, 'heard from the second groove pressed' ).toBeCloseTo( groove( 0.85 ), 1 );
	} );
} );

// The page's record painted, or its plinth, platter, spindle or keys: never, drawn or not.
const painted = ( page ) =>
	page.evaluate( () => {
		const record = document.querySelector( '.riff-stage > .riff-record' );
		const plinth = document.querySelector( '.riff-plinth' );
		const key = document.querySelector( '.riff-key-start' );
		return (
			getComputedStyle( record ).backgroundImage !== 'none' ||
			getComputedStyle( record ).boxShadow !== 'none' ||
			[ '::before', '::after' ].some( ( p ) => ! [ 'none', 'normal' ].includes( getComputedStyle( plinth, p ).content ) ) ||
			getComputedStyle( key ).backgroundImage !== 'none'
		);
	} );

async function album( page ) {
	await page.emulateMedia( { reducedMotion: 'no-preference' } );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await openView( page, 'album' );
}

test.describe( 'Where nothing can draw the deck', () => {
	test.use( { viewport: { width: 1440, height: 900 } } );

	test.beforeEach( async ( {}, info ) => {
		test.skip( info.project.name !== 'chromium', 'The turntable stands on a wide stage.' );
	} );

	test( 'Now Playing is the cover on its own, as a site without a turntable has it', async ( { page } ) => {
		await album( page );
		const card = await page.evaluate( () => {
			const gl = document.createElement( 'canvas' ).getContext( 'webgl2', { failIfMajorPerformanceCaveat: true } );
			const names = gl?.getExtension( 'WEBGL_debug_renderer_info' );
			return !! gl && ! ( names && /swiftshader|llvmpipe|software|basic render/i.test( gl.getParameter( names.UNMASKED_RENDERER_WEBGL ) ) );
		} );
		test.skip( card, 'A graphics card draws the deck in this browser.' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( page.locator( '.riff-stage > .riff-cover' ) ).toBeVisible();
		await expect( page.locator( '.riff-keys' ) ).toBeHidden();
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute( 'data-riff-gl', '' );
	} );

	test( 'drawn, the page\'s deck is never painted; its context lost, the cover on its own until it is back', async ( { page } ) => {
		await drawnWithoutPixels( page );
		await album( page );
		const root = page.locator( '#riff' );
		await expect( root ).toHaveAttribute( 'data-riff-gl', '' );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
		expect( await painted( page ), 'the page\'s deck unpainted' ).toBe( false );
		await page.evaluate( () => {
			window.riffLose = document.querySelector( '.riff-deck-gl' ).getContext( 'webgl2' ).getExtension( 'WEBGL_lose_context' );
			window.riffLose.loseContext();
		} );
		await expect( root ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( page.locator( '.riff-stage > .riff-cover' ) ).toBeVisible();
		expect( await painted( page ), 'nor once it is lost' ).toBe( false );
		await page.evaluate( () => window.riffLose.restoreContext() );
		await expect( root ).not.toHaveAttribute( 'data-riff-turntable' );
		await expect( root ).toHaveAttribute( 'data-riff-gl', '' );
	} );
} );
