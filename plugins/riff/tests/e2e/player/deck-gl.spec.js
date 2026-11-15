/**
 * Where the browser can draw in WebGL2, the deck is the one WebGL draws at every size the turntable
 * shows at: a laptop's window as much as a large screen, with its keys along the front, and a phone
 * on its side, with them beside the arm. Skipped where no graphics card draws WebGL2 for the test
 * browser, as for headless Chromium without a GPU; the page's own deck is then the deck, which
 * deck-sizes.spec.js measures. Run it with a GPU (headed, or with --use-angle=metal) to see it.
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

// As deck-gl.js asks: WebGL2 from a graphics card, not drawn in software.
const card = ( page ) =>
	page.evaluate( () => {
		const gl = document.createElement( 'canvas' ).getContext( 'webgl2', { failIfMajorPerformanceCaveat: true } );
		const names = gl?.getExtension( 'WEBGL_debug_renderer_info' );
		return !! gl && ! ( names && /swiftshader|llvmpipe|software|basic render/i.test( gl.getParameter( names.UNMASKED_RENDERER_WEBGL ) ) );
	} );

// Where the eye is (deck-gl.js): over the deck, across it from the chair, or on its way.
const eye = ( page ) => page.locator( '.riff-deck-gl' );

// Opens the album's Now Playing with the record out, on a graphics card, or skips.
async function opened( page, info ) {
	test.skip( info.project.name !== 'chromium', 'Measured in desktop Chromium.' );
	await page.goto( postUrl );
	test.skip( ! ( await card( page ) ), 'No graphics card draws WebGL2 in this browser.' );
	await page.emulateMedia( { reducedMotion: 'no-preference' } );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-gl', '' );
}

// Whether the keys are along the front of the plinth, under the record, or beside the arm.
const front = ( page ) =>
	page.evaluate( () => document.querySelector( '.riff-keys button' ).getBoundingClientRect().top > document.querySelector( '.riff-stage > .riff-record' ).getBoundingClientRect().bottom );

const sizes = ( title, list, touch ) =>
	test.describe( title, () => {
		test.use( { viewport: list[ 0 ].size, isMobile: touch, hasTouch: touch } );

		test( 'the deck is the one WebGL draws', async ( { page }, info ) => {
			test.skip( info.project.name !== 'chromium', 'Measured in desktop Chromium.' );
			await page.goto( postUrl );
			test.skip( ! ( await card( page ) ), 'No graphics card draws WebGL2 in this browser.' );
			await page.emulateMedia( { reducedMotion: 'no-preference' } );
			await page.locator( '.riff-row' ).nth( 0 ).click();
			await page.locator( '.riff-bar-info' ).click();
			const root = page.locator( '#riff' );
			for ( const { size, keys } of list ) {
				const at = `${ size.width }×${ size.height }`;
				await page.setViewportSize( size );
				await expect( root, at ).toHaveAttribute( 'data-riff-deck', 'out' );
				await expect( root, `${ at }: drawn in WebGL` ).toHaveAttribute( 'data-riff-gl', '' );
				await expect( page.locator( '.riff-deck-gl' ), `${ at }: the canvas shown` ).toBeVisible();
				await expect.poll( () => front( page ), `${ at }: the keys ${ keys }` ).toBe( keys === 'along the front' );
				// From the chair, the whole plinth inside the stage: its sides and its foot clear of the
				// stage's edges (the sleeve above may be cropped by the top).
				if ( ! touch ) {
					await page.mouse.move( 0, 0 );
				}
				await expect( eye( page ), `${ at }: back in the chair` ).toHaveAttribute( 'data-riff-camera', 'across' );
				const fits = await page.evaluate( () => {
					const [ left, , right, bottom ] = document.querySelector( '.riff-deck-gl' ).dataset.riffDeckBox.split( ' ' ).map( Number );
					const stage = document.querySelector( '.riff-stage' ).getBoundingClientRect();
					return { left: left - stage.left, right: stage.right - right, bottom: stage.bottom - bottom };
				} );
				for ( const [ side, clear ] of Object.entries( fits ) ) {
					expect( clear, `${ at }: the plinth's ${ side } inside the stage` ).toBeGreaterThanOrEqual( 8 );
				}
			}
		} );
	} );

// The owner's windows: a wide, short laptop window, and a large screen.
sizes(
	'With a mouse',
	[
		{ size: { width: 1000, height: 540 }, keys: 'along the front' },
		{ size: { width: 2000, height: 1070 }, keys: 'along the front' },
		{ size: { width: 1280, height: 720 }, keys: 'along the front' },
		{ size: { width: 800, height: 420 }, keys: 'beside the arm' },
	],
	false
);
sizes( 'On a touch screen on its side', [ { size: { width: 844, height: 390 }, keys: 'beside the arm' } ], true );

test.describe( 'The first deck seen', () => {
	test.use( { viewport: { width: 1280, height: 720 } } );

	test( 'is the one WebGL draws: the page\'s own is never painted before it', async ( { page }, info ) => {
		// Every frame from the start: whether the page's deck is painted (its record's grooves, the
		// plinth's top), and whether the drawn one has drawn.
		await page.addInitScript( () => {
			window.riffSeen = [];
			const sample = () => {
				const root = document.querySelector( '#riff' );
				const np = document.querySelector( '.riff-np' );
				const record = document.querySelector( '.riff-stage > .riff-record' );
				const plinth = document.querySelector( '.riff-plinth' );
				if ( root && np && ! np.hidden && record && root.dataset.riffTurntable !== 'off' && record.getBoundingClientRect().width ) {
					window.riffSeen.push( {
						drawn: 'riffGl' in root.dataset,
						painted: getComputedStyle( record ).backgroundImage !== 'none' || getComputedStyle( plinth, '::before' ).content !== 'none',
					} );
				}
				requestAnimationFrame( sample );
			};
			requestAnimationFrame( sample );
		} );
		await opened( page, info );
		const seen = await page.evaluate( () => window.riffSeen );
		expect( seen.length, 'frames of the deck seen' ).toBeGreaterThan( 0 );
		expect( seen.filter( ( f ) => f.painted && ! f.drawn ), 'frames with the page\'s deck painted before the drawn one' ).toEqual( [] );
	} );
} );

test.describe( 'The eye, with a mouse', () => {
	test.use( { viewport: { width: 1280, height: 720 } } );

	test( 'sits back across the deck, and comes over it for a hand reaching for it and the keyboard', async ( { page }, info ) => {
		await opened( page, info );
		await page.mouse.move( 4, 360 );
		await expect( eye( page ), 'at rest, back in the chair' ).toHaveAttribute( 'data-riff-camera', 'across' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-seat', '' );

		// The hand comes over the deck: the eye comes over it, and the arm is taken where it is seen.
		const grip = await page.locator( '.riff-arm-grip' ).evaluate( ( path ) => {
			const p = path.getPointAtLength( path.getTotalLength() * 0.85 );
			const at = new DOMPoint( p.x, p.y ).matrixTransform( path.getScreenCTM() );
			return { x: at.x, y: at.y };
		} );
		await page.mouse.move( grip.x, grip.y, { steps: 4 } );
		await expect( eye( page ), 'over the deck for the hand' ).toHaveAttribute( 'data-riff-camera', 'over' );
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute( 'data-riff-seat', '' );
		await page.mouse.down();
		await page.mouse.move( grip.x - 30, grip.y + 30, { steps: 4 } );
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-held', '' );
		await page.mouse.up();
		// The hand only resting on the deck: the eye goes back to the chair.
		await expect( eye( page ), 'back for a hand at rest' ).toHaveAttribute( 'data-riff-camera', 'across', { timeout: 6000 } );

		// Away from the deck, back to the chair; the keyboard at the tonearm, over it again.
		await page.mouse.move( 4, 360, { steps: 4 } );
		await expect( eye( page ) ).toHaveAttribute( 'data-riff-camera', 'across' );
		await page.keyboard.press( 'Shift' );
		await page.locator( '.riff-arm' ).focus();
		await expect( eye( page ), 'over the deck for the keyboard' ).toHaveAttribute( 'data-riff-camera', 'over' );
	} );
} );

test.describe( 'The eye, under a finger', () => {
	test.use( { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } );

	test( 'comes over the deck at the first touch, which does nothing else', async ( { page }, info ) => {
		await opened( page, info );
		await expect( eye( page ), 'at rest, back in the chair' ).toHaveAttribute( 'data-riff-camera', 'across' );
		const playing = await page.evaluate( () => ! document.querySelector( '.riff-audio' ).paused );
		const box = await page.locator( '.riff-plinth' ).boundingBox();
		await page.touchscreen.tap( box.x + box.width * 0.3, box.y + box.height * 0.5 );
		await expect( eye( page ), 'over the deck for the finger' ).toHaveAttribute( 'data-riff-camera', 'over' );
		await expect( page.locator( '.riff-np' ), 'Now Playing still open' ).toBeVisible();
		expect( await page.evaluate( () => ! document.querySelector( '.riff-audio' ).paused ), 'the music as it was' ).toBe( playing );
	} );
} );
