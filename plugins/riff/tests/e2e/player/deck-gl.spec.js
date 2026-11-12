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

// Whether the keys are along the front of the plinth, under the record, or beside the arm.
const front = ( page ) =>
	page.evaluate( () => document.querySelector( '.riff-keys button' ).getBoundingClientRect().top > document.querySelector( '.riff-stage > .riff-record' ).getBoundingClientRect().bottom );

const sizes = ( title, list, touch ) =>
	test.describe( title, () => {
		test.use( { viewport: list[ 0 ].size, isMobile: touch, hasTouch: touch } );

		test( 'the deck is the one WebGL draws', async ( { page }, info ) => {
			test.skip( info.project.name !== 'chromium', 'Measured in desktop Chromium.' );
			await page.goto( postUrl );
			// As deck-gl.js asks: WebGL2 from a graphics card, not drawn in software.
			const card = await page.evaluate( () => {
				const gl = document.createElement( 'canvas' ).getContext( 'webgl2', { failIfMajorPerformanceCaveat: true } );
				const names = gl?.getExtension( 'WEBGL_debug_renderer_info' );
				return !! gl && ! ( names && /swiftshader|llvmpipe|software|basic render/i.test( gl.getParameter( names.UNMASKED_RENDERER_WEBGL ) ) );
			} );
			test.skip( ! card, 'No graphics card draws WebGL2 in this browser.' );
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
